import OpenAI from "openai";
import type { z } from "zod";

/**
 * Groq via its OpenAI-compatible API. Server-side only — this module must never be imported
 * from a client component. Every caller passes a deterministic `fallback` so the product keeps
 * working with no key, a bad key, a rate limit, a timeout, or garbage JSON.
 */

const BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_CHAT_MODEL = "llama-3.3-70b-versatile";
const DEFAULT_STT_MODEL = "whisper-large-v3-turbo";

export type AiEngine = "groq" | "fallback" | "mock";
export type AiResult<T> = { data: T; engine: AiEngine; model?: string; error?: string };

let client: OpenAI | null = null;
let resolvedChatModel: string | null = null;
let resolvedSttModel: string | null = null;
let clientFactory: (() => OpenAI | null) | null = null;

export function groqEnabled(): boolean {
  if (process.env.GROQ_MOCK === "1") return true;
  return !!process.env.GROQ_API_KEY?.trim() && process.env.AI_DISABLED !== "1";
}
export function groqMocked(): boolean {
  return process.env.GROQ_MOCK === "1";
}

/** Tests inject a fake client here. */
export function __setGroqClientFactory(factory: (() => OpenAI | null) | null) {
  clientFactory = factory;
  client = null;
  resolvedChatModel = null;
  resolvedSttModel = null;
}

function getClient(): OpenAI | null {
  if (clientFactory) return clientFactory();
  if (!groqEnabled() || groqMocked()) return null;
  if (!client) {
    client = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: BASE_URL, maxRetries: 0, timeout: 30_000 });
  }
  return client;
}

function isRetryable(err: unknown): boolean {
  if (err instanceof OpenAI.APIConnectionTimeoutError) return true;
  if (err instanceof OpenAI.APIConnectionError) return true;
  if (err instanceof OpenAI.APIError) return err.status === 429 || (err.status ?? 0) >= 500;
  return false;
}

function isModelError(err: unknown): boolean {
  if (!(err instanceof OpenAI.APIError)) return false;
  const msg = `${err.message}`.toLowerCase();
  return (err.status === 400 || err.status === 404) && (msg.includes("model") || msg.includes("decommission"));
}

function describe(err: unknown): string {
  if (err instanceof OpenAI.APIConnectionTimeoutError) return "timed out";
  if (err instanceof OpenAI.RateLimitError) return "rate limited";
  if (err instanceof OpenAI.AuthenticationError) return "invalid GROQ_API_KEY";
  if (err instanceof OpenAI.APIError) return `Groq error ${err.status ?? ""}: ${err.message}`.trim();
  if (err instanceof Error) return err.message;
  return "unknown error";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * If the configured model is rejected (decommissioned, wrong name), pick the closest one Groq
 * currently serves. Chat: prefer the same family, then the largest general-purpose model.
 * STT: prefer whisper turbo. Never pick TTS/guard/embedding models.
 */
async function pickModel(kind: "chat" | "stt", wanted: string): Promise<string> {
  const c = getClient();
  if (!c) return wanted;
  try {
    const list = await c.models.list();
    const ids = list.data.map((m) => m.id);
    const family = wanted.split(/[-/]/)[0].toLowerCase();
    const isStt = (id: string) => /whisper/i.test(id);
    const isBad = (id: string) => /orpheus|tts|guard|safeguard|embed|vision|compound|allam/i.test(id);
    const candidates = ids.filter((id) => (kind === "stt" ? isStt(id) : !isStt(id) && !isBad(id)));
    if (candidates.length === 0) return wanted;
    const sameFamily = candidates.filter((id) => id.toLowerCase().includes(family));
    const pool = sameFamily.length ? sameFamily : candidates;
    return [...pool].sort((a, b) => score(b) - score(a))[0] ?? wanted;
  } catch {
    return wanted;
  }
  function score(id: string): number {
    let s = 0;
    if (/llama/i.test(id)) s += 4;
    if (/versatile/.test(id)) s += 5;
    if (/gpt-oss-120b/.test(id)) s += 6;
    if (/qwen/.test(id)) s += 3;
    const size = id.match(/(\d{2,3})b/);
    if (size) s += Math.min(5, Number(size[1]) / 30);
    if (/turbo/.test(id)) s += 2;
    if (/instant|mini|8b|20b/.test(id)) s -= 1;
    return s;
  }
}

function chatModel(): string {
  return resolvedChatModel ?? process.env.GROQ_MODEL?.trim() ?? DEFAULT_CHAT_MODEL;
}
function sttModel(): string {
  return resolvedSttModel ?? process.env.GROQ_STT_MODEL?.trim() ?? DEFAULT_STT_MODEL;
}

export interface ChatJsonOptions<T> {
  /** Short id for logs and the mock resolver ("extract_message"). */
  task: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  /** Deterministic result used when Groq is unavailable or returns something invalid. */
  fallback: () => T;
  temperature?: number;
  timeoutMs?: number;
  maxRetries?: number;
  maxTokens?: number;
}

/**
 * Ask Groq for JSON that validates against `schema`. Retries with backoff on 429/5xx/network,
 * times out, re-asks once on invalid JSON, and always returns *something* usable.
 */
export async function chatJson<T>(opts: ChatJsonOptions<T>): Promise<AiResult<T>> {
  if (groqMocked()) return { data: opts.fallback(), engine: "mock", model: "mock" };
  const c = getClient();
  if (!c) return { data: opts.fallback(), engine: "fallback", error: "AI not configured" };

  const maxRetries = opts.maxRetries ?? 3;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  let lastError = "";
  let invalidJsonRetried = false;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const model = chatModel();
      const res = await c.chat.completions.create(
        {
          model,
          temperature: opts.temperature ?? 0.1,
          max_tokens: opts.maxTokens ?? 1024,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: `${opts.system}\n\nRespond with a single JSON object and nothing else.` },
            { role: "user", content: opts.user },
          ],
        },
        { timeout: timeoutMs },
      );
      const text = res.choices[0]?.message?.content ?? "";
      let parsed: unknown;
      try {
        parsed = JSON.parse(stripFences(text));
      } catch {
        lastError = "model returned invalid JSON";
        if (!invalidJsonRetried) {
          invalidJsonRetried = true;
          continue; // one more try; the model is usually fine the second time
        }
        break;
      }
      const checked = opts.schema.safeParse(parsed);
      if (!checked.success) {
        lastError = `model JSON failed validation: ${checked.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`;
        if (!invalidJsonRetried) {
          invalidJsonRetried = true;
          continue;
        }
        break;
      }
      return { data: checked.data, engine: "groq", model };
    } catch (err) {
      lastError = describe(err);
      if (isModelError(err) && !resolvedChatModel) {
        resolvedChatModel = await pickModel("chat", chatModel());
        console.warn(`[ai:${opts.task}] model rejected, switching to ${resolvedChatModel}`);
        continue;
      }
      if (isRetryable(err) && attempt < maxRetries) {
        await sleep(Math.min(8000, 500 * 2 ** attempt) + Math.random() * 250);
        continue;
      }
      break;
    }
  }
  console.warn(`[ai:${opts.task}] falling back: ${lastError}`);
  return { data: opts.fallback(), engine: "fallback", error: lastError };
}

function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m ? m[1] : s).trim();
}

export interface TranscribeResult {
  text: string | null;
  engine: AiEngine;
  model?: string;
  error?: string;
}

/** Speech-to-text through Groq Whisper. Returns text=null (never throws) when it can't. */
export async function transcribeAudio(file: File | Blob, opts: { filename?: string; mock?: string } = {}): Promise<TranscribeResult> {
  if (groqMocked()) return { text: opts.mock ?? "", engine: "mock", model: "mock" };
  const c = getClient();
  if (!c) return { text: null, engine: "fallback", error: "AI not configured" };
  const uploadable = file instanceof File ? file : new File([file], opts.filename ?? "recording.webm", { type: (file as Blob).type || "audio/webm" });
  let lastError = "";
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const model = sttModel();
      const res = await c.audio.transcriptions.create({ file: uploadable, model, response_format: "json", temperature: 0 }, { timeout: 60_000 });
      return { text: (res.text ?? "").trim(), engine: "groq", model };
    } catch (err) {
      lastError = describe(err);
      if (isModelError(err) && !resolvedSttModel) {
        resolvedSttModel = await pickModel("stt", sttModel());
        continue;
      }
      if (isRetryable(err) && attempt < 2) {
        await sleep(800 * 2 ** attempt);
        continue;
      }
      break;
    }
  }
  console.warn(`[ai:transcribe] failed: ${lastError}`);
  return { text: null, engine: "fallback", error: lastError };
}

export function aiStatus() {
  return { enabled: groqEnabled(), mocked: groqMocked(), chatModel: chatModel(), sttModel: sttModel() };
}

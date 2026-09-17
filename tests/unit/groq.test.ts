import OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { __setGroqClientFactory, chatJson, transcribeAudio } from "@/lib/ai/groq";

const Schema = z.object({ answer: z.string(), n: z.number() });
const fallback = () => ({ answer: "fallback", n: 0 });

type Create = (...args: unknown[]) => Promise<unknown>;

function fakeClient(create: Create, models: string[] = ["openai/gpt-oss-120b", "whisper-large-v3-turbo"]) {
  return {
    chat: { completions: { create } },
    models: { list: async () => ({ data: models.map((id) => ({ id })) }) },
    audio: { transcriptions: { create } },
  } as unknown as OpenAI;
}

describe("chatJson: validation and fallback", () => {
  beforeEach(() => {
    process.env.GROQ_MOCK = "0";
    process.env.GROQ_API_KEY = "test";
  });
  afterEach(() => {
    __setGroqClientFactory(null);
    process.env.GROQ_MOCK = "1";
  });

  it("returns validated model output", async () => {
    __setGroqClientFactory(() => fakeClient(async () => ({ choices: [{ message: { content: '{"answer":"hi","n":2}' } }] })));
    const r = await chatJson({ task: "t", system: "s", user: "u", schema: Schema, fallback });
    expect(r.engine).toBe("groq");
    expect(r.data).toEqual({ answer: "hi", n: 2 });
  });

  it("strips code fences the model sometimes adds", async () => {
    __setGroqClientFactory(() => fakeClient(async () => ({ choices: [{ message: { content: '```json\n{"answer":"fenced","n":1}\n```' } }] })));
    const r = await chatJson({ task: "t", system: "s", user: "u", schema: Schema, fallback });
    expect(r.data.answer).toBe("fenced");
  });

  it("falls back on bad JSON after one retry", async () => {
    const create = vi.fn(async () => ({ choices: [{ message: { content: "this is not json {" } }] }));
    __setGroqClientFactory(() => fakeClient(create));
    const r = await chatJson({ task: "t", system: "s", user: "u", schema: Schema, fallback });
    expect(r.engine).toBe("fallback");
    expect(r.data).toEqual(fallback());
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("falls back when JSON doesn't match the schema", async () => {
    __setGroqClientFactory(() => fakeClient(async () => ({ choices: [{ message: { content: '{"answer":42}' } }] })));
    const r = await chatJson({ task: "t", system: "s", user: "u", schema: Schema, fallback });
    expect(r.engine).toBe("fallback");
    expect(r.error).toMatch(/validation/);
  });

  it("falls back on timeout without throwing, after retries", async () => {
    const create = vi.fn(async () => {
      throw new OpenAI.APIConnectionTimeoutError({ message: "Request timed out." });
    });
    __setGroqClientFactory(() => fakeClient(create));
    const r = await chatJson({ task: "t", system: "s", user: "u", schema: Schema, fallback, maxRetries: 1 });
    expect(r.engine).toBe("fallback");
    expect(r.error).toMatch(/timed out/);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("retries on 429 then succeeds", async () => {
    let n = 0;
    const create = vi.fn(async () => {
      n++;
      if (n === 1) throw new OpenAI.RateLimitError(429, { message: "slow down" }, "rate limited", new Headers());
      return { choices: [{ message: { content: '{"answer":"ok","n":1}' } }] };
    });
    __setGroqClientFactory(() => fakeClient(create));
    const r = await chatJson({ task: "t", system: "s", user: "u", schema: Schema, fallback, maxRetries: 2 });
    expect(r.engine).toBe("groq");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("switches to an available model when the configured one is rejected", async () => {
    let n = 0;
    const create = vi.fn(async (params: unknown) => {
      n++;
      if (n === 1) throw new OpenAI.BadRequestError(400, { message: "The model `llama-3.3-70b-versatile` has been decommissioned" }, "model decommissioned", new Headers());
      expect((params as { model: string }).model).toBe("openai/gpt-oss-120b");
      return { choices: [{ message: { content: '{"answer":"switched","n":1}' } }] };
    });
    __setGroqClientFactory(() => fakeClient(create, ["canopylabs/orpheus-arabic-saudi", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "whisper-large-v3-turbo"]));
    const r = await chatJson({ task: "t", system: "s", user: "u", schema: Schema, fallback });
    expect(r.engine).toBe("groq");
    expect(r.data.answer).toBe("switched");
  });

  it("uses the fallback when there is no key at all", async () => {
    process.env.GROQ_API_KEY = "";
    __setGroqClientFactory(null);
    const r = await chatJson({ task: "t", system: "s", user: "u", schema: Schema, fallback });
    expect(r.engine).toBe("fallback");
  });

  it("transcription returns null text on failure instead of throwing", async () => {
    __setGroqClientFactory(() =>
      fakeClient(async () => {
        throw new OpenAI.APIConnectionError({ message: "network down" });
      }),
    );
    const r = await transcribeAudio(new Blob(["x".repeat(3000)], { type: "audio/webm" }));
    expect(r.text).toBeNull();
    expect(r.engine).toBe("fallback");
  });
});

describe("GROQ_MOCK", () => {
  it("returns the fallback flagged as mock", async () => {
    process.env.GROQ_MOCK = "1";
    const r = await chatJson({ task: "t", system: "s", user: "u", schema: Schema, fallback });
    expect(r.engine).toBe("mock");
  });
});

import { z } from "zod";
import { fallbackNextStep, type CallItem, type RuleId } from "@/lib/rules/callToday";
import { chatJson, type AiEngine } from "./groq";

export interface SuggestionInput {
  jobId: string;
  rule: RuleId;
  reason: string;
  stage: string;
  urgent: boolean;
  waitingDays: number;
  business: string;
  contact: string;
  equipment: string;
  issue: string;
  quoteTotal: number | null;
  lastActivity?: string | null;
}

const Schema = z.object({
  suggestions: z.array(z.object({ jobId: z.string(), text: z.string().min(1).max(240) })),
});

const SYSTEM = `You help the owner of a small commercial refrigeration repair company work her morning call list.
For each job, write ONE short, concrete next step (max 20 words) she can act on right now: what to say, offer or send.
Be specific to the equipment, the stage and how long they've waited. Plain English, sentence case, no emojis, no fluff.
Return {"suggestions":[{"jobId":"...","text":"..."}]} with one entry per job, same jobIds as given.`;

/** One batched request for the whole list; falls back to rule-based text per row. */
export async function suggestNextSteps(inputs: SuggestionInput[]): Promise<{ engine: AiEngine; suggestions: Record<string, string> }> {
  const fallback = () => ({
    suggestions: inputs.map((i) => ({ jobId: i.jobId, text: fallbackNextStep({ rule: i.rule } as CallItem) })),
  });
  if (inputs.length === 0) return { engine: "fallback", suggestions: {} };
  const user = JSON.stringify({ jobs: inputs.map((i) => ({ jobId: i.jobId, reason: i.reason, stage: i.stage, urgent: i.urgent, waitingDays: i.waitingDays, business: i.business, contact: i.contact, equipment: i.equipment, issue: i.issue.slice(0, 200), quoteTotal: i.quoteTotal, lastActivity: i.lastActivity?.slice(0, 160) ?? null })) });
  const res = await chatJson({ task: "suggest_next_steps", system: SYSTEM, user, schema: Schema, fallback, temperature: 0.3, maxTokens: 1600, timeoutMs: 15_000 });
  const map: Record<string, string> = {};
  for (const s of fallback().suggestions) map[s.jobId] = s.text; // guarantee every row has text
  for (const s of res.data.suggestions) if (map[s.jobId] !== undefined) map[s.jobId] = s.text.trim();
  return { engine: res.engine, suggestions: map };
}

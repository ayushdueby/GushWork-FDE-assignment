import { z } from "zod";
import { EQUIPMENT_TYPES } from "@/lib/domain/types";
import { parseMessage } from "@/lib/parse/parseMessage";
import { chatJson, type AiEngine } from "./groq";

export const CallExtractionSchema = z.object({
  issue: z.string().nullable(),
  equipment: z.enum(EQUIPMENT_TYPES).nullable(),
  urgency: z.enum(["urgent", "high", "normal", "low"]).nullable(),
  quoteAmount: z.number().nullable(),
  decision: z.enum(["approved", "declined", "undecided"]).nullable(),
  requestedDate: z.string().nullable(),
  nextStep: z.string().nullable(),
  summary: z.string(),
});
export type CallExtraction = z.infer<typeof CallExtractionSchema>;

const SYSTEM = `You summarise phone-call transcripts for the owner of a small commercial refrigeration repair company. The transcript may be a two-person conversation, a voicemail, or the owner's dictated notes.
Return JSON with exactly these keys:
- issue: one plain sentence about what's wrong / what the customer wants, or null.
- equipment: one of "walk-in cooler", "walk-in freezer", "ice machine", "reach-in", "other", or null.
- urgency: "urgent" if equipment is down / product at risk / needs someone today, "high" for this week, "normal", "low" for maintenance or no rush, or null if not discussed.
- quoteAmount: a dollar amount that was quoted or agreed on the call as a number (e.g. "around six hundred" → 600, "$1,850" → 1850), else null.
- decision: "approved" if the customer said yes to a quote/going ahead, "declined" if they said no, "undecided" if a quote was discussed without a decision, else null.
- requestedDate: any day/time the customer asked for, verbatim ("Tuesday morning", "tomorrow after 2"), else null.
- nextStep: what the owner should do next, one short sentence, or null.
- summary: two sentences max for a busy owner.`;

const MONEY_RE = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?|\b(\d{1,3}(?:,\d{3})+|\d{3,5})\s*(?:dollars|bucks)\b/i;
const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** "six hundred", "eighteen hundred", "twelve fifty", "two thousand" → number. */
export function spokenAmount(text: string): number | null {
  const m = text.toLowerCase().match(/\b(?:around|about|roughly|approximately)?\s*((?:[a-z]+[\s-]?){1,4}?)\s*(hundred|thousand|grand)\b(?:\s*(?:and\s*)?((?:[a-z]+[\s-]?){1,2}))?/);
  if (!m) return null;
  const lead = m[1].trim().split(/[\s-]+/).reduce((s, w) => s + (WORD_NUM[w] ?? 0), 0);
  if (!lead) return null;
  let n = lead * (m[2] === "hundred" ? 100 : 1000);
  if (m[3]) n += m[3].trim().split(/[\s-]+/).reduce((s, w) => s + (WORD_NUM[w] ?? 0), 0);
  return n;
}

const DATE_RE = /\b((?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)(?:\s+(?:morning|afternoon|evening|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|around\s+\d{1,2}|after\s+\d{1,2}|before\s+\d{1,2}))?|(?:mornings?|afternoons?)\s+(?:before|after)\s+\d{1,2}|this\s+week|next\s+week)\b/i;

/** Deterministic call extraction: keyword rules over the transcript. */
export function fallbackExtractCall(transcript: string): CallExtraction {
  const p = parseMessage(transcript);
  const t = transcript.toLowerCase();
  const money = transcript.match(MONEY_RE);
  const quoteAmount = money ? Number((money[1] ?? money[3]).replace(/,/g, "")) : spokenAmount(transcript);
  const approved = /\b(go ahead|that'?s fine|sounds good|approved?|let'?s do it|book it|yes,? (go|do|let)|we'?ll take it|works for (me|us))\b/i.test(transcript);
  const declined = /\b(no thanks|too (expensive|much|high)|going with (someone|another)|went with|hold off|not right now|pass on)\b/i.test(transcript);
  const decision = approved ? "approved" : declined ? "declined" : quoteAmount ? "undecided" : null;
  const date = transcript.match(DATE_RE)?.[1] ?? null;
  const urgency = p.urgent ? "urgent" : /\b(this week|soon|asap)\b/.test(t) ? "high" : /\b(no rush|whenever|maintenance|quarterly)\b/.test(t) ? "low" : null;
  const nextStep = approved ? "Schedule the visit" : declined ? "Mark the job lost" : quoteAmount ? "Send the written quote" : p.urgent ? "Get a tech out today" : date ? `Confirm a visit for ${date}` : null;
  return {
    issue: p.issue ?? null,
    equipment: p.equipment ?? null,
    urgency,
    quoteAmount: quoteAmount && quoteAmount > 0 ? quoteAmount : null,
    decision,
    requestedDate: date,
    nextStep,
    summary: [p.issue ? p.issue.slice(0, 100) : "Call with the customer.", quoteAmount ? `Quote mentioned: $${quoteAmount}.` : "", approved ? "Customer approved." : declined ? "Customer declined." : ""].filter(Boolean).join(" "),
  };
}

export async function extractCall(transcript: string, context?: { business?: string; stage?: string; equipment?: string; issue?: string }): Promise<{ data: CallExtraction; engine: AiEngine; error?: string }> {
  const user = `${context ? `Existing job: ${context.business ?? ""} · stage ${context.stage ?? "?"} · ${context.equipment ?? ""} · ${context.issue ?? ""}\n\n` : ""}Transcript:\n"""\n${transcript.slice(0, 8000)}\n"""`;
  return chatJson({ task: "extract_call", system: SYSTEM, user, schema: CallExtractionSchema, fallback: () => fallbackExtractCall(transcript), maxTokens: 600 });
}

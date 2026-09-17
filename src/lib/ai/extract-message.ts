import { z } from "zod";
import { EQUIPMENT_TYPES, INTENTS, type Intent } from "@/lib/domain/types";
import { parseMessage } from "@/lib/parse/parseMessage";
import { chatJson, type AiEngine } from "./groq";

/** What every inbound message becomes, whichever channel it came from. */
export const MessageExtractionSchema = z.object({
  name: z.string().nullable(),
  business: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  equipment: z.enum(EQUIPMENT_TYPES).nullable(),
  issue: z.string().nullable(),
  urgency: z.enum(["urgent", "high", "normal", "low"]),
  intent: z.enum(INTENTS),
  isLead: z.boolean(),
  summary: z.string(),
});
export type MessageExtraction = z.infer<typeof MessageExtractionSchema>;

const SYSTEM = `You read inbound messages (email, SMS, website form) for a small commercial refrigeration repair company (walk-in coolers, walk-in freezers, ice machines, reach-ins) serving restaurants, grocery stores and warehouses.
Extract a JSON object with exactly these keys:
- name: the person's name or null. business: the business name or null. phone, email, address: as written, or null. Never invent contact details.
- equipment: one of "walk-in cooler", "walk-in freezer", "ice machine", "reach-in", "other", or null if no equipment is mentioned.
- issue: one plain sentence describing what they need, or null.
- urgency: "urgent" if equipment is down / warm / thawing / needs someone today; "high" if this week; "normal" otherwise; "low" for maintenance, no rush, future quotes.
- intent: "new_request" (they want service/quote), "quote_reply_accept" (they are saying yes to a quote), "quote_reply_decline" (no / went elsewhere / too expensive), "scheduling" (proposing or confirming a time), or "other".
- isLead: false for spam, vendor pitches, newsletters, job applications, or anything unrelated to refrigeration service. A reply from an existing customer is still a lead (true).
- summary: one short sentence for a busy owner.`;

const ACCEPT_RE = /\b(yes|yep|yeah|go ahead|approved?|approve|sounds good|let'?s do it|book it|do it|green light|we'?ll take it|accept(ed)?|ok(ay)? (to|with) (the )?quote|that works)\b/i;
const DECLINE_RE = /\b(no thanks?|not (going|gonna)|pass|decline[d]?|too (expensive|high|much)|went with|going with (someone|another)|already (fixed|had it)|cancel)\b/i;
const SCHED_RE = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|morning|afternoon|what time|schedule|come by|available|reschedule|next week|this week|any time after)\b/i;
const SPAM_RE = /\b(seo|rank #?1|google ranking|unsubscribe|newsletter|marketing|loan|crypto|casino|free audit|guaranteed|promo(tion)?|limited offer|resume|job application|applying for)\b/i;

/** Deterministic extraction: the ported parser plus keyword intent. Used as fallback and in tests. */
export function fallbackExtractMessage(input: { body: string; subject?: string | null; from?: string | null; channel: string }): MessageExtraction {
  const text = [input.subject, input.body].filter(Boolean).join("\n");
  const p = parseMessage(text);
  const isSpam = SPAM_RE.test(text) && !p.equipment;
  const emailFrom = input.channel === "email" ? (input.from?.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? null) : null;
  const phoneFrom = input.channel === "sms" ? input.from ?? null : null;
  let intent: Intent = "other";
  if (ACCEPT_RE.test(text) && !p.equipment) intent = "quote_reply_accept";
  else if (DECLINE_RE.test(text)) intent = "quote_reply_decline";
  else if (SCHED_RE.test(text) && !p.equipment) intent = "scheduling";
  else if (p.equipment || p.issue) intent = "new_request";
  if (ACCEPT_RE.test(text) && /\bquote\b/i.test(text)) intent = "quote_reply_accept";
  const urgency = p.urgent ? "urgent" : /\b(this week|soon|asap)\b/i.test(text) ? "high" : /\b(no rush|whenever|maintenance|quarterly)\b/i.test(text) ? "low" : "normal";
  return {
    name: p.customerName ?? null,
    business: p.businessName ?? null,
    phone: p.phone ?? phoneFrom,
    email: text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? emailFrom,
    address: null,
    equipment: p.equipment ?? null,
    issue: p.issue ?? null,
    urgency,
    intent,
    isLead: !isSpam,
    summary: isSpam ? "Looks like spam or a vendor pitch." : p.issue ? p.issue.slice(0, 120) : text.slice(0, 120),
  };
}

export async function extractMessage(input: { body: string; subject?: string | null; from?: string | null; channel: string }): Promise<{ data: MessageExtraction; engine: AiEngine; error?: string }> {
  const user = `Channel: ${input.channel}\nFrom: ${input.from ?? "unknown"}\nSubject: ${input.subject ?? "(none)"}\n\nMessage:\n"""\n${input.body.slice(0, 6000)}\n"""`;
  const res = await chatJson({ task: "extract_message", system: SYSTEM, user, schema: MessageExtractionSchema, fallback: () => fallbackExtractMessage(input), maxTokens: 700 });
  // Belt and braces: the channel tells us contact details the model may not have echoed.
  const d = res.data;
  if (!d.phone && input.channel === "sms" && input.from) d.phone = input.from;
  if (!d.email && input.channel === "email" && input.from) d.email = input.from.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? null;
  return { data: d, engine: res.engine, error: res.error };
}

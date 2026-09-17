/**
 * Shared vocabulary. Stored as plain strings in SQLite/Postgres and validated here + with zod,
 * because Prisma enums aren't available on SQLite.
 */

export const STAGES = ["needs_quote", "waiting_on_yes", "approved", "scheduled", "done", "lost"] as const;
export type Stage = (typeof STAGES)[number];
/** The forward path a job moves along. "lost" is a side exit. */
export const STAGE_PATH: Stage[] = ["needs_quote", "waiting_on_yes", "approved", "scheduled", "done"];

export const STAGE_LABEL: Record<Stage, string> = {
  needs_quote: "Needs quote",
  waiting_on_yes: "Waiting on yes",
  approved: "Approved – schedule",
  scheduled: "Scheduled",
  done: "Done",
  lost: "Lost",
};

export const STAGE_HINT: Record<Stage, string> = {
  needs_quote: "New request. Nothing sent yet.",
  waiting_on_yes: "Quote is out. Waiting on the customer.",
  approved: "They said yes. Needs a tech and a date.",
  scheduled: "A tech is booked.",
  done: "Work complete.",
  lost: "Went elsewhere or cancelled.",
};

export function isStage(v: unknown): v is Stage {
  return typeof v === "string" && (STAGES as readonly string[]).includes(v);
}
export function isOpenStage(stage: string): boolean {
  return stage !== "done" && stage !== "lost";
}
export function nextStage(stage: Stage): Stage | null {
  const i = STAGE_PATH.indexOf(stage);
  if (i === -1 || i === STAGE_PATH.length - 1) return null;
  return STAGE_PATH[i + 1];
}
/** Forward moves count as contact; backward moves and "lost" don't. */
export function isForwardMove(from: Stage, to: Stage): boolean {
  const a = STAGE_PATH.indexOf(from);
  const b = STAGE_PATH.indexOf(to);
  return a !== -1 && b !== -1 && b > a;
}

export const SOURCES = ["call", "sms", "email", "web_form", "referral", "repeat"] as const;
export type Source = (typeof SOURCES)[number];
export const SOURCE_LABEL: Record<Source, string> = {
  call: "Phone call",
  sms: "Text message",
  email: "Email",
  web_form: "Website form",
  referral: "Referral",
  repeat: "Repeat customer",
};
export function isSource(v: unknown): v is Source {
  return typeof v === "string" && (SOURCES as readonly string[]).includes(v);
}

export const EQUIPMENT_TYPES = ["walk-in cooler", "walk-in freezer", "ice machine", "reach-in", "other"] as const;
export type EquipmentType = (typeof EQUIPMENT_TYPES)[number];
export function isEquipmentType(v: unknown): v is EquipmentType {
  return typeof v === "string" && (EQUIPMENT_TYPES as readonly string[]).includes(v);
}

export const CUSTOMER_TYPES = ["restaurant", "grocery", "warehouse", "other"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const CHANNELS = ["email", "sms", "web_form"] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_LABEL: Record<Channel, string> = { email: "Email", sms: "Text", web_form: "Web form" };

export const ROLES = ["owner", "bookkeeper", "tech"] as const;
export type Role = (typeof ROLES)[number];

export const INTENTS = ["new_request", "quote_reply_accept", "quote_reply_decline", "scheduling", "other"] as const;
export type Intent = (typeof INTENTS)[number];

export const LOST_REASONS = ["Went with someone else", "Too expensive", "Never heard back", "Fixed it themselves", "Not our kind of job", "Spam / not a real lead", "Other"];

/** Digits-only phone key used for matching across channels. Strips a leading US "1". */
export function phoneDigits(input: string | null | undefined): string {
  const d = (input ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  return d;
}

/** (512) 555-0199 for 10-digit numbers; otherwise whatever was stored. */
export function formatPhone(input: string | null | undefined): string {
  if (!input) return "";
  const d = phoneDigits(input);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return input;
}

export function money(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "$0";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: Number.isInteger(n) ? 0 : 2 });
}

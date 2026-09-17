import { isOpenStage } from "@/lib/domain/types";
import { daysBetween, fromDateKey, startOfDay } from "./dates";

/**
 * "Who do I call today?" — ported from the cooler-calls prototype (src/lib/callToday.ts),
 * with one addition for this build: an unreturned missed call goes to the top.
 *
 * Pure: (jobs, now) → ordered list. No AI, no DB. Same data → same list every morning.
 */

export type RuleId = "equipment-down" | "missed-call" | "new-request" | "send-quote" | "follow-up-quote" | "book-tech" | "confirm-done" | "no-contact";

/** The minimum a job needs to expose for the rules. */
export interface RuleJob {
  id: string;
  stage: string;
  urgent: boolean;
  createdAt: string | Date;
  lastContactAt: string | Date | null;
  /** Date, ISO string, or YYYY-MM-DD (local). */
  scheduledFor?: string | Date | null;
  /** Most recent inbound call we didn't answer. */
  missedCallAt?: string | Date | null;
}

export interface CallItem<J extends RuleJob = RuleJob> {
  job: J;
  rule: RuleId;
  /** Short sentence shown on the row. */
  reason: string;
  /** Show in red. */
  critical: boolean;
  /** How long this has been waiting, in whole days. */
  waitingDays: number;
}

export const RULE_ORDER: RuleId[] = ["equipment-down", "missed-call", "new-request", "send-quote", "follow-up-quote", "book-tech", "confirm-done", "no-contact"];

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return fromDateKey(v);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Days since we last touched the job (or since it came in, if never). */
function daysSinceContact(job: RuleJob, now: Date): number {
  return daysBetween(job.lastContactAt ?? job.createdAt, now);
}

function contactedToday(job: RuleJob, now: Date): boolean {
  const last = toDate(job.lastContactAt);
  if (!last) return false;
  return last >= startOfDay(now);
}

/**
 * Decide whether a single job needs a call today, and why.
 * Rules are checked in priority order; the first match wins.
 */
export function callReason<J extends RuleJob>(job: J, now: Date): CallItem<J> | null {
  if (!isOpenStage(job.stage)) return null;

  const waiting = daysSinceContact(job, now);

  // 1. Equipment down and we haven't spoken to them today.
  if (job.stage === "needs_quote" && job.urgent && !contactedToday(job, now)) {
    return { job, rule: "equipment-down", reason: "Equipment down — call now", critical: true, waitingDays: waiting };
  }

  // 1b. They called and we missed it, and we haven't called back since.
  const missed = toDate(job.missedCallAt);
  const last = toDate(job.lastContactAt);
  if (missed && (!last || last < missed)) {
    return { job, rule: "missed-call", reason: "Missed call — call back", critical: false, waitingDays: daysBetween(missed, now) };
  }

  // 2. Brand new request nobody has called back.
  if (job.stage === "needs_quote" && !job.lastContactAt) {
    return { job, rule: "new-request", reason: "New request — call back", critical: false, waitingDays: waiting };
  }

  // 3. We talked to them but still haven't sent a quote after a day.
  if (job.stage === "needs_quote" && job.lastContactAt && waiting >= 1) {
    return { job, rule: "send-quote", reason: "Send the quote", critical: false, waitingDays: waiting };
  }

  // 4. Quote is out and it's gone quiet.
  if (job.stage === "waiting_on_yes" && waiting >= 2) {
    return { job, rule: "follow-up-quote", reason: "Follow up on quote", critical: false, waitingDays: waiting };
  }

  // 5. They said yes, nobody has put it on the calendar.
  if (job.stage === "approved") {
    return { job, rule: "book-tech", reason: "Book a tech", critical: false, waitingDays: waiting };
  }

  // 6. The scheduled day has passed; close it out.
  if (job.stage === "scheduled") {
    const scheduled = toDate(job.scheduledFor);
    if (scheduled && startOfDay(scheduled) < startOfDay(now)) {
      return { job, rule: "confirm-done", reason: "Confirm job is done", critical: false, waitingDays: daysBetween(scheduled, now) };
    }
  }

  // 7. Anything else that's gone quiet.
  if (waiting >= 2) {
    return { job, rule: "no-contact", reason: `Hasn't heard from us in ${waiting} days`, critical: false, waitingDays: waiting };
  }

  return null;
}

/**
 * Build the "Call today" list: every open job that needs attention.
 * Urgent first, then by rule priority, then longest-waiting first. Stable for ties.
 */
export function callToday<J extends RuleJob>(jobs: J[], now: Date = new Date()): CallItem<J>[] {
  const items: CallItem<J>[] = [];
  for (const job of jobs) {
    const item = callReason(job, now);
    if (item) items.push(item);
  }
  return items.sort((a, b) => {
    const byUrgent = Number(b.job.urgent) - Number(a.job.urgent);
    if (byUrgent !== 0) return byUrgent;
    const byRule = RULE_ORDER.indexOf(a.rule) - RULE_ORDER.indexOf(b.rule);
    return byRule !== 0 ? byRule : b.waitingDays - a.waitingDays;
  });
}

/** Plain-English next step used when the AI isn't available. */
export function fallbackNextStep(item: CallItem): string {
  switch (item.rule) {
    case "equipment-down":
      return "Call now, confirm what's down, and offer a same-day visit.";
    case "missed-call":
      return "Call back; they tried to reach you.";
    case "new-request":
      return "Call back, confirm the equipment and address, and ask when they need it fixed.";
    case "send-quote":
      return "Write up the quote and send it today so they can say yes.";
    case "follow-up-quote":
      return "Text or call to ask if they have questions on the quote.";
    case "book-tech":
      return "Pick a tech and a day, then confirm the time with the customer.";
    case "confirm-done":
      return "Check with the tech that the job is finished and mark it done.";
    case "no-contact":
      return "Send a quick check-in so they know they're not forgotten.";
  }
}

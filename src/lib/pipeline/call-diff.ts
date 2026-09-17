import type { CallExtraction } from "@/lib/ai/extract-call";
import { STAGE_LABEL, type Stage } from "@/lib/domain/types";

/**
 * Turn what was said on a call into a reviewable list of "field: old → new" changes.
 * Pure: unit-tested; the service applies whatever the owner ticks.
 */
export interface JobSnapshot {
  stage: Stage;
  urgent: boolean;
  issue: string;
  equipmentType: string;
  scheduledFor: Date | null;
  /** Latest quote total, if any. */
  quoteTotal: number | null;
  quoteStatus: string | null;
}

export type ChangeField = "urgent" | "issue" | "equipmentType" | "quote" | "stage" | "scheduledFor" | "note";

export interface ProposedChange {
  field: ChangeField;
  label: string;
  old: string;
  new: string;
  /** Machine value the apply step uses. */
  value: string | number | boolean | null;
}

const DOW = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** "Tuesday morning", "tomorrow at 2", "Thursday" → a concrete Date; null when too vague. */
export function parseRequestedDate(text: string | null, now = new Date()): Date | null {
  if (!text) return null;
  const t = text.toLowerCase();
  const d = new Date(now);
  d.setSeconds(0, 0);
  let matched = false;
  if (/\btomorrow\b/.test(t)) {
    d.setDate(d.getDate() + 1);
    matched = true;
  } else if (/\btoday\b/.test(t)) {
    matched = true;
  } else {
    const dow = DOW.findIndex((n) => t.includes(n));
    if (dow >= 0) {
      let delta = (dow - d.getDay() + 7) % 7;
      if (delta === 0 || /\bnext\b/.test(t)) delta += delta === 0 ? 7 : 0;
      if (/\bnext\b/.test(t) && delta < 7) delta += 7;
      d.setDate(d.getDate() + delta);
      matched = true;
    }
  }
  if (!matched) return null;
  const time = t.match(/\b(?:at|around|after)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (time && !/\b\d{1,2}\s*(?:degrees|°)/.test(t)) {
    let h = Number(time[1]);
    const mi = Number(time[2] ?? 0);
    const ap = time[3];
    if (ap === "pm" && h < 12) h += 12;
    if (!ap && h < 7) h += 12; // "at 2" in a trades context means 2pm
    if (h >= 0 && h <= 23) d.setHours(h, mi, 0, 0);
    else d.setHours(9, 0, 0, 0);
  } else if (/\bafternoon\b/.test(t)) d.setHours(14, 0, 0, 0);
  else if (/\bevening\b/.test(t)) d.setHours(17, 0, 0, 0);
  else d.setHours(9, 0, 0, 0);
  // "today" after the proposed hour → the next full hour, never the past.
  if (d.getTime() < now.getTime()) {
    const next = new Date(now);
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    if (next.getDate() === d.getDate()) return next;
    return null;
  }
  return d;
}

export function proposeChanges(ex: CallExtraction, job: JobSnapshot, now = new Date()): ProposedChange[] {
  const out: ProposedChange[] = [];
  const open = job.stage !== "done" && job.stage !== "lost";

  if (ex.urgency === "urgent" && !job.urgent) out.push({ field: "urgent", label: "Urgent", old: "no", new: "yes", value: true });
  if (ex.urgency && ex.urgency !== "urgent" && job.urgent && ex.urgency === "low") out.push({ field: "urgent", label: "Urgent", old: "yes", new: "no", value: false });

  if (ex.equipment && ex.equipment !== job.equipmentType && (job.equipmentType === "other" || !job.equipmentType)) {
    out.push({ field: "equipmentType", label: "Equipment", old: job.equipmentType || "—", new: ex.equipment, value: ex.equipment });
  }
  if (ex.issue && ex.issue.trim() && (!job.issue || job.issue.toLowerCase().startsWith("missed call") || job.issue.length < 12)) {
    out.push({ field: "issue", label: "Issue", old: job.issue || "—", new: ex.issue.trim(), value: ex.issue.trim() });
  }

  if (ex.quoteAmount && ex.quoteAmount > 0 && (job.quoteTotal == null || Math.abs(job.quoteTotal - ex.quoteAmount) > 0.5) && job.quoteStatus !== "accepted") {
    out.push({ field: "quote", label: "Quote (draft)", old: job.quoteTotal != null ? `$${job.quoteTotal.toLocaleString()}` : "none", new: `$${ex.quoteAmount.toLocaleString()}`, value: ex.quoteAmount });
  }

  let nextStage: Stage | null = null;
  // A "yes" only moves the stage when a real quote is out; a verbal ok on a ballpark in
  // needs_quote means "send the written quote", which the draft-quote change already captures.
  if (open && ex.decision === "approved" && job.stage === "waiting_on_yes") nextStage = "approved";
  if (open && ex.decision === "approved" && job.stage === "needs_quote" && ex.quoteAmount) {
    out.push({ field: "note", label: "Note", old: "—", new: `Customer verbally OK'd ~$${ex.quoteAmount.toLocaleString()} on the phone — send the written quote`, value: `Customer verbally OK'd ~$${ex.quoteAmount.toLocaleString()} on the phone — send the written quote` });
  }
  if (open && ex.decision === "declined") nextStage = "lost";
  const when = parseRequestedDate(ex.requestedDate, now);
  if (open && when && (job.stage === "approved" || nextStage === "approved") && (!job.scheduledFor || job.scheduledFor.getTime() !== when.getTime())) {
    out.push({ field: "scheduledFor", label: "Visit", old: job.scheduledFor ? job.scheduledFor.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "not scheduled", new: when.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), value: when.toISOString() });
    nextStage = "scheduled";
  }
  if (nextStage && nextStage !== job.stage) out.push({ field: "stage", label: "Stage", old: STAGE_LABEL[job.stage], new: STAGE_LABEL[nextStage], value: nextStage });
  if (ex.requestedDate && !out.some((c) => c.field === "scheduledFor" || c.field === "note")) {
    out.push({ field: "note", label: "Note", old: "—", new: `Customer asked for: ${ex.requestedDate}`, value: `Customer asked for: ${ex.requestedDate}` });
  }
  return out;
}

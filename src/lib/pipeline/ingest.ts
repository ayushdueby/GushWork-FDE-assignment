import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { extractMessage, type MessageExtraction } from "@/lib/ai/extract-message";
import { STAGE_LABEL, phoneDigits, type Channel, type Stage } from "@/lib/domain/types";
import { logActivity, notify } from "@/lib/services/activity";
import { createCustomer, enrichCustomer, findMatchingCustomer } from "@/lib/services/customers";
import { createJob, setStage } from "@/lib/services/jobs";

/**
 * One ingestion pipeline for every inbound channel:
 *   store Message → extract (Groq, fallback rules) → match customer → create or attach job
 *   → apply intent → write Activity.
 * Webhooks, the web form, Gmail sync and the "simulate" buttons all call this.
 */

export interface InboundMessage {
  channel: Channel;
  from: string;
  to?: string;
  subject?: string | null;
  body: string;
  raw?: string;
  /** Provider id (Twilio SID, Gmail id, form submission id). Same id twice = no-op. */
  externalId?: string | null;
  receivedAt?: Date;
  actor?: string;
}

export interface IngestResult {
  messageId: string;
  duplicate: boolean;
  status: string;
  customerId: string | null;
  jobId: string | null;
  created: { customer: boolean; job: boolean };
  extraction: MessageExtraction | null;
  engine: string | null;
  applied: string | null;
}

/** Same message twice (retry, double webhook) → same fingerprint. */
export function messageFingerprint(m: Pick<InboundMessage, "channel" | "from" | "body" | "subject">): string {
  const norm = `${m.channel}|${m.from.trim().toLowerCase()}|${(m.subject ?? "").trim().toLowerCase()}|${m.body.replace(/\s+/g, " ").trim().toLowerCase()}`;
  return "fp:" + createHash("sha256").update(norm).digest("hex").slice(0, 32);
}

const RECENT_DUP_WINDOW_DAYS = 7;

export async function ingestMessage(input: InboundMessage): Promise<IngestResult> {
  const externalId = input.externalId ? `ext:${input.externalId}` : messageFingerprint(input);

  // 1. Dedupe on provider id / content fingerprint.
  const existing = await db.message.findUnique({ where: { externalId } });
  if (existing) {
    return { messageId: existing.id, duplicate: true, status: existing.status, customerId: existing.customerId, jobId: existing.jobId, created: { customer: false, job: false }, extraction: existing.extractedJson ? (JSON.parse(existing.extractedJson) as MessageExtraction) : null, engine: null, applied: null };
  }

  const threadKey = input.channel === "sms" ? phoneDigits(input.from) || input.from : input.from.toLowerCase().match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? input.from.toLowerCase();

  // 2. Store first so nothing is lost even if extraction blows up.
  const message = await db.message.create({
    data: {
      channel: input.channel,
      direction: "inbound",
      fromAddr: input.from.slice(0, 200),
      toAddr: (input.to ?? "").slice(0, 200),
      subject: input.subject?.slice(0, 300) ?? null,
      body: input.body.slice(0, 20_000),
      raw: (input.raw ?? input.body).slice(0, 50_000),
      receivedAt: input.receivedAt ?? new Date(),
      status: "pending",
      externalId,
      threadKey,
    },
  });

  // 3. Extract.
  const { data: ex, engine } = await extractMessage({ body: input.body, subject: input.subject, from: input.from, channel: input.channel });

  // 4. Spam / not a lead: park it, no customer, no job.
  if (!ex.isLead) {
    await db.message.update({ where: { id: message.id }, data: { status: "not_a_lead", extractedJson: JSON.stringify(ex) } });
    return { messageId: message.id, duplicate: false, status: "not_a_lead", customerId: null, jobId: null, created: { customer: false, job: false }, extraction: ex, engine, applied: null };
  }

  // 5. Match a customer by phone, email, then fuzzy business name.
  const match = await findMatchingCustomer({ phone: ex.phone ?? (input.channel === "sms" ? input.from : null), email: ex.email ?? (input.channel === "email" ? input.from : null), businessName: ex.business });
  let customerId = match?.customer.id ?? null;
  let createdCustomer = false;
  if (customerId) {
    await enrichCustomer(customerId, { primaryContact: ex.name, phone: ex.phone, email: ex.email, address: ex.address });
  } else {
    const c = await createCustomer({ businessName: ex.business ?? ex.name ?? (input.channel === "sms" ? `Caller ${input.from}` : input.from), primaryContact: ex.name, phone: ex.phone, email: ex.email, address: ex.address, type: "restaurant" }, "inbox");
    customerId = c.id;
    createdCustomer = true;
  }

  // 6. Create a job or attach to the open one, then apply the intent.
  const openJobs = await db.job.findMany({ where: { customerId, stage: { notIn: ["done", "lost"] } }, orderBy: { createdAt: "desc" } });
  let jobId: string | null = null;
  let createdJob = false;
  let applied: string | null = null;
  const actor = input.actor ?? "inbox";
  const urgent = ex.urgency === "urgent";

  if (ex.intent === "quote_reply_accept") {
    const quoted = openJobs.find((j) => j.stage === "waiting_on_yes") ?? openJobs[0] ?? null;
    if (quoted) {
      jobId = quoted.id;
      if (quoted.stage === "waiting_on_yes") {
        await setStage(quoted.id, "approved", { actor: "customer", note: `Customer said yes by ${input.channel === "sms" ? "text" : input.channel === "email" ? "email" : "web form"} — Stage → ${STAGE_LABEL.approved}` });
        await db.quote.updateMany({ where: { jobId: quoted.id, status: "sent" }, data: { status: "accepted", respondedAt: new Date(), customerComment: ex.summary.slice(0, 300) } });
        applied = "approved";
        await notify({ text: `${match?.customer.businessName ?? "A customer"} said yes to their quote`, href: `/jobs/${quoted.id}` });
      }
    }
  } else if (ex.intent === "quote_reply_decline") {
    const quoted = openJobs.find((j) => j.stage === "waiting_on_yes") ?? openJobs[0] ?? null;
    if (quoted) {
      jobId = quoted.id;
      await setStage(quoted.id, "lost", { actor: "customer", lostReason: `Customer declined by ${input.channel === "sms" ? "text" : "message"}: ${(ex.issue ?? ex.summary).slice(0, 200)}` });
      await db.quote.updateMany({ where: { jobId: quoted.id, status: "sent" }, data: { status: "declined", respondedAt: new Date(), customerComment: ex.summary.slice(0, 300) } });
      applied = "lost";
      await notify({ text: `${match?.customer.businessName ?? "A customer"} declined their quote`, href: `/jobs/${quoted.id}` });
    }
  } else if (ex.intent === "scheduling") {
    const target = openJobs.find((j) => j.stage === "approved") ?? openJobs[0] ?? null;
    if (target) {
      jobId = target.id;
      await logActivity({ customerId, jobId, type: "message_in", text: `Customer is talking scheduling: “${(ex.issue ?? ex.summary).slice(0, 160)}”`, actor: "customer" });
      applied = "scheduling_note";
    }
  }

  if (!jobId) {
    // New request (or anything else from a lead): reuse a recent open needs_quote job for the
    // same equipment so a customer who emails AND texts doesn't get two jobs.
    const since = new Date(Date.now() - RECENT_DUP_WINDOW_DAYS * 86_400_000);
    const same = openJobs.find((j) => j.createdAt >= since && (j.stage === "needs_quote" || ex.intent === "other") && (!ex.equipment || j.equipmentType === ex.equipment || j.equipmentType === "other"));
    if (same && (ex.intent === "new_request" || ex.intent === "other")) {
      jobId = same.id;
      await logActivity({ customerId, jobId, type: "message_in", text: `Another message about this job: “${(ex.issue ?? ex.summary).slice(0, 160)}”`, actor: "customer" });
      if (urgent && !same.urgent) {
        await db.job.update({ where: { id: same.id }, data: { urgent: true } });
        await logActivity({ customerId, jobId, type: "system", text: "Marked urgent from the customer's latest message", actor });
      }
      applied = "attached";
    } else if (ex.intent === "new_request" || ex.intent === "other") {
      const job = await createJob({ customerId, source: input.channel === "web_form" ? "web_form" : input.channel === "sms" ? "sms" : "email", issue: ex.issue ?? ex.summary, equipmentType: ex.equipment ?? "other", urgent }, actor);
      jobId = job.id;
      createdJob = true;
      applied = "created";
    }
  }

  // 7. Log the inbound message on the timeline and settle the review status.
  await logActivity({
    customerId,
    jobId,
    type: "message_in",
    text: `Received ${input.channel === "sms" ? "text" : input.channel === "email" ? "email" : "web form"}${input.subject ? ` “${input.subject.slice(0, 60)}”` : ""}: ${input.body.replace(/\s+/g, " ").slice(0, 140)}`,
    actor: "customer",
  });
  const status = createdCustomer || !jobId ? "needs_review" : "accepted";
  await db.message.update({ where: { id: message.id }, data: { customerId, jobId, status, extractedJson: JSON.stringify(ex) } });
  if (createdJob && urgent) await notify({ text: `Urgent request from ${ex.business ?? ex.name ?? input.from}`, href: `/jobs/${jobId}` });

  return { messageId: message.id, duplicate: false, status, customerId, jobId, created: { customer: createdCustomer, job: createdJob }, extraction: ex, engine, applied };
}

/** Owner review: accept as-is, or with corrected fields. */
export async function reviewMessage(messageId: string, input: { decision: "accept" | "not_a_lead"; edits?: Partial<Pick<MessageExtraction, "name" | "business" | "phone" | "email" | "equipment" | "issue">> & { urgent?: boolean }; actor: string }) {
  const m = await db.message.findUnique({ where: { id: messageId }, include: { job: true, customer: true } });
  if (!m) throw new Error("Message not found");
  if (input.decision === "not_a_lead") {
    // Undo what the pipeline created if nobody has touched it since.
    if (m.job && m.job.stage === "needs_quote") {
      const touched = await db.activity.count({ where: { jobId: m.job.id, type: { in: ["contact", "quote", "call", "schedule", "stage"] } } });
      if (touched === 0) await db.job.delete({ where: { id: m.job.id } });
      else await setStage(m.job.id, "lost", { actor: input.actor, lostReason: "Not a real lead" });
    }
    await db.message.update({ where: { id: messageId }, data: { status: "not_a_lead", jobId: null } });
    await logActivity({ customerId: m.customerId, type: "system", text: "Message marked as not a lead", actor: input.actor });
    return { ok: true as const };
  }
  const e = input.edits ?? {};
  if (m.customerId && (e.name !== undefined || e.business !== undefined || e.phone !== undefined || e.email !== undefined)) {
    await db.customer.update({
      where: { id: m.customerId },
      data: {
        ...(e.business ? { businessName: e.business.slice(0, 160) } : {}),
        ...(e.name !== undefined ? { primaryContact: (e.name ?? "").slice(0, 120) } : {}),
        ...(e.phone !== undefined ? { phone: e.phone || null, phoneDigits: e.phone ? phoneDigits(e.phone) || null : null } : {}),
        ...(e.email !== undefined ? { email: e.email?.toLowerCase() || null } : {}),
      },
    });
  }
  if (m.jobId && (e.equipment !== undefined || e.issue !== undefined || e.urgent !== undefined)) {
    await db.job.update({ where: { id: m.jobId }, data: { ...(e.equipment ? { equipmentType: e.equipment } : {}), ...(e.issue !== undefined ? { issue: (e.issue ?? "").slice(0, 2000) } : {}), ...(e.urgent !== undefined ? { urgent: e.urgent } : {}) } });
  }
  const ex = m.extractedJson ? (JSON.parse(m.extractedJson) as MessageExtraction) : null;
  const merged = ex ? { ...ex, ...Object.fromEntries(Object.entries(e).filter(([k, v]) => k !== "urgent" && v !== undefined)), ...(e.urgent !== undefined ? { urgency: e.urgent ? "urgent" : ex.urgency === "urgent" ? "normal" : ex.urgency } : {}) } : ex;
  await db.message.update({ where: { id: messageId }, data: { status: "accepted", extractedJson: merged ? JSON.stringify(merged) : m.extractedJson } });
  await logActivity({ customerId: m.customerId, jobId: m.jobId, type: "system", text: Object.keys(e).length ? "Message reviewed and corrected" : "Message reviewed", actor: input.actor });
  return { ok: true as const, stage: (m.job?.stage ?? null) as Stage | null };
}

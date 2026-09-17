import { db } from "@/lib/db";
import fs from "node:fs/promises";
import path from "node:path";
import { extractCall, type CallExtraction } from "@/lib/ai/extract-call";
import { proposeChanges, type JobSnapshot, type ProposedChange } from "@/lib/pipeline/call-diff";
import { transcriptionAdapter } from "@/integrations";
import { STAGE_LABEL, isStage, phoneDigits, type Stage } from "@/lib/domain/types";
import { computeTotals } from "@/lib/quotes/totals";
import { getSettings } from "./settings";
import { logActivity, notify } from "./activity";
import { createCustomer, findMatchingCustomer } from "./customers";
import { createJob, markContacted, scheduleJob, setStage } from "./jobs";

/**
 * Inbound calls we didn't answer (Twilio no-answer, voicemail, or the simulated ringing UI):
 * find or create the customer, create a needs_quote lead or flag the open job, write Activity.
 * Today's rules put an unreturned missed call right under equipment-down.
 */
export async function recordInboundCall(input: { number: string; status: "missed" | "completed"; externalId?: string | null; transcript?: string | null; recordingUrl?: string | null; durationSec?: number; actor?: string }) {
  if (input.externalId) {
    const existing = await db.call.findFirst({ where: { recordingPath: `ext:${input.externalId}` } });
    if (existing) return { call: existing, duplicate: true, jobId: existing.jobId, created: false };
  }
  const match = await findMatchingCustomer({ phone: input.number });
  let customerId = match?.customer.id ?? null;
  let createdCustomer = false;
  if (!customerId) {
    const c = await createCustomer({ businessName: `Caller ${input.number}`, phone: input.number, type: "other" }, input.actor ?? "phone");
    customerId = c.id;
    createdCustomer = true;
  }
  const open = await db.job.findFirst({ where: { customerId, stage: { notIn: ["done", "lost"] } }, orderBy: { createdAt: "desc" } });
  let jobId = open?.id ?? null;
  let createdJob = false;
  if (!jobId && input.status === "missed") {
    const job = await createJob({ customerId, source: "call", issue: input.transcript ? `Voicemail: ${input.transcript.slice(0, 500)}` : "Missed call — call back to find out what they need", equipmentType: "other" }, input.actor ?? "phone");
    jobId = job.id;
    createdJob = true;
  }
  const call = await db.call.create({
    data: {
      direction: "inbound",
      number: input.number,
      numberDigits: phoneDigits(input.number),
      status: input.status,
      durationSec: input.durationSec ?? 0,
      endedAt: new Date(),
      transcript: input.transcript ?? null,
      summary: input.status === "missed" ? (input.transcript ? "Voicemail left" : "Missed call, no voicemail") : null,
      recordingPath: input.externalId ? `ext:${input.externalId}` : input.recordingUrl ?? null,
      customerId,
      jobId,
    },
  });
  await logActivity({ customerId, jobId, type: input.status === "missed" ? "missed_call" : "call", text: input.status === "missed" ? `Missed call from ${input.number}${input.transcript ? ` — voicemail: “${input.transcript.slice(0, 120)}”` : ""}` : `Inbound call from ${input.number}`, actor: "customer" });
  if (input.status === "missed") await notify({ text: `Missed call from ${match?.customer.businessName ?? input.number}`, href: jobId ? `/jobs/${jobId}` : "/dialer" });
  return { call, duplicate: false, jobId, created: createdJob, createdCustomer };
}

// ---------------------------------------------------------------------------------------------
// Outbound / answered calls from the dialer
// ---------------------------------------------------------------------------------------------

export async function startCall(input: { number: string; direction: "inbound" | "outbound"; jobId?: string | null; customerId?: string | null; actor: string }) {
  const digits = phoneDigits(input.number);
  let customerId = input.customerId ?? null;
  let jobId = input.jobId ?? null;
  if (!customerId) customerId = (await findMatchingCustomer({ phone: input.number }))?.customer.id ?? null;
  if (customerId && !jobId) jobId = (await db.job.findFirst({ where: { customerId, stage: { notIn: ["done", "lost"] } }, orderBy: [{ urgent: "desc" }, { createdAt: "desc" }] }))?.id ?? null;
  const call = await db.call.create({ data: { direction: input.direction, number: input.number, numberDigits: digits, status: "in_progress", customerId, jobId } });
  return call;
}

export async function endCall(id: string, input: { durationSec: number; actor: string; answered?: boolean }) {
  const call = await db.call.findUnique({ where: { id } });
  if (!call) throw new Error("Call not found");
  const answered = input.answered ?? input.durationSec > 0;
  const updated = await db.call.update({ where: { id }, data: { status: answered ? "completed" : "missed", durationSec: Math.max(0, Math.round(input.durationSec)), endedAt: new Date() } });
  if (call.direction === "outbound" && answered) {
    await logActivity({ customerId: call.customerId, jobId: call.jobId, type: "call", text: `Called ${call.number} — ${Math.max(1, Math.round(input.durationSec / 60))} min`, actor: input.actor });
    if (call.jobId) await markContacted(call.jobId, { actor: input.actor, via: "call", note: `Called customer (${Math.max(1, Math.round(input.durationSec / 60))} min)` });
  } else if (call.direction === "outbound") {
    await logActivity({ customerId: call.customerId, jobId: call.jobId, type: "call", text: `Called ${call.number} — no answer`, actor: input.actor });
    if (call.jobId) await markContacted(call.jobId, { actor: input.actor, via: "call", note: "Called — no answer" });
  }
  return updated;
}

const RECORDINGS_DIR = process.env.RECORDINGS_DIR ?? path.resolve(process.cwd(), "data", "recordings");

/** Audio from the browser → transcription → extraction. Returns whatever it could get. */
export async function attachRecording(id: string, file: File | Blob, opts: { actor: string; mimeType?: string }) {
  const call = await db.call.findUnique({ where: { id } });
  if (!call) throw new Error("Call not found");
  const mime = opts.mimeType ?? (file as Blob).type ?? "audio/webm";
  const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : mime.includes("wav") ? "wav" : "webm";
  let recordingPath: string | null = null;
  try {
    await fs.mkdir(RECORDINGS_DIR, { recursive: true });
    const p = path.join(/* turbopackIgnore: true */ RECORDINGS_DIR, `${id}.${ext}`);
    await fs.writeFile(p, Buffer.from(await file.arrayBuffer()));
    recordingPath = p;
  } catch {
    recordingPath = null; // read-only filesystem (serverless): keep going without the file
  }
  await db.call.update({ where: { id }, data: { recordingPath, recordingMime: mime } });
  if (file.size < 1500) return { ok: false as const, reason: "empty", message: "The recording was empty or too short. Type what was said instead." };
  const stt = transcriptionAdapter();
  const r = await stt.transcribe(file, { filename: `${id}.${ext}` });
  if (!r.text || r.text.trim().length < 3) return { ok: false as const, reason: r.error ? "failed" : "silent", message: r.error ? `Transcription failed (${r.error}). Type what was said instead.` : "We couldn't hear anything on the recording. Type what was said instead." };
  return attachTranscript(id, r.text, { actor: opts.actor, engine: stt.kind === "real" ? "groq" : "typed" });
}

/** Typed notes or a transcript → extraction → proposed changes (auto-applied if the owner opted in). */
export async function attachTranscript(id: string, transcript: string, opts: { actor: string; engine?: string }) {
  const call = await db.call.findUnique({ where: { id }, include: { job: { include: { customer: true, quotes: { orderBy: { createdAt: "desc" }, take: 1 } } } } });
  if (!call) throw new Error("Call not found");
  const text = transcript.trim().slice(0, 20_000);
  const ctx = call.job ? { business: call.job.customer.businessName, stage: call.job.stage, equipment: call.job.equipmentType, issue: call.job.issue } : undefined;
  const { data: ex, engine } = await extractCall(text, ctx);
  const changes = call.job ? proposeChanges(ex, snapshot(call.job)) : [];
  await db.call.update({ where: { id }, data: { transcript: text, summary: ex.summary, extractedJson: JSON.stringify({ ...ex, changes, engine, source: opts.engine ?? "typed" }) } });
  await logActivity({ customerId: call.customerId, jobId: call.jobId, type: "call", text: `Call summary: ${ex.summary.slice(0, 200)}`, actor: opts.actor });
  const settings = await getSettings();
  let applied: ProposedChange[] | null = null;
  if (settings.autoApplyCalls && changes.length > 0) {
    applied = (await applyCall(id, { fields: changes.map((c) => c.field), actor: `${opts.actor} (auto-apply)` })).applied;
  }
  return { ok: true as const, transcript: text, extraction: ex, changes, engine, applied };
}

function snapshot(job: { stage: string; urgent: boolean; issue: string; equipmentType: string; scheduledFor: Date | null; quotes: { total: number; status: string }[] }): JobSnapshot {
  return { stage: job.stage as Stage, urgent: job.urgent, issue: job.issue, equipmentType: job.equipmentType, scheduledFor: job.scheduledFor, quoteTotal: job.quotes[0]?.total ?? null, quoteStatus: job.quotes[0]?.status ?? null };
}

/** Apply the ticked changes. Idempotent: applying twice changes nothing the second time. */
export async function applyCall(id: string, input: { fields: string[]; actor: string }) {
  const call = await db.call.findUnique({ where: { id }, include: { job: { include: { customer: true, quotes: { orderBy: { createdAt: "desc" }, take: 1 } } } } });
  if (!call) throw new Error("Call not found");
  if (!call.job || !call.extractedJson) throw new Error("Nothing to apply — link this call to a job first.");
  const stored = JSON.parse(call.extractedJson) as CallExtraction & { changes?: ProposedChange[] };
  // Recompute against the *current* job so a stale review can't undo newer work.
  const changes = proposeChanges(stored, snapshot(call.job)).filter((c) => input.fields.includes(c.field));
  const job = call.job;
  const applied: ProposedChange[] = [];
  const data: Record<string, unknown> = {};
  for (const c of changes) {
    if (c.field === "urgent") data.urgent = c.value;
    if (c.field === "issue") data.issue = c.value;
    if (c.field === "equipmentType") data.equipmentType = c.value;
  }
  if (Object.keys(data).length) {
    await db.job.update({ where: { id: job.id }, data });
    applied.push(...changes.filter((c) => c.field in data));
  }
  const quote = changes.find((c) => c.field === "quote");
  if (quote && typeof quote.value === "number") {
    const totals = computeTotals([{ description: "Service as discussed on the phone", qty: 1, unitPrice: quote.value }], 0);
    const draft = job.quotes[0]?.status === "draft" ? job.quotes[0] : null;
    if (draft) {
      await db.quoteItem.deleteMany({ where: { quoteId: draft.id } });
      await db.quote.update({ where: { id: draft.id }, data: { subtotal: totals.subtotal, tax: totals.tax, total: totals.total, items: { create: totals.lines.map((l, i) => ({ description: l.description, qty: l.qty, unitPrice: l.unitPrice, sortOrder: i })) } } });
    } else {
      await db.quote.create({ data: { jobId: job.id, customerId: job.customerId, taxRate: 0, subtotal: totals.subtotal, tax: totals.tax, total: totals.total, status: "draft", notes: `Drafted from the call on ${call.startedAt.toLocaleDateString("en-US")}.`, items: { create: totals.lines.map((l, i) => ({ description: l.description, qty: l.qty, unitPrice: l.unitPrice, sortOrder: i })) } } });
    }
    await logActivity({ customerId: job.customerId, jobId: job.id, type: "quote", text: `Draft quote $${quote.value.toLocaleString()} from the call`, actor: input.actor });
    applied.push(quote);
  }
  const when = changes.find((c) => c.field === "scheduledFor");
  const stage = changes.find((c) => c.field === "stage");
  if (when && typeof when.value === "string") {
    await scheduleJob(job.id, { scheduledFor: new Date(when.value), actor: input.actor });
    applied.push(when);
    if (stage && stage.value === "scheduled") applied.push(stage);
  } else if (stage && isStage(String(stage.value))) {
    const to = stage.value as Stage;
    await setStage(job.id, to, { actor: input.actor, lostReason: to === "lost" ? `Declined on the phone: ${stored.summary.slice(0, 200)}` : null, note: `From the call — Stage → ${STAGE_LABEL[to]}` });
    if (to === "approved") await db.quote.updateMany({ where: { jobId: job.id, status: "sent" }, data: { status: "accepted", respondedAt: new Date(), customerComment: "Approved on the phone" } });
    if (to === "lost") await db.quote.updateMany({ where: { jobId: job.id, status: "sent" }, data: { status: "declined", respondedAt: new Date(), customerComment: "Declined on the phone" } });
    applied.push(stage);
  }
  const note = changes.find((c) => c.field === "note");
  if (note && typeof note.value === "string") {
    await logActivity({ customerId: job.customerId, jobId: job.id, type: "note", text: note.value, actor: input.actor });
    applied.push(note);
  }
  await db.job.update({ where: { id: job.id }, data: { lastContactAt: new Date() } });
  await db.call.update({ where: { id }, data: { applied: true, appliedAt: new Date() } });
  await logActivity({ customerId: job.customerId, jobId: job.id, type: "system", text: applied.length ? `Applied from call: ${applied.map((c) => `${c.label} → ${c.new}`).join("; ")}` : "Call reviewed — nothing to change", actor: input.actor });
  return { applied };
}

export const SAMPLE_CALLS = [
  {
    key: "urgent-with-price",
    label: "New urgent request — freezer down, price mentioned",
    transcript:
      "Denise: Denise's Refrigeration, this is Denise. Customer: Hi Denise, it's Rosa at Rosa's Taqueria. Our walk-in freezer went down last night, it's sitting at 30 degrees and climbing and I've got a full weekend of product in there. Denise: Okay, that's a compressor or a charge issue, we treat that as an emergency. I can have Luis there this afternoon. For a compressor swap you're looking at around eighteen hundred all in, less if it's just refrigerant. Customer: Whatever it takes, please just get someone here today. Denise: You got it. I'll text you when he's on the way.",
  },
  {
    key: "approve-quote",
    label: "Customer approving a quote",
    transcript:
      "Customer: Hi, this is Tom from Big Sky Grocery, calling about the quote for the Northside walk-in. Denise: Hi Tom, the $1,059 one for the fan motor and recharge? Customer: That's the one. Go ahead and schedule it, that price is fine. Denise: Great, I'll get you on the calendar this week. Customer: Mornings work best for us. Denise: Noted, mornings. Thanks Tom.",
  },
  {
    key: "pick-a-date",
    label: "Customer picking a date",
    transcript:
      "Denise: Hi Linh, Denise here, calling to get the Pho 88 door repair on the schedule. Customer: Perfect. Can you do Tuesday morning? Denise: Tuesday at 9 works, I'll send Marcus. Customer: Tuesday at 9, great, we'll have the back door unlocked. Denise: See you then.",
  },
];

/** A scripted call that runs through the same transcription/extraction path (minus audio). */
export async function playSampleCall(key: string, input: { jobId?: string | null; number?: string | null; actor: string }) {
  const sample = SAMPLE_CALLS.find((s) => s.key === key);
  if (!sample) throw new Error("Unknown sample");
  let jobId = input.jobId ?? null;
  let number = input.number ?? null;
  if (!jobId) {
    // Pick the seeded job the script is about, if it exists; otherwise the first open job.
    const business = key === "urgent-with-price" ? "Rosa's Taqueria" : key === "approve-quote" ? "Big Sky Grocery" : "Pho 88";
    const job = (await db.job.findFirst({ where: { customer: { businessName: business }, stage: { notIn: ["done", "lost"] } }, orderBy: { createdAt: "desc" }, include: { customer: true } })) ?? (await db.job.findFirst({ where: { stage: { notIn: ["done", "lost"] } }, orderBy: { createdAt: "desc" }, include: { customer: true } }));
    if (!job) throw new Error("No open job to attach the sample call to.");
    jobId = job.id;
    number = job.customer.phone ?? "(512) 555-0100";
  }
  const job = await db.job.findUnique({ where: { id: jobId }, include: { customer: true } });
  if (!job) throw new Error("Job not found");
  const call = await startCall({ number: number ?? job.customer.phone ?? "(512) 555-0100", direction: key === "approve-quote" ? "inbound" : "outbound", jobId: job.id, customerId: job.customerId, actor: input.actor });
  await endCall(call.id, { durationSec: 95 + Math.floor(Math.random() * 60), actor: input.actor, answered: true });
  const result = await attachTranscript(call.id, sample.transcript, { actor: input.actor, engine: "sample" });
  return { callId: call.id, jobId: job.id, ...result };
}

export async function recentCalls(limit = 20) {
  return db.call.findMany({ orderBy: { startedAt: "desc" }, take: limit, include: { customer: { select: { id: true, businessName: true } }, job: { select: { id: true, stage: true } } } });
}

export async function lookupByDigits(digits: string) {
  const d = digits.replace(/\D/g, "");
  if (d.length < 3) return [];
  return db.customer.findMany({ where: { phoneDigits: { contains: d } }, take: 6, include: { jobs: { where: { stage: { notIn: ["done", "lost"] } }, orderBy: [{ urgent: "desc" }, { createdAt: "desc" }], take: 1, select: { id: true, stage: true, issue: true, urgent: true } } } });
}

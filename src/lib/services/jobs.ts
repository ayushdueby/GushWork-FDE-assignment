import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { STAGE_LABEL, isForwardMove, isOpenStage, isSource, isStage, nextStage, type Source, type Stage } from "@/lib/domain/types";
import { logActivity, notify } from "./activity";

export type JobWithCustomer = Prisma.JobGetPayload<{ include: { customer: true; tech: true; site: true } }>;

function clean(v: string | null | undefined, max = 2000): string {
  return (v ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
}

export interface JobFilters {
  stage?: string | null;
  source?: string | null;
  techId?: string | null;
  urgent?: boolean | null;
  q?: string | null;
  includeClosed?: boolean;
  customerId?: string | null;
}

export async function listJobs(f: JobFilters = {}) {
  const where: Prisma.JobWhereInput = {};
  if (f.stage && isStage(f.stage)) where.stage = f.stage;
  else if (!f.includeClosed) where.stage = { notIn: ["done", "lost"] };
  if (f.source && isSource(f.source)) where.source = f.source;
  if (f.techId) where.techId = f.techId;
  if (f.urgent) where.urgent = true;
  if (f.customerId) where.customerId = f.customerId;
  if (f.q?.trim()) {
    const q = f.q.trim();
    const digits = q.replace(/\D/g, "");
    where.OR = [
      { issue: { contains: q } },
      { customer: { businessName: { contains: q } } },
      { customer: { primaryContact: { contains: q } } },
      ...(digits.length >= 3 ? [{ customer: { phoneDigits: { contains: digits } } }] : []),
    ];
  }
  return db.job.findMany({ where, include: { customer: true, tech: true, site: true }, orderBy: [{ urgent: "desc" }, { updatedAt: "desc" }], take: 500 });
}

export async function getJobDetail(id: string) {
  return db.job.findUnique({
    where: { id },
    include: {
      customer: { include: { sites: { include: { equipment: true } } } },
      site: true,
      equipment: true,
      tech: true,
      quotes: { include: { items: { orderBy: { sortOrder: "asc" } } }, orderBy: { createdAt: "desc" } },
      calls: { orderBy: { startedAt: "desc" } },
      messages: { orderBy: { receivedAt: "desc" } },
      activities: { orderBy: { at: "desc" }, take: 200 },
    },
  });
}

export interface CreateJobInput {
  customerId: string;
  siteId?: string | null;
  equipmentId?: string | null;
  equipmentType?: string | null;
  source?: Source | string | null;
  issue?: string | null;
  urgent?: boolean;
  stage?: Stage;
  createdAt?: Date;
  lastContactAt?: Date | null;
}

export async function createJob(input: CreateJobInput, actor = "system") {
  const job = await db.job.create({
    data: {
      customerId: input.customerId,
      siteId: input.siteId ?? null,
      equipmentId: input.equipmentId ?? null,
      equipmentType: clean(input.equipmentType, 40) || "other",
      source: isSource(input.source) ? input.source : "call",
      issue: clean(input.issue, 2000),
      urgent: !!input.urgent,
      stage: input.stage && isStage(input.stage) ? input.stage : "needs_quote",
      createdAt: input.createdAt,
      lastContactAt: input.lastContactAt ?? null,
    },
    include: { customer: true },
  });
  await logActivity({
    customerId: job.customerId,
    jobId: job.id,
    type: "system",
    text: `Job created from ${job.source.replace("_", " ")}${job.urgent ? " — marked urgent" : ""}${job.issue ? `: ${job.issue.slice(0, 120)}` : ""}`,
    actor,
    at: input.createdAt,
  });
  return job;
}

export interface JobPatch {
  issue?: string;
  equipmentType?: string;
  urgent?: boolean;
  source?: string;
  siteId?: string | null;
  equipmentId?: string | null;
  techId?: string | null;
}

export async function updateJob(id: string, patch: JobPatch, actor = "system") {
  const before = await db.job.findUnique({ where: { id } });
  if (!before) throw new Error("Job not found");
  const data: Prisma.JobUpdateInput = {};
  if (patch.issue !== undefined) data.issue = clean(patch.issue, 2000);
  if (patch.equipmentType !== undefined) data.equipmentType = clean(patch.equipmentType, 40) || "other";
  if (patch.urgent !== undefined) data.urgent = patch.urgent;
  if (patch.source !== undefined && isSource(patch.source)) data.source = patch.source;
  if (patch.siteId !== undefined) data.site = patch.siteId ? { connect: { id: patch.siteId } } : { disconnect: true };
  if (patch.equipmentId !== undefined) data.equipment = patch.equipmentId ? { connect: { id: patch.equipmentId } } : { disconnect: true };
  if (patch.techId !== undefined) data.tech = patch.techId ? { connect: { id: patch.techId } } : { disconnect: true };
  const job = await db.job.update({ where: { id }, data, include: { customer: true, tech: true } });
  const changes: string[] = [];
  if (patch.urgent !== undefined && patch.urgent !== before.urgent) changes.push(patch.urgent ? "marked urgent" : "urgent cleared");
  if (patch.issue !== undefined && clean(patch.issue, 2000) !== before.issue) changes.push("issue updated");
  if (patch.equipmentType !== undefined && patch.equipmentType !== before.equipmentType) changes.push(`equipment → ${patch.equipmentType}`);
  if (patch.techId !== undefined && patch.techId !== before.techId) changes.push(job.tech ? `assigned to ${job.tech.name}` : "tech unassigned");
  if (changes.length) await logActivity({ customerId: job.customerId, jobId: id, type: "system", text: `Job edited: ${changes.join(", ")}`, actor });
  return job;
}

/**
 * Move a job between stages with the contact rule from the spec:
 * forward moves count as contact; backward moves and "lost" don't.
 */
export async function setStage(id: string, to: Stage, opts: { lostReason?: string | null; actor?: string; scheduledFor?: Date | null; techId?: string | null; note?: string | null; silent?: boolean } = {}) {
  if (!isStage(to)) throw new Error("Unknown stage");
  const job = await db.job.findUnique({ where: { id }, include: { customer: true } });
  if (!job) throw new Error("Job not found");
  const from = job.stage as Stage;
  if (from === to) return job; // double-click safe: no duplicate activity, no skipped stage
  if (to === "lost" && !clean(opts.lostReason, 300)) throw new Error("Please give a reason for marking this lost.");
  if (to === "scheduled" && !(opts.scheduledFor ?? job.scheduledFor)) throw new Error("Pick a date to schedule this job.");

  const now = new Date();
  const data: Prisma.JobUpdateInput = { stage: to };
  if (isForwardMove(from, to)) data.lastContactAt = now;
  if (to === "lost") data.lostReason = clean(opts.lostReason, 300);
  else data.lostReason = null;
  if (to === "done") data.completedAt = now;
  else if (from === "done") data.completedAt = null;
  if (opts.scheduledFor) data.scheduledFor = opts.scheduledFor;
  if (opts.techId !== undefined) data.tech = opts.techId ? { connect: { id: opts.techId } } : { disconnect: true };

  const updated = await db.job.update({ where: { id }, data, include: { customer: true, tech: true } });
  const actor = opts.actor ?? "system";
  await logActivity({
    customerId: job.customerId,
    jobId: id,
    type: "stage",
    text: clean(opts.note, 300) || `Stage → ${STAGE_LABEL[to]}${to === "lost" && opts.lostReason ? ` (${clean(opts.lostReason, 300)})` : ""}`,
    actor,
  });
  return updated;
}

/** "Move to next stage" from Today. Returns what the UI must ask for, if anything. */
export function nextStageRequirement(stage: Stage): { next: Stage | null; needs: "quote" | "schedule" | null } {
  const next = nextStage(stage);
  if (!next) return { next: null, needs: null };
  if (next === "waiting_on_yes") return { next, needs: "quote" };
  if (next === "scheduled") return { next, needs: "schedule" };
  return { next, needs: null };
}

export async function markContacted(id: string, opts: { actor?: string; via?: "call" | "sms" | "email" | "manual"; note?: string | null } = {}) {
  const job = await db.job.findUnique({ where: { id } });
  if (!job) throw new Error("Job not found");
  const now = new Date();
  const updated = await db.job.update({ where: { id }, data: { lastContactAt: now } });
  const via = opts.via ?? "manual";
  const verb = via === "call" ? "Called customer" : via === "sms" ? "Texted customer" : via === "email" ? "Emailed customer" : "Marked contacted";
  await logActivity({ customerId: job.customerId, jobId: id, type: "contact", text: clean(opts.note, 500) || verb, actor: opts.actor ?? "system", at: now });
  return updated;
}

export async function addJobNote(id: string, text: string, actor = "system") {
  const job = await db.job.findUnique({ where: { id } });
  if (!job) throw new Error("Job not found");
  const body = clean(text, 4000);
  if (!body) throw new Error("Note is empty.");
  await db.job.update({ where: { id }, data: { updatedAt: new Date() } });
  return logActivity({ customerId: job.customerId, jobId: id, type: "note", text: body, actor });
}

export async function scheduleJob(id: string, input: { scheduledFor: Date; techId?: string | null; durationMin?: number; actor?: string; notifyTech?: (job: JobWithCustomer) => Promise<void> }) {
  const job = await db.job.findUnique({ where: { id }, include: { customer: true, tech: true, site: true } });
  if (!job) throw new Error("Job not found");
  if (Number.isNaN(input.scheduledFor.getTime())) throw new Error("Pick a valid date and time.");
  const durationMin = input.durationMin ?? 120;
  const end = new Date(input.scheduledFor.getTime() + durationMin * 60_000);
  const techId = input.techId === undefined ? job.techId : input.techId;

  // Double-booking check: same tech, overlapping window, another open job.
  let conflict: { id: string; issue: string; customer: { businessName: string } } | null = null;
  if (techId) {
    const overlapping = await db.job.findFirst({
      where: { id: { not: id }, techId, stage: "scheduled", scheduledFor: { lt: end }, scheduledEnd: { gt: input.scheduledFor } },
      include: { customer: { select: { businessName: true } } },
    });
    if (overlapping) conflict = { id: overlapping.id, issue: overlapping.issue, customer: overlapping.customer };
  }

  const wasScheduled = job.stage === "scheduled";
  const forward = isForwardMove(job.stage as Stage, "scheduled");
  const updated = await db.job.update({
    where: { id },
    data: { stage: "scheduled", scheduledFor: input.scheduledFor, scheduledEnd: end, techId: techId ?? null, ...(forward ? { lastContactAt: new Date() } : {}), lostReason: null },
    include: { customer: true, tech: true, site: true },
  });
  const when = input.scheduledFor.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  await logActivity({
    customerId: job.customerId,
    jobId: id,
    type: "schedule",
    text: `${wasScheduled ? "Rescheduled" : "Scheduled"} for ${when}${updated.tech ? ` with ${updated.tech.name}` : ""}${conflict ? " — WARNING: overlaps another job" : ""}`,
    actor: input.actor ?? "system",
  });
  if (!wasScheduled) await logActivity({ customerId: job.customerId, jobId: id, type: "stage", text: `Stage → ${STAGE_LABEL.scheduled}`, actor: input.actor ?? "system" });
  if (input.notifyTech && updated.tech) await input.notifyTech(updated);
  return { job: updated, conflict };
}

export async function completeJob(id: string, input: { notes?: string; photo?: string | null; actor?: string }) {
  const job = await db.job.findUnique({ where: { id }, include: { customer: true } });
  if (!job) throw new Error("Job not found");
  if (job.stage === "done") return job;
  const now = new Date();
  const updated = await db.job.update({
    where: { id },
    data: { stage: "done", completedAt: now, completionNotes: clean(input.notes, 4000), completionPhoto: input.photo ?? null, lastContactAt: now },
    include: { customer: true },
  });
  await logActivity({ customerId: job.customerId, jobId: id, type: "stage", text: `Stage → Done${input.notes ? ` — ${clean(input.notes, 300)}` : ""}`, actor: input.actor ?? "system", at: now });
  await notify({ text: `${job.customer.businessName}: job marked done${input.actor ? ` by ${input.actor}` : ""}`, href: `/jobs/${id}` });
  return updated;
}

export async function openJobsForCustomer(customerId: string) {
  return db.job.findMany({ where: { customerId, stage: { notIn: ["done", "lost"] } }, orderBy: { createdAt: "desc" } });
}

export { isOpenStage };

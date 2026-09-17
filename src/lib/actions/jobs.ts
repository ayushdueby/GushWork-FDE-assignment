"use server";

import { db } from "@/lib/db";
import { STAGE_LABEL, isStage, type Stage } from "@/lib/domain/types";
import { addJobNote, completeJob, createJob, markContacted, nextStageRequirement, scheduleJob, setStage, updateJob } from "@/lib/services/jobs";
import { createCustomer } from "@/lib/services/customers";
import { computeTotals } from "@/lib/quotes/totals";
import { logActivity } from "@/lib/services/activity";
import { smsAdapter } from "@/integrations";
import { getSettings } from "@/lib/services/settings";
import { guarded, num, refreshAll, str } from "./util";

export async function markContactedAction(fd: FormData) {
  return guarded("write:crm", async (user) => {
    const id = str(fd, "jobId");
    const via = (str(fd, "via") || "manual") as "call" | "sms" | "email" | "manual";
    await markContacted(id, { actor: user.name, via, note: str(fd, "note") || null });
    refreshAll();
    return { message: "Marked as contacted" };
  });
}

export async function setStageAction(fd: FormData) {
  return guarded("write:crm", async (user) => {
    const id = str(fd, "jobId");
    const to = str(fd, "stage");
    if (!isStage(to)) throw new Error("Unknown stage");
    await setStage(id, to, { actor: user.name, lostReason: str(fd, "lostReason") || null });
    refreshAll();
    return { message: `Moved to ${STAGE_LABEL[to]}` };
  });
}

/**
 * "Move to next stage" from Today. Quote amount / schedule date arrive when needed.
 * Double-click safe: the service ignores a same-stage move.
 */
export async function advanceStageAction(fd: FormData) {
  return guarded("write:crm", async (user) => {
    const id = str(fd, "jobId");
    const expectedFrom = str(fd, "from");
    const job = await db.job.findUnique({ where: { id }, include: { customer: true } });
    if (!job) throw new Error("Job not found");
    if (expectedFrom && job.stage !== expectedFrom) return { message: `Already moved to ${STAGE_LABEL[job.stage as Stage]}`, stage: job.stage };
    const { next, needs } = nextStageRequirement(job.stage as Stage);
    if (!next) throw new Error("This job is already done.");

    if (needs === "quote") {
      const amount = num(fd, "amount");
      if (amount == null || amount <= 0) throw new Error("Enter the quote amount to send it.");
      const settings = await getSettings();
      const totals = computeTotals([{ description: str(fd, "description") || "Service as discussed", qty: 1, unitPrice: amount }], 0);
      await db.quote.create({
        data: {
          jobId: id,
          customerId: job.customerId,
          taxRate: 0,
          subtotal: totals.subtotal,
          tax: totals.tax,
          total: totals.total,
          status: "sent",
          sentAt: new Date(),
          notes: `Quick quote from Today by ${user.name}. Tax not itemised.`,
          items: { create: totals.lines.map((l, i) => ({ description: l.description, qty: l.qty, unitPrice: l.unitPrice, sortOrder: i })) },
        },
      });
      void settings;
      await logActivity({ customerId: job.customerId, jobId: id, type: "quote", text: `Quote sent — $${totals.total.toFixed(2)}`, actor: user.name });
      await setStage(id, next, { actor: user.name });
      refreshAll();
      return { message: `Quote for $${totals.total.toLocaleString()} sent — moved to Waiting on yes`, stage: next };
    }

    if (needs === "schedule") {
      const when = str(fd, "scheduledFor");
      const date = when ? new Date(when) : null;
      if (!date || Number.isNaN(date.getTime())) throw new Error("Pick a date and time for the visit.");
      const techId = str(fd, "techId") || null;
      const { conflict } = await scheduleJob(id, {
        scheduledFor: date,
        techId,
        actor: user.name,
        notifyTech: async (j) => {
          if (!j.tech?.phone) return;
          await smsAdapter().send({ to: j.tech.phone, text: `New job: ${j.customer.businessName} — ${j.issue.slice(0, 80)} on ${date.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}. ${j.site?.address ?? ""}` });
        },
      });
      refreshAll();
      return { message: conflict ? `Scheduled — but it overlaps ${conflict.customer.businessName}` : "Scheduled", stage: next, conflict: !!conflict };
    }

    if (next === "done") {
      await completeJob(id, { actor: user.name });
      refreshAll();
      return { message: "Marked done", stage: next };
    }
    await setStage(id, next, { actor: user.name });
    refreshAll();
    return { message: `Moved to ${STAGE_LABEL[next]}`, stage: next };
  });
}

export async function updateJobAction(fd: FormData) {
  return guarded("write:crm", async (user) => {
    const id = str(fd, "jobId");
    await updateJob(
      id,
      {
        issue: str(fd, "issue"),
        equipmentType: str(fd, "equipmentType"),
        urgent: str(fd, "urgent") === "on" || str(fd, "urgent") === "true",
        source: str(fd, "source"),
        siteId: fd.has("siteId") ? str(fd, "siteId") || null : undefined,
        equipmentId: fd.has("equipmentId") ? str(fd, "equipmentId") || null : undefined,
        techId: fd.has("techId") ? str(fd, "techId") || null : undefined,
      },
      user.name,
    );
    refreshAll();
    return { message: "Saved" };
  });
}

export async function addNoteAction(fd: FormData) {
  return guarded("write:crm", async (user) => {
    await addJobNote(str(fd, "jobId"), str(fd, "text"), user.name);
    refreshAll();
    return { message: "Note added" };
  });
}

export async function scheduleJobAction(fd: FormData) {
  return guarded("write:crm", async (user) => {
    const id = str(fd, "jobId");
    const date = new Date(str(fd, "scheduledFor"));
    if (Number.isNaN(date.getTime())) throw new Error("Pick a date and time.");
    const { conflict } = await scheduleJob(id, {
      scheduledFor: date,
      techId: str(fd, "techId") || null,
      durationMin: num(fd, "durationMin") ?? 120,
      actor: user.name,
      notifyTech: async (j) => {
        if (!j.tech?.phone) return;
        await smsAdapter().send({ to: j.tech.phone, text: `New job: ${j.customer.businessName} — ${j.issue.slice(0, 80)} on ${date.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}. ${j.site?.address ?? ""}` });
      },
    });
    refreshAll();
    return { message: conflict ? `Scheduled, but it overlaps ${conflict.customer.businessName} (${conflict.issue.slice(0, 40)})` : "Scheduled", conflict: conflict ? `${conflict.customer.businessName}: ${conflict.issue}` : null };
  });
}

export async function createJobAction(fd: FormData) {
  return guarded("write:crm", async (user) => {
    let customerId = str(fd, "customerId");
    if (!customerId) {
      const businessName = str(fd, "businessName");
      const contact = str(fd, "primaryContact");
      const phone = str(fd, "phone");
      if (!businessName && !contact) throw new Error("Add a business or contact name.");
      if (!phone && !str(fd, "email") && !str(fd, "issue")) throw new Error("Add a phone, an email, or a description.");
      const c = await createCustomer({ businessName: businessName || contact, primaryContact: contact, phone, email: str(fd, "email"), type: str(fd, "type") || "restaurant", address: str(fd, "address") }, user.name);
      customerId = c.id;
    }
    const job = await createJob(
      { customerId, source: str(fd, "source") || "call", issue: str(fd, "issue"), equipmentType: str(fd, "equipmentType") || "other", urgent: str(fd, "urgent") === "on" || str(fd, "urgent") === "true", siteId: str(fd, "siteId") || null },
      user.name,
    );
    refreshAll();
    return { message: "Job created", jobId: job.id };
  });
}

/**
 * Move to any stage (kanban drop, stage dropdown). Collects what the target stage needs:
 * a quote amount (if none was sent), a schedule date, or a lost reason.
 */
export async function moveStageAction(fd: FormData) {
  return guarded("write:crm", async (user) => {
    const id = str(fd, "jobId");
    const to = str(fd, "stage");
    if (!isStage(to)) throw new Error("Unknown stage");
    const job = await db.job.findUnique({ where: { id }, include: { quotes: { where: { status: { in: ["sent", "accepted"] } }, take: 1 } } });
    if (!job) throw new Error("Job not found");
    if (job.stage === to) return { message: "Already there", stage: to };

    if (to === "waiting_on_yes" && job.quotes.length === 0) {
      const amount = num(fd, "amount");
      if (amount == null || amount <= 0) return { needs: "quote" as const, stage: job.stage };
      const totals = computeTotals([{ description: str(fd, "description") || "Service as discussed", qty: 1, unitPrice: amount }], 0);
      await db.quote.create({
        data: { jobId: id, customerId: job.customerId, taxRate: 0, subtotal: totals.subtotal, tax: totals.tax, total: totals.total, status: "sent", sentAt: new Date(), notes: `Quick quote by ${user.name}.`, items: { create: totals.lines.map((l, i) => ({ description: l.description, qty: l.qty, unitPrice: l.unitPrice, sortOrder: i })) } },
      });
      await logActivity({ customerId: job.customerId, jobId: id, type: "quote", text: `Quote sent — $${totals.total.toFixed(2)}`, actor: user.name });
    }
    if (to === "scheduled") {
      const when = str(fd, "scheduledFor");
      const date = when ? new Date(when) : job.scheduledFor;
      if (!date || Number.isNaN(date.getTime())) return { needs: "schedule" as const, stage: job.stage };
      const { conflict } = await scheduleJob(id, { scheduledFor: date, techId: fd.has("techId") ? str(fd, "techId") || null : undefined, actor: user.name });
      refreshAll();
      return { message: conflict ? `Scheduled — overlaps ${conflict.customer.businessName}` : "Scheduled", stage: to };
    }
    if (to === "lost" && !str(fd, "lostReason")) return { needs: "lostReason" as const, stage: job.stage };
    if (to === "done") {
      await completeJob(id, { actor: user.name, notes: str(fd, "notes") });
      refreshAll();
      return { message: "Marked done", stage: to };
    }
    await setStage(id, to, { actor: user.name, lostReason: str(fd, "lostReason") || null });
    refreshAll();
    return { message: `Moved to ${STAGE_LABEL[to]}`, stage: to };
  });
}

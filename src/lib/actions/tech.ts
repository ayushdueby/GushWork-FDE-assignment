"use server";

import { db } from "@/lib/db";
import { smsAdapter } from "@/integrations";
import { logActivity } from "@/lib/services/activity";
import { completeJob, markContacted } from "@/lib/services/jobs";
import { getSettings } from "@/lib/services/settings";
import { guarded, refreshAll, str } from "./util";
import type { CurrentUser } from "@/lib/auth/current";

/** Techs may only touch their own jobs; the owner may touch any. Enforced here, not in the UI. */
async function ownJob(user: CurrentUser, jobId: string) {
  const job = await db.job.findUnique({ where: { id: jobId }, include: { customer: true, tech: true, site: true } });
  if (!job) throw new Error("Job not found");
  if (user.role !== "owner" && job.techId !== user.techId) throw new Error("That job isn't assigned to you.");
  return job;
}

export async function onMyWayAction(fd: FormData) {
  return guarded("write:tech", async (user) => {
    const job = await ownJob(user, str(fd, "jobId"));
    const settings = await getSettings();
    const techName = job.tech?.name ?? user.name;
    const eta = str(fd, "eta") || "about 30 minutes";
    const first = job.customer.primaryContact.split(" ")[0] || "there";
    const text = `Hi ${first}, ${techName} from ${settings.businessName} is on the way to ${job.customer.businessName}, ETA ${eta}. Reply here if anything changes.`;
    let preview: string | null = null;
    if (job.customer.phone) {
      const r = await smsAdapter().send({ to: job.customer.phone, text });
      preview = r.preview ?? null;
      await db.message.create({ data: { channel: "sms", direction: "outbound", fromAddr: "office", toAddr: job.customer.phone, body: text, raw: r.preview ?? "", status: r.ok ? "sent" : "failed", customerId: job.customerId, jobId: job.id, threadKey: job.customer.phoneDigits ?? job.customer.phone } });
    }
    await logActivity({ customerId: job.customerId, jobId: job.id, type: "tech", text: `${techName} is on the way (ETA ${eta})${job.customer.phone ? " — customer texted" : " — no phone on file"}`, actor: user.name });
    await markContacted(job.id, { actor: user.name, via: "sms", note: "On-my-way text sent" });
    refreshAll();
    return { message: job.customer.phone ? `Customer texted${smsAdapter().kind === "simulated" ? " (simulated)" : ""}` : "Logged — no phone on file to text", preview };
  });
}

export async function markDoneAction(fd: FormData) {
  return guarded("write:tech", async (user) => {
    const job = await ownJob(user, str(fd, "jobId"));
    if (job.stage === "done") return { message: "Already marked done" };
    let photo: string | null = null;
    const file = fd.get("photo");
    if (file instanceof File && file.size > 0) {
      if (!file.type.startsWith("image/")) throw new Error("The photo must be an image.");
      if (file.size > 2 * 1024 * 1024) throw new Error("Photo is over 2 MB — pick a smaller one.");
      photo = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;
    }
    await completeJob(job.id, { notes: str(fd, "notes"), photo, actor: job.tech?.name ?? user.name });
    refreshAll();
    return { message: "Marked done — nice work" };
  });
}

"use server";

import { db } from "@/lib/db";
import { sendOutbound } from "@/lib/services/messaging";
import { sendDigest } from "@/lib/services/digest";
import { guarded, refreshAll, str } from "./util";

export async function sendMessageAction(fd: FormData) {
  return guarded("write:crm", async (user) => {
    const channel = str(fd, "channel") === "email" ? "email" : "sms";
    const to = str(fd, "to");
    const text = str(fd, "text");
    if (!to) throw new Error(`No ${channel === "sms" ? "phone number" : "email"} on file for this customer.`);
    if (!text) throw new Error("Write a message first.");
    const jobId = str(fd, "jobId") || null;
    let customerId = str(fd, "customerId") || null;
    if (!customerId && jobId) customerId = (await db.job.findUnique({ where: { id: jobId }, select: { customerId: true } }))?.customerId ?? null;
    const r = await sendOutbound({ channel, to, subject: str(fd, "subject") || undefined, text, customerId, jobId, actor: user.name, replyToMessageId: str(fd, "replyTo") || undefined });
    refreshAll();
    if (!r.result.ok) throw new Error(r.result.error ?? "Send failed");
    return { message: r.simulated ? `${channel === "sms" ? "Text" : "Email"} logged (simulated — nothing was really sent)` : `${channel === "sms" ? "Text" : "Email"} sent`, preview: r.result.preview ?? null, simulated: r.simulated };
  });
}

export async function sendDigestAction(fd: FormData) {
  return guarded("write:crm", async (user) => {
    const channel = str(fd, "channel") === "email" ? "email" : "sms";
    const r = await sendDigest(channel, user.name);
    refreshAll();
    if (!r.ok) throw new Error(r.error ?? "Send failed");
    return { message: r.simulated ? "Digest built (simulated send)" : "Digest sent", preview: r.preview, to: r.to, simulated: r.simulated, count: r.count };
  });
}

"use server";

import { ingestMessage, reviewMessage } from "@/lib/pipeline/ingest";
import { findSample } from "@/lib/pipeline/samples";
import { isEquipmentType } from "@/lib/domain/types";
import { guarded, refreshAll, str } from "./util";

export async function simulateInboundAction(fd: FormData) {
  return guarded("write:crm", async (user) => {
    const sample = findSample(str(fd, "key"));
    if (!sample) throw new Error("Unknown sample");
    // A fresh id each time so the same sample can be replayed in a demo; the pipeline still
    // dedupes real provider ids and identical content within the fingerprint.
    const r = await ingestMessage({ channel: sample.channel, from: sample.from, to: sample.channel === "sms" ? "(512) 555-0100" : "service@denisesrefrigeration.com", subject: sample.subject ?? null, body: sample.body, externalId: `sim-${sample.key}-${Date.now()}`, actor: `${user.name} (simulated)` });
    refreshAll();
    const what = r.status === "not_a_lead" ? "Filed as not a lead" : r.created.job ? "New job created" : r.applied === "approved" ? "Quote accepted — job approved" : r.applied === "lost" ? "Quote declined — job marked lost" : r.applied ? "Attached to the existing job" : "Received";
    return { message: `${sample.channel === "sms" ? "Text" : "Email"} received: ${what}`, result: { messageId: r.messageId, jobId: r.jobId, customerId: r.customerId, status: r.status, engine: r.engine } };
  });
}

export async function reviewMessageAction(fd: FormData) {
  return guarded("write:crm", async (user) => {
    const decision = str(fd, "decision") === "not_a_lead" ? "not_a_lead" : "accept";
    const edited = str(fd, "edited") === "1";
    const eq = str(fd, "equipment");
    await reviewMessage(str(fd, "messageId"), {
      decision,
      actor: user.name,
      edits: edited
        ? {
            name: str(fd, "name"),
            business: str(fd, "business"),
            phone: str(fd, "phone"),
            email: str(fd, "email"),
            equipment: isEquipmentType(eq) ? eq : undefined,
            issue: str(fd, "issue"),
            urgent: str(fd, "urgent") === "on" || str(fd, "urgent") === "true",
          }
        : undefined,
    });
    refreshAll();
    return { message: decision === "not_a_lead" ? "Marked as not a lead" : edited ? "Saved your corrections" : "Accepted" };
  });
}

export async function syncGmailAction() {
  return guarded("admin", async () => {
    const { gmailConfigured, gmailFetchInbox } = await import("@/integrations/email/gmail");
    if (!gmailConfigured()) throw new Error("Gmail isn't connected. Add GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN.");
    const msgs = await gmailFetchInbox(20);
    let created = 0;
    for (const m of msgs) {
      const r = await ingestMessage({ channel: "email", from: m.from, to: m.to, subject: m.subject, body: m.text, externalId: `gmail-${m.id}`, receivedAt: m.receivedAt, actor: "gmail sync" });
      if (!r.duplicate) created++;
    }
    refreshAll();
    return { message: `Synced ${msgs.length} messages, ${created} new` };
  });
}

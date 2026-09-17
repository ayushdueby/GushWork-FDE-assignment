import { db } from "@/lib/db";
import { phoneDigits } from "@/lib/domain/types";
import { logActivity, notify } from "./activity";
import { createCustomer, findMatchingCustomer } from "./customers";
import { createJob } from "./jobs";

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

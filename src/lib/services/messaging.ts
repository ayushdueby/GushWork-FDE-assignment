import { db } from "@/lib/db";
import { emailAdapter, smsAdapter } from "@/integrations";
import type { SendResult } from "@/integrations/types";
import { phoneDigits } from "@/lib/domain/types";
import { logActivity } from "./activity";
import { markContacted } from "./jobs";

export interface OutboundInput {
  channel: "sms" | "email";
  to: string;
  subject?: string;
  text: string;
  customerId?: string | null;
  jobId?: string | null;
  actor?: string;
  /** Count as customer contact on the job (default true). */
  contact?: boolean;
  replyToMessageId?: string;
}

/**
 * Send through the active adapter and record it. Simulated adapters return a preview,
 * which the UI shows so the demo is honest about what would have gone out.
 */
export async function sendOutbound(input: OutboundInput): Promise<{ message: { id: string }; result: SendResult; simulated: boolean }> {
  const adapter = input.channel === "sms" ? smsAdapter() : emailAdapter();
  const result =
    input.channel === "sms"
      ? await (adapter as ReturnType<typeof smsAdapter>).send({ to: input.to, text: input.text })
      : await (adapter as ReturnType<typeof emailAdapter>).send({ to: input.to, subject: input.subject ?? "(no subject)", text: input.text, replyToMessageId: input.replyToMessageId });

  const message = await db.message.create({
    data: {
      channel: input.channel,
      direction: "outbound",
      fromAddr: input.channel === "sms" ? process.env.TWILIO_FROM_NUMBER ?? "office" : process.env.GMAIL_FROM ?? "office",
      toAddr: input.to,
      subject: input.subject ?? null,
      body: input.text,
      raw: result.preview ?? "",
      status: result.ok ? "sent" : "failed",
      customerId: input.customerId ?? null,
      jobId: input.jobId ?? null,
      externalId: result.id ? `out:${result.id}` : null,
      threadKey: input.channel === "sms" ? phoneDigits(input.to) || input.to : input.to.toLowerCase(),
    },
  });
  await logActivity({
    customerId: input.customerId ?? null,
    jobId: input.jobId ?? null,
    type: "message_out",
    text: `${input.channel === "sms" ? "Text" : "Email"} ${result.ok ? "sent" : "FAILED"} to ${input.to}${adapter.kind === "simulated" ? " (simulated)" : ""}: ${input.text.slice(0, 140)}`,
    actor: input.actor ?? "system",
  });
  if (result.ok && input.jobId && input.contact !== false) {
    await markContacted(input.jobId, { actor: input.actor, via: input.channel, note: `${input.channel === "sms" ? "Texted" : "Emailed"} customer` });
  }
  return { message, result, simulated: adapter.kind === "simulated" };
}

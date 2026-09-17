import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyTwilioSignature } from "@/integrations/sms/twilio";
import { recordInboundCall } from "@/lib/services/calls";

/**
 * Twilio Voice webhooks.
 *  - Outbound (placed from the app, ?callId=...): connect the office phone to the customer and record.
 *  - Inbound (a customer calls the business number): ring the office; if nobody answers, take a
 *    voicemail. The status callback turns a no-answer into a missed call, which becomes a lead.
 */
function twiml(xml: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${xml}</Response>`, { headers: { "Content-Type": "text/xml" } });
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const form = await req.formData().catch(() => null);
  const params: Record<string, string> = {};
  if (form) for (const [k, v] of form.entries()) params[k] = String(v);
  const base = process.env.APP_URL ?? url.origin;
  if (!(await verifyTwilioSignature(`${base}${url.pathname}${url.search}`, params, req.headers.get("x-twilio-signature")))) {
    return new NextResponse("Invalid signature", { status: 403 });
  }

  const event = url.searchParams.get("event");
  if (event === "status") {
    // Call finished. No answer / busy → missed call → lead.
    const status = params.CallStatus ?? "";
    if (["no-answer", "busy", "failed"].includes(status) && params.From) {
      await recordInboundCall({ number: params.From, status: "missed", externalId: params.CallSid, actor: "twilio" });
    }
    return twiml("");
  }
  if (event === "voicemail") {
    const from = params.From ?? "";
    const transcript = params.TranscriptionText ?? null;
    if (from) await recordInboundCall({ number: from, status: "missed", externalId: params.CallSid ? `${params.CallSid}-vm` : undefined, transcript, recordingUrl: params.RecordingUrl ?? null, actor: "twilio" });
    return twiml("");
  }

  const callId = url.searchParams.get("callId");
  if (callId) {
    const call = await db.call.findUnique({ where: { id: callId } });
    const office = process.env.OFFICE_PHONE ?? "";
    return twiml(`<Dial record="record-from-answer" callerId="${process.env.TWILIO_FROM_NUMBER ?? ""}">${office || call?.number || ""}</Dial>`);
  }

  // Inbound call to the business number.
  const office = process.env.OFFICE_PHONE;
  if (office) {
    return twiml(`<Dial timeout="20" action="${base}/api/webhooks/twilio/voice?event=status" method="POST">${office}</Dial><Say>Sorry we missed you. Please leave a message after the tone.</Say><Record maxLength="120" transcribe="true" transcribeCallback="${base}/api/webhooks/twilio/voice?event=voicemail" />`);
  }
  return twiml(`<Say>Thanks for calling. Please leave a message after the tone and we will call you right back.</Say><Record maxLength="120" transcribe="true" transcribeCallback="${base}/api/webhooks/twilio/voice?event=voicemail" />`);
}

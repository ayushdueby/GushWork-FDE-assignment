import { NextResponse } from "next/server";
import { verifyTwilioSignature } from "@/integrations/sms/twilio";
import { ingestMessage } from "@/lib/pipeline/ingest";

/**
 * Twilio "A message comes in" webhook. Point your number at POST {APP_URL}/api/webhooks/twilio/sms.
 * Signature is verified when TWILIO_AUTH_TOKEN is set. Replies with empty TwiML (we answer from the app).
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return new NextResponse("Bad request", { status: 400 });
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = String(v);
  const url = `${process.env.APP_URL ?? new URL(req.url).origin}/api/webhooks/twilio/sms`;
  if (!(await verifyTwilioSignature(url, params, req.headers.get("x-twilio-signature")))) {
    return new NextResponse("Invalid signature", { status: 403 });
  }
  const from = params.From ?? "";
  const body = params.Body ?? "";
  if (!from || !body) return new NextResponse("<Response/>", { headers: { "Content-Type": "text/xml" } });
  await ingestMessage({ channel: "sms", from, to: params.To ?? "", body, raw: JSON.stringify(params), externalId: params.MessageSid ? `twilio-${params.MessageSid}` : null, actor: "twilio" });
  return new NextResponse("<Response/>", { headers: { "Content-Type": "text/xml" } });
}

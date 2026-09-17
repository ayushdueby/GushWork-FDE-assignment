import type { SmsAdapter, SmsMessage, SendResult } from "../types";

/** Twilio Programmable Messaging via REST. Active when TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER exist. */
export function twilioConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
}

function authHeader(): string {
  return "Basic " + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
}

export async function twilioPost(resource: "Messages" | "Calls", params: Record<string, string>): Promise<SendResult> {
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/${resource}.json`, {
      method: "POST",
      headers: { Authorization: authHeader(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    });
    const json = (await res.json()) as { sid?: string; message?: string };
    if (!res.ok) return { ok: false, error: json.message ?? `Twilio error ${res.status}` };
    return { ok: true, id: json.sid };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Twilio error" };
  }
}

export const twilioSms: SmsAdapter = {
  name: "Twilio SMS",
  kind: "real",
  send(msg: SmsMessage) {
    return twilioPost("Messages", { To: msg.to, From: process.env.TWILIO_FROM_NUMBER!, Body: msg.text });
  },
};

/**
 * Validate X-Twilio-Signature on inbound webhooks (HMAC-SHA1 of URL + sorted params).
 * Returns true when no auth token is configured so local simulation keeps working.
 */
export async function verifyTwilioSignature(url: string, params: Record<string, string>, signature: string | null): Promise<boolean> {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return true;
  if (!signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(token), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const expected = Buffer.from(sig).toString("base64");
  return expected === signature;
}

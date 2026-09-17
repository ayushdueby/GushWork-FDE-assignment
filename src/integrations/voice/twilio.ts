import type { VoiceAdapter } from "../types";
import { twilioConfigured, twilioPost } from "../sms/twilio";

/** Twilio Programmable Voice: places a call that connects the office phone to the customer. */
export const twilioVoice: VoiceAdapter = {
  name: "Twilio Voice",
  kind: "real",
  placeCall(input) {
    const base = process.env.APP_URL ?? "http://localhost:3000";
    return twilioPost("Calls", {
      To: input.to,
      From: process.env.TWILIO_FROM_NUMBER!,
      Url: `${base}/api/webhooks/twilio/voice?callId=${encodeURIComponent(input.callId)}`,
      Record: "true",
    });
  },
};

export function twilioVoiceConfigured(): boolean {
  return twilioConfigured();
}

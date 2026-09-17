import type { SmsAdapter } from "../types";
import { simulatedSms } from "./simulated";
import { twilioConfigured, twilioSms } from "./twilio";

export function smsAdapter(): SmsAdapter {
  return twilioConfigured() ? twilioSms : simulatedSms;
}

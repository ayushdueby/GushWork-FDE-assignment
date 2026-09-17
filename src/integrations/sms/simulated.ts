import type { SmsAdapter, SmsMessage, SendResult } from "../types";

export const simulatedSms: SmsAdapter = {
  name: "Simulated SMS",
  kind: "simulated",
  async send(msg: SmsMessage): Promise<SendResult> {
    return { ok: true, id: `sim-sms-${Date.now()}`, preview: `To: ${msg.to}\n\n${msg.text}` };
  },
};

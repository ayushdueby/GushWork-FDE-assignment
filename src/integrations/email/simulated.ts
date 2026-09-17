import type { EmailAdapter, EmailMessage, SendResult } from "../types";

/** Doesn't send anything. Returns the exact text that would have gone out. */
export const simulatedEmail: EmailAdapter = {
  name: "Simulated email",
  kind: "simulated",
  async send(msg: EmailMessage): Promise<SendResult> {
    const preview = `To: ${msg.to}\nSubject: ${msg.subject}\n\n${msg.text}`;
    return { ok: true, id: `sim-email-${Date.now()}`, preview };
  },
};

import type { EmailAdapter } from "../types";
import { gmailConfigured, gmailEmail } from "./gmail";
import { simulatedEmail } from "./simulated";

export function emailAdapter(): EmailAdapter {
  return gmailConfigured() ? gmailEmail : simulatedEmail;
}

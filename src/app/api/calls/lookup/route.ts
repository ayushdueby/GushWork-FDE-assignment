import { api, json } from "@/lib/api";
import { lookupByDigits } from "@/lib/services/calls";

export const GET = api("view:dialer", async (req) => {
  const digits = new URL(req.url).searchParams.get("digits") ?? "";
  const rows = await lookupByDigits(digits);
  return json({ matches: rows.map((c) => ({ id: c.id, businessName: c.businessName, primaryContact: c.primaryContact, phone: c.phone, job: c.jobs[0] ?? null })) });
});

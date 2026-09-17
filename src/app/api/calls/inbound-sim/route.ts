import { z } from "zod";
import { api, json } from "@/lib/api";
import { recordInboundCall, startCall } from "@/lib/services/calls";
import { db } from "@/lib/db";

const Body = z.object({ number: z.string().min(3).max(40), answered: z.boolean(), transcript: z.string().max(5000).nullable().optional() });

/** "Simulate incoming call": answered → a live inbound call (record it); missed → a lead on Today. */
export const POST = api("view:dialer", async (req, { user }) => {
  const body = Body.parse(await req.json());
  if (!body.answered) {
    const r = await recordInboundCall({ number: body.number, status: "missed", transcript: body.transcript ?? null, actor: `${user.name} (simulated)` });
    return json({ missed: true, callId: r.call.id, jobId: r.jobId, created: r.created });
  }
  const call = await startCall({ number: body.number, direction: "inbound", actor: user.name });
  const customer = call.customerId ? await db.customer.findUnique({ where: { id: call.customerId }, select: { id: true, businessName: true } }) : null;
  return json({ missed: false, callId: call.id, jobId: call.jobId, customer });
});

/** Who's calling? Match a number before the ring is answered. */
export const GET = api("view:dialer", async (req) => {
  const number = new URL(req.url).searchParams.get("number") ?? "";
  const { findMatchingCustomer } = await import("@/lib/services/customers");
  const m = await findMatchingCustomer({ phone: number });
  const job = m ? await db.job.findFirst({ where: { customerId: m.customer.id, stage: { notIn: ["done", "lost"] } }, orderBy: [{ urgent: "desc" }, { createdAt: "desc" }], select: { id: true, stage: true, issue: true, urgent: true } }) : null;
  return json({ customer: m ? { id: m.customer.id, businessName: m.customer.businessName } : null, job });
});

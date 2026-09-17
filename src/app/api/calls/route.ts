import { z } from "zod";
import { api, json } from "@/lib/api";
import { startCall } from "@/lib/services/calls";

const Body = z.object({ number: z.string().min(3).max(40), jobId: z.string().nullable().optional(), customerId: z.string().nullable().optional() });

export const POST = api("view:dialer", async (req, { user }) => {
  const body = Body.parse(await req.json());
  const call = await startCall({ number: body.number, direction: "outbound", jobId: body.jobId ?? null, customerId: body.customerId ?? null, actor: user.name });
  return json({ call });
});

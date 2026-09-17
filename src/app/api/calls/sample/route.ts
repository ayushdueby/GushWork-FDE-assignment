import { z } from "zod";
import { api, json } from "@/lib/api";
import { playSampleCall, SAMPLE_CALLS } from "@/lib/services/calls";

const Body = z.object({ key: z.string(), jobId: z.string().nullable().optional(), number: z.string().nullable().optional() });

export const GET = api("view:dialer", async () => json({ samples: SAMPLE_CALLS.map((s) => ({ key: s.key, label: s.label })) }));

export const POST = api("view:dialer", async (req, { user }) => {
  const body = Body.parse(await req.json());
  return json(await playSampleCall(body.key, { jobId: body.jobId ?? null, number: body.number ?? null, actor: user.name }));
});

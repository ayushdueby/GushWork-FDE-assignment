import { z } from "zod";
import { api, json } from "@/lib/api";
import { endCall } from "@/lib/services/calls";

const Body = z.object({ durationSec: z.number().min(0).max(4 * 3600), answered: z.boolean().optional() });

export const POST = api("view:dialer", async (req, { user, params }) => {
  const body = Body.parse(await req.json());
  const call = await endCall(params.id, { durationSec: body.durationSec, answered: body.answered, actor: user.name });
  return json({ call });
});

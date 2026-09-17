import { z } from "zod";
import { api, json } from "@/lib/api";
import { applyCall } from "@/lib/services/calls";

const Body = z.object({ fields: z.array(z.string()).max(20) });

export const POST = api("view:dialer", async (req, { user, params }) => {
  const body = Body.parse(await req.json());
  return json(await applyCall(params.id, { fields: body.fields, actor: user.name }));
});

import { z } from "zod";
import { api, json } from "@/lib/api";
import { attachTranscript } from "@/lib/services/calls";

const Body = z.object({ text: z.string().trim().min(3).max(20_000) });

export const POST = api("view:dialer", async (req, { user, params }) => {
  const body = Body.parse(await req.json());
  return json(await attachTranscript(params.id, body.text, { actor: user.name, engine: "typed" }));
});

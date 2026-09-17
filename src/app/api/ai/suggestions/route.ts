import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/current";
import { suggestNextSteps } from "@/lib/ai/suggest";

const Body = z.object({
  items: z
    .array(
      z.object({
        jobId: z.string(),
        rule: z.enum(["equipment-down", "missed-call", "new-request", "send-quote", "follow-up-quote", "book-tech", "confirm-done", "no-contact"]),
        reason: z.string(),
        stage: z.string(),
        urgent: z.boolean(),
        waitingDays: z.number(),
        business: z.string(),
        contact: z.string(),
        equipment: z.string(),
        issue: z.string(),
        quoteTotal: z.number().nullable(),
        lastActivity: z.string().nullable().optional(),
      }),
    )
    .max(100),
});

export async function POST(req: Request) {
  try {
    await requirePermission("view:today");
  } catch {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const result = await suggestNextSteps(parsed.data.items);
  return NextResponse.json(result);
}

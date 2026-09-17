import { api, json } from "@/lib/api";
import { db } from "@/lib/db";
import { proposeChanges } from "@/lib/pipeline/call-diff";
import type { CallExtraction } from "@/lib/ai/extract-call";
import type { Stage } from "@/lib/domain/types";

export const GET = api("view:dialer", async (_req, { params }) => {
  const call = await db.call.findUnique({ where: { id: params.id }, include: { customer: { select: { id: true, businessName: true } }, job: { include: { quotes: { orderBy: { createdAt: "desc" }, take: 1 } } } } });
  if (!call) return json({ error: "Not found" }, { status: 404 });
  const ex = call.extractedJson ? (JSON.parse(call.extractedJson) as CallExtraction & { engine?: string }) : null;
  const changes = ex && call.job && !call.applied ? proposeChanges(ex, { stage: call.job.stage as Stage, urgent: call.job.urgent, issue: call.job.issue, equipmentType: call.job.equipmentType, scheduledFor: call.job.scheduledFor, quoteTotal: call.job.quotes[0]?.total ?? null, quoteStatus: call.job.quotes[0]?.status ?? null }) : [];
  return json({ call: { ...call, job: call.job ? { id: call.job.id, stage: call.job.stage, issue: call.job.issue } : null }, extraction: ex, changes });
});

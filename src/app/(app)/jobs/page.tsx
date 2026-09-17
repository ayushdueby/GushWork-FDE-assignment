import Link from "next/link";
import { Plus } from "lucide-react";
import { Suspense } from "react";
import { Kanban, type KanbanJob } from "@/components/jobs/kanban";
import { JobFilters } from "@/components/jobs/filters";
import { StageBadge, UrgentBadge } from "@/components/shared/stage-badge";
import { Button } from "@/components/ui/button";
import { requirePage } from "@/lib/auth/current";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { SOURCE_LABEL, formatPhone, type Source, type Stage } from "@/lib/domain/types";
import { daysAgoLabel, daysBetween, formatShortDate } from "@/lib/rules/dates";
import { listJobs } from "@/lib/services/jobs";

export const metadata = { title: "Jobs" };

export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePage("view:jobs");
  const sp = await searchParams;
  const view = sp.view === "list" ? "list" : "board";
  const includeClosed = view === "board" ? true : sp.stage === "done" || sp.stage === "lost" || sp.closed === "1";
  const [jobs, techs] = await Promise.all([
    listJobs({ stage: sp.stage, source: sp.source, techId: sp.tech, urgent: sp.urgent === "1", q: sp.q, includeClosed }),
    db.tech.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  const quoteTotals = await db.quote.findMany({ where: { jobId: { in: jobs.map((j) => j.id) }, status: { in: ["sent", "accepted"] } }, select: { jobId: true, total: true } });
  const qt = new Map(quoteTotals.map((q) => [q.jobId, q.total]));
  const canWrite = can(user.role, "write:crm");
  const now = new Date();

  const rows: KanbanJob[] = jobs.map((j) => ({
    id: j.id,
    stage: j.stage as Stage,
    urgent: j.urgent,
    business: j.customer.businessName,
    contact: j.customer.primaryContact,
    phone: j.customer.phone,
    equipment: j.equipmentType,
    issue: j.issue,
    lastContactAt: j.lastContactAt?.toISOString() ?? null,
    createdAt: j.createdAt.toISOString(),
    quoteTotal: qt.get(j.id) ?? null,
    techName: j.tech?.name ?? null,
    scheduledFor: j.scheduledFor?.toISOString() ?? null,
  }));
  const showLost = sp.stage === "lost" || sp.lost === "1";

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Jobs</h1>
          <p className="text-sm text-muted-foreground">Where every job is at. Drag a card to move it, or use the menu on each card.</p>
        </div>
        {canWrite && (
          <Button render={<Link href="/jobs/new" />}>
            <Plus /> New job
          </Button>
        )}
      </header>
      <Suspense>
        <JobFilters techs={techs} view={view} />
      </Suspense>
      {view === "board" ? (
        <>
          <Kanban jobs={rows.filter((r) => showLost || r.stage !== "lost")} techs={techs} canWrite={canWrite} showLost={showLost} />
          {!showLost && (
            <p className="text-xs text-muted-foreground">
              Lost jobs are hidden.{" "}
              <Link href="/jobs?lost=1" className="underline">
                Show them
              </Link>
              .
            </p>
          )}
        </>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2">Equipment / issue</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Tech</th>
                <th className="px-3 py-2">Last contact</th>
                <th className="px-3 py-2">Quote</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                    No jobs match those filters.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <Link href={`/jobs/${r.id}`} className="font-medium hover:underline">
                      {r.business}
                    </Link>
                    {r.urgent && <UrgentBadge className="ml-2" />}
                    <div className="text-xs text-muted-foreground">
                      {r.contact} · {formatPhone(r.phone)}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <StageBadge stage={r.stage} />
                  </td>
                  <td className="max-w-xs truncate px-3 py-2">
                    <span className="font-medium">{r.equipment}</span> <span className="text-muted-foreground">{r.issue}</span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{SOURCE_LABEL[jobs.find((j) => j.id === r.id)!.source as Source] ?? ""}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.techName ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.lastContactAt ? `${daysAgoLabel(daysBetween(r.lastContactAt, now))} ago` : "never"}</td>
                  <td className="px-3 py-2 tabular-nums">{r.quoteTotal != null ? `$${Math.round(r.quoteTotal).toLocaleString()}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.some((r) => r.scheduledFor) && <p className="sr-only">Scheduled dates: {rows.filter((r) => r.scheduledFor).map((r) => `${r.business} ${formatShortDate(r.scheduledFor)}`).join(", ")}</p>}
        </div>
      )}
    </div>
  );
}

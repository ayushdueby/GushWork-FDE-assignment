import { Plus } from "lucide-react";
import Link from "next/link";
import { CallList, type TodayRow } from "@/components/today/call-list";
import { DigestButton } from "@/components/today/digest-button";
import { ResetDemoButton } from "@/components/admin/reset-demo-button";
import { DeniedNotice } from "@/components/shell/denied-notice";
import { Button } from "@/components/ui/button";
import { requirePage } from "@/lib/auth/current";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import type { Stage } from "@/lib/domain/types";
import { formatLongDate } from "@/lib/rules/dates";
import { getSettings } from "@/lib/services/settings";
import { buildCallList, kpis } from "@/lib/services/today";
import { seedIfEmpty } from "@/lib/seed/seed";

export const metadata = { title: "Today" };

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requirePage("view:today");
  const sp = await searchParams;
  await seedIfEmpty(db);
  const now = new Date();
  const [items, k, techs, settings] = await Promise.all([buildCallList(now), kpis(now), db.tech.findMany({ where: { active: true }, orderBy: { name: "asc" } }), getSettings()]);

  // Last activity line per job for the AI prompt (one query, not N).
  const lastActs = await db.activity.findMany({ where: { jobId: { in: items.map((i) => i.job.id) } }, orderBy: { at: "desc" }, distinct: ["jobId"], select: { jobId: true, text: true } });
  const lastByJob = new Map(lastActs.map((a) => [a.jobId!, a.text]));

  const rows: TodayRow[] = items.map((it) => ({
    jobId: it.job.id,
    customerId: it.job.customerId,
    rule: it.rule,
    reason: it.reason,
    critical: it.critical,
    waitingDays: it.waitingDays,
    urgent: it.job.urgent,
    stage: it.job.stage as Stage,
    business: it.job.customer.businessName,
    contact: it.job.customer.primaryContact,
    phone: it.job.customer.phone,
    email: it.job.customer.email,
    equipment: it.job.equipmentType,
    issue: it.job.issue,
    quoteTotal: it.job.quoteTotal,
    quoteId: it.job.quoteId,
    lastActivity: lastByJob.get(it.job.id) ?? null,
  }));

  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <DeniedNotice show={sp.denied} />
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{formatLongDate(now)}</p>
          <h1 className="text-2xl font-bold tracking-tight">
            {greeting}, {user.name.split(" ")[0]}.
          </h1>
          <p className="mt-1 text-muted-foreground">{items.length === 0 ? "Nobody waiting on you." : `${items.length} ${items.length === 1 ? "person is" : "people are"} waiting to hear from you.`}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(user.role, "write:crm") && <DigestButton />}
          {can(user.role, "write:crm") && (
            <Button render={<Link href="/jobs/new" />}>
              <Plus /> New job
            </Button>
          )}
        </div>
      </header>

      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi label="Open jobs" value={String(k.openJobs)} href="/jobs" />
        <Kpi label="Waiting on a yes" value={`$${Math.round(k.waitingOnYesTotal).toLocaleString()}`} href="/jobs?stage=waiting_on_yes" />
        <Kpi label="Calls to make" value={String(k.callsToday)} emphasis={k.callsToday > 0} />
        <Kpi label="Done this week" value={String(k.doneThisWeek)} href="/jobs?stage=done" />
        <Kpi label="No response > 24h" value={String(k.noResponse24h)} emphasis={k.noResponse24h > 0} tone="warn" />
      </section>

      <section aria-labelledby="call-today-heading" className="space-y-3">
        <h2 id="call-today-heading" className="text-lg font-semibold tracking-tight">
          Call today
        </h2>
        <CallList rows={rows} techs={techs.map((t) => ({ id: t.id, name: t.name }))} ownerName={settings.ownerName} canWrite={can(user.role, "write:crm")} />
      </section>

      {can(user.role, "admin") && (
        <footer className="flex justify-end border-t border-border pt-4">
          <ResetDemoButton />
        </footer>
      )}
    </div>
  );
}

function Kpi({ label, value, href, emphasis, tone }: { label: string; value: string; href?: string; emphasis?: boolean; tone?: "warn" }) {
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${emphasis ? (tone === "warn" ? "text-amber-700" : "text-primary") : ""}`}>{value}</p>
    </>
  );
  const cls = "block rounded-2xl border border-border bg-card px-4 py-3 shadow-sm";
  return href ? (
    <Link href={href} className={`${cls} hover:border-primary/40`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StageBadge, UrgentBadge } from "@/components/shared/stage-badge";
import { DeniedNotice } from "@/components/shell/denied-notice";
import { requirePage } from "@/lib/auth/current";
import { money } from "@/lib/domain/types";
import { formatTimestamp, toDateKey } from "@/lib/rules/dates";
import { buildReports, parseRange } from "@/lib/services/reports";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; denied?: string }> }) {
  await requirePage("view:reports");
  const sp = await searchParams;
  const range = parseRange(sp.from, sp.to);
  const r = await buildReports(range);
  const fromKey = toDateKey(range.from);
  const toKey = toDateKey(new Date(range.to.getTime() - 1));
  const now = new Date();
  const preset = (days: number) => `/reports?from=${toDateKey(new Date(now.getTime() - days * 86_400_000))}&to=${toDateKey(now)}`;
  const maxWeek = Math.max(1, ...r.revenueByWeek.map((w) => w.revenue));
  const maxSource = Math.max(1, ...r.leadsBySource.map((s) => s.count));
  const maxStage = Math.max(1, ...r.pipelineByStage.map((s) => s.count));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <DeniedNotice show={sp.denied} />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">
            {range.from.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {new Date(range.to.getTime() - 1).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <Button variant="outline" render={<a href={`/api/reports/export?from=${fromKey}&to=${toKey}`} />}>
          <Download /> Export jobs (CSV)
        </Button>
      </header>

      <form className="flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-3" aria-label="Date range">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">From</span>
          <input type="date" name="from" defaultValue={fromKey} className="h-11 rounded-lg border border-input bg-background px-3" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">To</span>
          <input type="date" name="to" defaultValue={toKey} className="h-11 rounded-lg border border-input bg-background px-3" />
        </label>
        <Button type="submit" variant="outline">
          Apply
        </Button>
        <span className="ml-auto flex flex-wrap gap-1 text-sm">
          {[
            [30, "30 days"],
            [90, "90 days"],
            [365, "12 months"],
          ].map(([d, label]) => (
            <Link key={d} href={preset(Number(d))} className="rounded-full bg-muted px-3 py-1.5 text-muted-foreground hover:text-foreground">
              {label}
            </Link>
          ))}
        </span>
      </form>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Totals">
        <Stat label="New leads" value={String(r.totals.newLeads)} />
        <Stat label="Jobs completed" value={String(r.totals.completed)} />
        <Stat label="Revenue (completed)" value={money(r.totals.revenue)} />
        <Stat label="Quote win rate" value={r.quotes.winRate == null ? "—" : `${Math.round(r.quotes.winRate * 100)}%`} hint={`${r.quotes.accepted} won · ${r.quotes.declined} lost · ${r.quotes.open} open`} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Pipeline value by stage" hint="Open jobs right now, valued at their latest quote.">
          <ul className="space-y-2">
            {r.pipelineByStage.map((s) => (
              <li key={s.stage} className="text-sm">
                <div className="flex justify-between">
                  <span>
                    {s.label} <span className="text-muted-foreground">· {s.count}</span>
                  </span>
                  <span className="tabular-nums">{money(s.value)}</span>
                </div>
                <Bar pct={(s.count / maxStage) * 100} />
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Leads by source" hint="Where new jobs came from in this range.">
          {r.leadsBySource.length === 0 && <p className="text-sm text-muted-foreground">No new leads in this range.</p>}
          <ul className="space-y-2">
            {r.leadsBySource.map((s) => (
              <li key={s.source} className="text-sm">
                <div className="flex justify-between">
                  <span>{s.label}</span>
                  <span className="tabular-nums">{s.count}</span>
                </div>
                <Bar pct={(s.count / maxSource) * 100} />
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Revenue from completed jobs" hint="By week, from accepted quotes on jobs marked done.">
          {r.revenueByWeek.length === 0 && <p className="text-sm text-muted-foreground">Nothing completed in this range.</p>}
          <ul className="space-y-2">
            {r.revenueByWeek.map((w) => (
              <li key={w.week} className="text-sm">
                <div className="flex justify-between">
                  <span>
                    {w.label} <span className="text-muted-foreground">· {w.jobs} job{w.jobs === 1 ? "" : "s"}</span>
                  </span>
                  <span className="tabular-nums">{money(w.revenue)}</span>
                </div>
                <Bar pct={(w.revenue / maxWeek) * 100} tone="emerald" />
              </li>
            ))}
          </ul>
          {r.revenueByMonth.length > 0 && (
            <p className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
              By month: {r.revenueByMonth.map((m) => `${m.label} ${money(m.revenue)}`).join(" · ")}
            </p>
          )}
        </Card>

        <Card title="Response time" hint="From a lead coming in to the first call, text, email or quote.">
          <p className="text-3xl font-bold tabular-nums">{r.firstResponse.avgHours == null ? "—" : `${r.firstResponse.avgHours.toFixed(1)} h`}</p>
          <p className="text-sm text-muted-foreground">
            average · median {r.firstResponse.medianHours == null ? "—" : `${r.firstResponse.medianHours.toFixed(1)} h`} · {r.firstResponse.measured} leads measured
          </p>
          <p className="mt-2 text-sm text-muted-foreground">Quotes sent in range: {r.quotes.sent} worth {money(r.quotes.sentValue)} · accepted {money(r.quotes.acceptedValue)}.</p>
        </Card>

        <Card title="Jobs per tech" hint="Completed in range, plus what's on their calendar now.">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-1">Tech</th>
                <th className="py-1 text-right">Done</th>
                <th className="py-1 text-right">Scheduled</th>
                <th className="py-1 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {r.jobsPerTech.map((t) => (
                <tr key={t.techId} className="border-t border-border">
                  <td className="py-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2.5 rounded-full" style={{ background: t.color }} /> {t.name}
                    </span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{t.done}</td>
                  <td className="py-1.5 text-right tabular-nums">{t.scheduled}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(t.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Leads that never got a response" hint="Still open, nobody has reached out. The $2,000 jobs waiting to walk out the door.">
          {r.neverResponded.length === 0 && <p className="text-sm text-emerald-700">Everyone has heard from you. Nice.</p>}
          <ul className="divide-y divide-border">
            {r.neverResponded.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <Link href={`/jobs/${j.id}`} className="font-medium hover:underline">
                  {j.business}
                </Link>
                {j.urgent && <UrgentBadge />}
                <StageBadge stage={j.stage} />
                <span className="text-muted-foreground">{formatTimestamp(j.createdAt)}</span>
                <span className="w-full truncate text-muted-foreground">{j.issue}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mb-3 text-xs text-muted-foreground">{hint}</p>}
      {children}
    </section>
  );
}

function Bar({ pct, tone = "primary" }: { pct: number; tone?: "primary" | "emerald" }) {
  return (
    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <div className={tone === "emerald" ? "h-full bg-emerald-500" : "h-full bg-primary"} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
    </div>
  );
}

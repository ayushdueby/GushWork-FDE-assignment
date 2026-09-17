import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Plus } from "lucide-react";
import { AddEquipmentForm, AddSiteForm, EditCustomerDialog } from "@/components/customers/customer-forms";
import { CallSummaryCard } from "@/components/dialer/call-summary-card";
import { StageBadge, UrgentBadge } from "@/components/shared/stage-badge";
import { Timeline } from "@/components/shared/timeline";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requirePage } from "@/lib/auth/current";
import { can } from "@/lib/auth/permissions";
import { formatPhone, money } from "@/lib/domain/types";
import { formatTimestamp } from "@/lib/rules/dates";
import { getCustomerDetail } from "@/lib/services/customers";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("view:customers");
  const { id } = await params;
  const c = await getCustomerDetail(id);
  if (!c) notFound();
  const canWrite = can(user.role, "write:crm");
  const open = c.jobs.filter((j) => j.stage !== "done" && j.stage !== "lost");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <nav className="text-sm text-muted-foreground">
        <Link href="/customers" className="hover:underline">
          Customers
        </Link>{" "}
        / {c.businessName}
      </nav>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{c.businessName}</h1>
          <p className="text-muted-foreground">
            <span className="capitalize">{c.type}</span>
            {c.primaryContact && ` · ${c.primaryContact}`}
            {c.phone && (
              <>
                {" · "}
                <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="text-primary hover:underline">
                  {formatPhone(c.phone)}
                </a>
              </>
            )}
            {c.email && ` · ${c.email}`}
          </p>
          {c.notes && <p className="mt-1 text-sm text-muted-foreground">{c.notes}</p>}
        </div>
        <div className="flex gap-2">
          {canWrite && <EditCustomerDialog c={c} />}
          {canWrite && (
            <Button size="sm" render={<Link href={`/jobs/new?customerId=${c.id}`} />}>
              <Plus /> New job
            </Button>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Tabs defaultValue="jobs" className="min-w-0">
          <TabsList className="flex-wrap">
            <TabsTrigger value="jobs">Jobs ({c.jobs.length})</TabsTrigger>
            <TabsTrigger value="sites">Sites & equipment ({c.sites.length})</TabsTrigger>
            <TabsTrigger value="calls">Calls ({c.calls.length})</TabsTrigger>
            <TabsTrigger value="messages">Messages ({c.messages.length})</TabsTrigger>
            <TabsTrigger value="quotes">Quotes ({c.quotes.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="jobs" className="space-y-2 pt-3">
            {c.jobs.length === 0 && <p className="text-sm text-muted-foreground">No jobs yet.</p>}
            {c.jobs.map((j) => (
              <Link key={j.id} href={`/jobs/${j.id}`} className={`block rounded-xl border bg-card p-3 hover:bg-muted/40 ${j.urgent && j.stage !== "done" && j.stage !== "lost" ? "border-red-300 urgent-ring" : "border-border"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <StageBadge stage={j.stage} />
                  {j.urgent && <UrgentBadge />}
                  <span className="text-xs text-muted-foreground">{formatTimestamp(j.createdAt)}</span>
                  {j.tech && <span className="text-xs text-muted-foreground">· {j.tech.name}</span>}
                  {j.quotes[0] && <span className="ml-auto text-sm tabular-nums">{money(j.quotes[0].total)}</span>}
                </div>
                <p className="mt-1 text-sm">
                  <span className="font-medium">{j.equipmentType}</span> {j.issue && <span className="text-muted-foreground">— {j.issue}</span>}
                </p>
              </Link>
            ))}
          </TabsContent>
          <TabsContent value="sites" className="space-y-4 pt-3">
            {c.sites.map((s) => (
              <div key={s.id} className="rounded-xl border border-border bg-card p-3">
                <p className="flex items-center gap-1.5 font-semibold">
                  <MapPin className="size-4 text-muted-foreground" /> {s.name}
                </p>
                <a href={`https://maps.google.com/?q=${encodeURIComponent(s.address)}`} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
                  {s.address}
                </a>
                <ul className="mt-2 space-y-1 text-sm">
                  {s.equipment.length === 0 && <li className="text-muted-foreground">No equipment recorded.</li>}
                  {s.equipment.map((e) => (
                    <li key={e.id}>
                      <span className="font-medium">{e.type}</span>
                      {e.makeModel && <span className="text-muted-foreground"> · {e.makeModel}</span>}
                      {e.notes && <span className="text-muted-foreground"> · {e.notes}</span>}
                    </li>
                  ))}
                </ul>
                {canWrite && (
                  <div className="mt-3">
                    <AddEquipmentForm siteId={s.id} />
                  </div>
                )}
              </div>
            ))}
            {canWrite && <AddSiteForm customerId={c.id} />}
          </TabsContent>
          <TabsContent value="calls" className="space-y-2 pt-3">
            {c.calls.length === 0 && <p className="text-sm text-muted-foreground">No calls yet.</p>}
            {c.calls.map((k) => (
              <CallSummaryCard key={k.id} call={{ id: k.id, direction: k.direction, number: k.number, startedAt: k.startedAt.toISOString(), durationSec: k.durationSec, status: k.status, transcript: k.transcript, summary: k.summary, extractedJson: k.extractedJson, applied: k.applied, jobId: k.jobId, recordingPath: k.recordingPath }} compact canWrite={canWrite} />
            ))}
          </TabsContent>
          <TabsContent value="messages" className="space-y-2 pt-3">
            {c.messages.length === 0 && <p className="text-sm text-muted-foreground">No messages yet.</p>}
            {c.messages.map((m) => (
              <div key={m.id} className="rounded-lg bg-muted/50 p-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  {m.direction === "inbound" ? "From" : "To"} {m.direction === "inbound" ? m.fromAddr : m.toAddr} · {m.channel.replace("_", " ")} · {formatTimestamp(m.receivedAt)}
                </p>
                {m.subject && <p className="font-medium">{m.subject}</p>}
                <p className="whitespace-pre-wrap">{m.body}</p>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="quotes" className="space-y-2 pt-3">
            {c.quotes.length === 0 && <p className="text-sm text-muted-foreground">No quotes yet.</p>}
            {c.quotes.map((q) => (
              <Link key={q.id} href={`/quotes/${q.id}`} className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-sm hover:bg-muted/40">
                <span>
                  <span className="capitalize">{q.status}</span> · {q.job.issue.slice(0, 60)}
                </span>
                <span className="font-semibold tabular-nums">{money(q.total)}</span>
              </Link>
            ))}
          </TabsContent>
        </Tabs>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-1 font-semibold">At a glance</h2>
            <p className="text-sm text-muted-foreground">
              {open.length} open · {c.jobs.filter((j) => j.stage === "done").length} done · {c.jobs.filter((j) => j.stage === "lost").length} lost
            </p>
          </section>
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-3 font-semibold">Timeline</h2>
            <Timeline items={c.activities} />
          </section>
        </aside>
      </div>
    </div>
  );
}

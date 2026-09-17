import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, MapPin, Phone, PhoneMissed } from "lucide-react";
import { JobActions } from "@/components/jobs/job-actions";
import { JobDetailsForm } from "@/components/jobs/job-details-form";
import { NoteForm } from "@/components/jobs/note-form";
import { ScheduleDialog } from "@/components/jobs/schedule-dialog";
import { StageBadge, UrgentBadge } from "@/components/shared/stage-badge";
import { Timeline } from "@/components/shared/timeline";
import { Button } from "@/components/ui/button";
import { requirePage } from "@/lib/auth/current";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { SOURCE_LABEL, formatPhone, money, type Source, type Stage } from "@/lib/domain/types";
import { formatTimestamp } from "@/lib/rules/dates";
import { getJobDetail } from "@/lib/services/jobs";
import { getSettings } from "@/lib/services/settings";
import { CallSummaryCard } from "@/components/dialer/call-summary-card";
import { QuotePanel } from "@/components/quotes/quote-panel";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("view:jobs");
  const { id } = await params;
  const [job, techs, settings] = await Promise.all([getJobDetail(id), db.tech.findMany({ where: { active: true }, orderBy: { name: "asc" } }), getSettings()]);
  if (!job) notFound();
  const canWrite = can(user.role, "write:crm");
  const c = job.customer;
  const site = job.site ?? c.sites[0] ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <nav className="text-sm text-muted-foreground">
        <Link href="/jobs" className="hover:underline">
          Jobs
        </Link>{" "}
        / {c.businessName}
      </nav>
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <StageBadge stage={job.stage} />
          {job.urgent && <UrgentBadge />}
          <span className="text-xs text-muted-foreground">
            {SOURCE_LABEL[job.source as Source]} · opened {formatTimestamp(job.createdAt)}
          </span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          <Link href={`/customers/${c.id}`} className="hover:underline">
            {c.businessName}
          </Link>
          {c.primaryContact && <span className="font-normal text-muted-foreground"> · {c.primaryContact}</span>}
        </h1>
        <p className="text-foreground/80">
          <span className="font-medium">{job.equipmentType}</span>
          {job.issue && ` — ${job.issue}`}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {c.phone && (
            <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 text-primary hover:underline">
              <Phone className="size-3.5" /> {formatPhone(c.phone)}
            </a>
          )}
          {c.email && <span>{c.email}</span>}
          {site && (
            <a href={`https://maps.google.com/?q=${encodeURIComponent(site.address)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
              <MapPin className="size-3.5" /> {site.name}: {site.address}
            </a>
          )}
        </div>
        {job.stage === "lost" && job.lostReason && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">Lost: {job.lostReason}</p>}
        {canWrite && (
          <JobActions jobId={job.id} customerId={c.id} stage={job.stage as Stage} business={c.businessName} contact={c.primaryContact} phone={c.phone} email={c.email} equipment={job.equipmentType} techs={techs} ownerName={settings.ownerName} />
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-3 font-semibold">Details</h2>
            {canWrite ? (
              <JobDetailsForm job={{ id: job.id, issue: job.issue, equipmentType: job.equipmentType, source: job.source, urgent: job.urgent, siteId: job.siteId, techId: job.techId }} sites={c.sites} techs={techs} />
            ) : (
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Equipment</dt>
                  <dd>{job.equipmentType}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Tech</dt>
                  <dd>{job.tech?.name ?? "Unassigned"}</dd>
                </div>
              </dl>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-4" id="quotes">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-semibold">
                <FileText className="size-4" /> Quotes
              </h2>
            </div>
            <QuotePanel jobId={job.id} quotes={job.quotes.map((q) => ({ id: q.id, status: q.status, total: q.total, sentAt: q.sentAt?.toISOString() ?? null, respondedAt: q.respondedAt?.toISOString() ?? null, customerComment: q.customerComment, itemCount: q.items.length, publicToken: q.publicToken }))} canWrite={canWrite || can(user.role, "view:quotes")} canEdit={can(user.role, "write:quotes")} />
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-3 font-semibold">Calls</h2>
            {job.calls.length === 0 && <p className="text-sm text-muted-foreground">No calls yet.</p>}
            <ul className="space-y-3">
              {job.calls.map((k) => (
                <li key={k.id}>
                  <CallSummaryCard call={{ id: k.id, direction: k.direction, number: k.number, startedAt: k.startedAt.toISOString(), durationSec: k.durationSec, status: k.status, transcript: k.transcript, summary: k.summary, extractedJson: k.extractedJson, applied: k.applied, jobId: k.jobId, recordingPath: k.recordingPath }} compact canWrite={canWrite} />
                </li>
              ))}
            </ul>
            {job.calls.some((k) => k.status === "missed") && (
              <p className="mt-2 flex items-center gap-1 text-xs text-red-700">
                <PhoneMissed className="size-3.5" /> This customer has a missed call on record.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-3 font-semibold">Messages</h2>
            {job.messages.length === 0 && <p className="text-sm text-muted-foreground">No messages on this job.</p>}
            <ul className="space-y-2">
              {job.messages.map((m) => (
                <li key={m.id} className="rounded-lg bg-muted/50 p-3 text-sm">
                  <p className="text-xs text-muted-foreground">
                    {m.direction === "inbound" ? "From" : "To"} {m.direction === "inbound" ? m.fromAddr : m.toAddr} · {m.channel.replace("_", " ")} · {formatTimestamp(m.receivedAt)}
                  </p>
                  {m.subject && <p className="font-medium">{m.subject}</p>}
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-2 font-semibold">Schedule</h2>
            {job.scheduledFor ? (
              <p className="text-sm">
                {formatTimestamp(job.scheduledFor)}
                <br />
                <span className="text-muted-foreground">{job.tech ? `with ${job.tech.name}` : "no tech assigned"}</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Not scheduled yet.</p>
            )}
            {canWrite && job.stage !== "done" && job.stage !== "lost" && (
              <div className="mt-3">
                <ScheduleDialog jobId={job.id} scheduledFor={job.scheduledFor?.toISOString() ?? null} techId={job.techId} techs={techs} />
              </div>
            )}
            {job.completedAt && (
              <p className="mt-3 text-sm">
                Completed {formatTimestamp(job.completedAt)}
                {job.completionNotes && <span className="block text-muted-foreground">{job.completionNotes}</span>}
              </p>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL from the tech's phone, not an optimisable asset */}
            {job.completionPhoto && <img src={job.completionPhoto} alt="Completion photo" className="mt-2 max-h-48 rounded-lg border border-border object-cover" />}
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-2 font-semibold">Money</h2>
            <p className="text-sm text-muted-foreground">{job.quotes.length ? `Latest quote ${money(job.quotes[0].total)} · ${job.quotes[0].status}` : "No quote yet."}</p>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-3 font-semibold">Timeline</h2>
            {canWrite && (
              <div className="mb-4">
                <NoteForm jobId={job.id} />
              </div>
            )}
            <Timeline items={job.activities} />
          </section>
          {canWrite && (
            <Button variant="ghost" size="sm" render={<Link href={`/customers/${c.id}`} />} className="text-muted-foreground">
              Customer history →
            </Button>
          )}
        </aside>
      </div>
    </div>
  );
}

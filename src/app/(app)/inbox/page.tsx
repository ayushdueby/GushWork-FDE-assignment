import Link from "next/link";
import { Globe, Mail, MessageSquare } from "lucide-react";
import { ReplyForm } from "@/components/inbox/reply-form";
import { ReviewCard } from "@/components/inbox/review-card";
import { SimulateMenu } from "@/components/inbox/simulate-menu";
import { GmailSyncButton } from "@/components/inbox/gmail-sync-button";
import { requirePage } from "@/lib/auth/current";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import type { MessageExtraction } from "@/lib/ai/extract-message";
import { formatPhone } from "@/lib/domain/types";
import { formatTimestamp, timeAgo } from "@/lib/rules/dates";
import { cn } from "@/lib/utils";
import { gmailConfigured } from "@/integrations/email/gmail";

export const metadata = { title: "Inbox" };

const CHANNEL_ICON = { email: Mail, sms: MessageSquare, web_form: Globe } as const;

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ channel?: string; review?: string; t?: string; m?: string }> }) {
  const user = await requirePage("view:inbox");
  const sp = await searchParams;
  const canWrite = can(user.role, "write:crm");
  const messages = await db.message.findMany({ orderBy: { receivedAt: "desc" }, take: 500, include: { customer: { select: { id: true, businessName: true } }, job: { select: { id: true, stage: true } } } });

  // Thread = one phone number or email address, both directions.
  const threads = new Map<string, typeof messages>();
  for (const m of messages) {
    const key = m.threadKey ?? m.id;
    if (!threads.has(key)) threads.set(key, []);
    threads.get(key)!.push(m);
  }
  let list = [...threads.entries()].map(([key, msgs]) => ({ key, msgs, latest: msgs[0], needsReview: msgs.some((x) => x.direction === "inbound" && x.status === "needs_review"), channel: msgs[0].channel }));
  if (sp.channel) list = list.filter((t) => t.channel === sp.channel || (sp.channel === "email" && t.channel === "web_form"));
  if (sp.review === "1") list = list.filter((t) => t.needsReview);

  // Desktop shows list + conversation; on a phone the list is the landing view and a
  // conversation only takes over the screen when one was explicitly opened.
  const explicit = !!(sp.m || sp.t);
  const selectedKey = sp.m ? (messages.find((x) => x.id === sp.m)?.threadKey ?? null) : sp.t ?? list[0]?.key ?? null;
  const selected = selectedKey ? threads.get(selectedKey) ?? null : null;
  const needsReviewCount = messages.filter((m) => m.direction === "inbound" && m.status === "needs_review").length;

  const filterLink = (params: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { channel: sp.channel, review: sp.review, ...params };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const s = q.toString();
    return `/inbox${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inbox</h1>
          <p className="text-sm text-muted-foreground">Email, texts and website forms in one list. Every message becomes a lead or lands on the right job.</p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <SimulateMenu kind="email" />
            <SimulateMenu kind="sms" />
            {can(user.role, "admin") && <GmailSyncButton configured={gmailConfigured()} />}
          </div>
        )}
      </header>

      <div className="flex flex-wrap gap-2 text-sm" role="tablist" aria-label="Filter">
        {[
          ["", "All"],
          ["email", "Email"],
          ["sms", "Texts"],
          ["web_form", "Web form"],
        ].map(([v, label]) => (
          <Link key={v} href={filterLink({ channel: v || undefined, t: undefined })} role="tab" aria-selected={(sp.channel ?? "") === v} className={cn("rounded-full px-3 py-1.5 font-medium", (sp.channel ?? "") === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>
            {label}
          </Link>
        ))}
        <Link href={filterLink({ review: sp.review === "1" ? undefined : "1", t: undefined })} role="tab" aria-selected={sp.review === "1"} className={cn("rounded-full px-3 py-1.5 font-medium", sp.review === "1" ? "bg-amber-700 text-white" : "bg-amber-50 text-amber-900 hover:bg-amber-100")}>
          Needs review {needsReviewCount > 0 && <span className="ml-1 rounded-full bg-white/70 px-1.5 text-xs text-amber-900">{needsReviewCount}</span>}
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <ul className={cn("max-h-[70vh] divide-y divide-border overflow-auto rounded-2xl border border-border bg-card", explicit && "hidden lg:block")} aria-label="Conversations">
          {list.length === 0 && <li className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing here. Try “Simulate incoming email”.</li>}
          {list.map((t) => {
            const Icon = CHANNEL_ICON[t.latest.channel as keyof typeof CHANNEL_ICON] ?? Mail;
            const who = t.latest.customer?.businessName ?? (t.latest.channel === "sms" ? formatPhone(t.latest.direction === "inbound" ? t.latest.fromAddr : t.latest.toAddr) : t.latest.direction === "inbound" ? t.latest.fromAddr : t.latest.toAddr);
            return (
              <li key={t.key}>
                <Link href={filterLink({ t: t.key })} className={cn("block px-4 py-3 hover:bg-muted/40", t.key === selectedKey && "bg-primary/5")} aria-current={t.key === selectedKey ? "true" : undefined} data-testid="thread">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-medium">{who}</span>
                    {t.needsReview && <span className="rounded-full bg-amber-700 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Review</span>}
                    <span className="text-xs text-muted-foreground">{timeAgo(t.latest.receivedAt)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {t.latest.direction === "outbound" && "You: "}
                    {t.latest.subject ? `${t.latest.subject} — ` : ""}
                    {t.latest.body.replace(/\s+/g, " ")}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>

        <section className={cn("min-w-0 rounded-2xl border border-border bg-card", !explicit && "hidden lg:block")} aria-label="Conversation">
          {!selected ? (
            <div className="px-6 py-16 text-center text-sm text-muted-foreground">Pick a conversation.</div>
          ) : (
            <ThreadView msgs={[...selected].reverse()} canWrite={canWrite} backHref={filterLink({ t: undefined })} />
          )}
        </section>
      </div>
    </div>
  );
}

type Msg = Awaited<ReturnType<typeof db.message.findMany<{ include: { customer: { select: { id: true; businessName: true } }; job: { select: { id: true; stage: true } } } }>>>[number];

function ThreadView({ msgs, canWrite, backHref }: { msgs: Msg[]; canWrite: boolean; backHref: string }) {
  const latestInbound = [...msgs].reverse().find((m) => m.direction === "inbound") ?? msgs[msgs.length - 1];
  const channel = latestInbound.channel === "sms" ? "sms" : "email";
  const to = latestInbound.direction === "inbound" ? latestInbound.fromAddr : latestInbound.toAddr;
  const replyTo = latestInbound.channel === "sms" ? to : to.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? to;
  const customer = latestInbound.customer;
  const job = latestInbound.job;
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Link href={backHref} className="text-sm text-primary lg:hidden">
          ← All
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{customer ? <Link href={`/customers/${customer.id}`} className="underline decoration-transparent hover:decoration-current">{customer.businessName}</Link> : latestInbound.channel === "sms" ? formatPhone(to) : to}</p>
          <p className="text-xs text-muted-foreground">
            {latestInbound.channel.replace("_", " ")} · {latestInbound.channel === "sms" ? formatPhone(to) : to}
            {job && (
              <>
                {" · "}
                <Link href={`/jobs/${job.id}`} className="text-primary underline">
                  open job
                </Link>
              </>
            )}
          </p>
        </div>
      </header>
      <div className="flex-1 space-y-4 overflow-auto px-4 py-4">
        {msgs.map((m) => {
          const ex = m.extractedJson ? (JSON.parse(m.extractedJson) as MessageExtraction) : null;
          return (
            <article key={m.id} id={`m-${m.id}`} className={cn("max-w-[90%] space-y-2", m.direction === "outbound" ? "ml-auto" : "")} data-testid="message">
              <div className={cn("rounded-2xl px-4 py-3 text-sm", m.direction === "outbound" ? "bg-primary text-primary-foreground" : "bg-muted")}>
                {m.subject && <p className="mb-1 font-semibold">{m.subject}</p>}
                <p className="whitespace-pre-wrap">{m.body}</p>
              </div>
              <p className={cn("text-xs text-muted-foreground", m.direction === "outbound" && "text-right")}>
                {m.direction === "outbound" ? `Sent ${m.status === "failed" ? "(FAILED) " : ""}` : "Received "}
                {formatTimestamp(m.receivedAt)}
              </p>
              {m.direction === "inbound" && <ReviewCard messageId={m.id} status={m.status} extraction={ex} job={m.job} customer={m.customer} canWrite={canWrite} />}
            </article>
          );
        })}
      </div>
      {canWrite && (
        <footer className="border-t border-border px-4 py-3">
          <ReplyForm channel={channel} to={replyTo} jobId={job?.id ?? null} customerId={customer?.id ?? null} subject={latestInbound.subject} replyTo={latestInbound.id} />
        </footer>
      )}
    </div>
  );
}


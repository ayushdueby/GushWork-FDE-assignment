"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BellRing, Check, Mail, MessageSquare, Phone, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { advanceStageAction, markContactedAction } from "@/lib/actions/jobs";
import { sendQuoteReminderAction } from "@/lib/actions/quotes";
import { Button } from "@/components/ui/button";
import { STAGE_LABEL, formatPhone, nextStage, type Stage } from "@/lib/domain/types";
import { daysAgoLabel } from "@/lib/rules/dates";
import { fallbackNextStep, type RuleId } from "@/lib/rules/callToday";
import { cn } from "@/lib/utils";
import { useDialer } from "@/components/dialer/dialer-provider";
import { StageBadge, UrgentBadge } from "@/components/shared/stage-badge";
import { SendMessageDialog, type MessageTarget } from "@/components/shared/send-message-dialog";
import { AdvanceStageDialog, type TechOption } from "@/components/shared/advance-stage-dialog";

/** Serialisable row for the Today list. */
export interface TodayRow {
  jobId: string;
  customerId: string;
  rule: RuleId;
  reason: string;
  critical: boolean;
  waitingDays: number;
  urgent: boolean;
  stage: Stage;
  business: string;
  contact: string;
  phone: string | null;
  email: string | null;
  equipment: string;
  issue: string;
  quoteTotal: number | null;
  quoteId: string | null;
  lastActivity: string | null;
}

export function CallList({ rows, techs, ownerName, canWrite }: { rows: TodayRow[]; techs: TechOption[]; ownerName: string; canWrite: boolean }) {
  const [suggestions, setSuggestions] = useState<Record<string, string>>({});
  const [engine, setEngine] = useState<string | null>(null);
  const [msg, setMsg] = useState<MessageTarget | null>(null);
  const [advance, setAdvance] = useState<{ row: TodayRow; next: Stage; needs: "quote" | "schedule" } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const dialer = useDialer();

  const key = useMemo(() => rows.map((r) => `${r.jobId}:${r.rule}:${r.stage}`).join("|"), [rows]);
  useEffect(() => {
    if (rows.length === 0) return;
    const ctrl = new AbortController();
    fetch("/api/ai/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({ items: rows.map((r) => ({ jobId: r.jobId, rule: r.rule, reason: r.reason, stage: r.stage, urgent: r.urgent, waitingDays: r.waitingDays, business: r.business, contact: r.contact, equipment: r.equipment, issue: r.issue, quoteTotal: r.quoteTotal, lastActivity: r.lastActivity })) }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.suggestions) {
          setSuggestions(data.suggestions);
          setEngine(data.engine);
        }
      })
      .catch(() => {});
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function contacted(row: TodayRow) {
    const fd = new FormData();
    fd.set("jobId", row.jobId);
    start(async () => {
      const res = await markContactedAction(fd);
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function moveNext(row: TodayRow) {
    const next = nextStage(row.stage);
    if (!next) return;
    if (next === "waiting_on_yes") return setAdvance({ row, next, needs: "quote" });
    if (next === "scheduled") return setAdvance({ row, next, needs: "schedule" });
    const fd = new FormData();
    fd.set("jobId", row.jobId);
    fd.set("from", row.stage);
    start(async () => {
      const res = await advanceStageAction(fd);
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function remind(row: TodayRow) {
    if (!row.quoteId) return;
    const fd = new FormData();
    fd.set("quoteId", row.quoteId);
    start(async () => {
      const res = await sendQuoteReminderAction(fd);
      if (res.ok) {
        toast.success(res.message, res.simulated && res.preview ? { description: res.preview.slice(0, 160) } : undefined);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function call(row: TodayRow) {
    if (!row.phone) return toast.error("No phone number on file.");
    dialer.openDialer({ number: row.phone, jobId: row.jobId, customerId: row.customerId, label: row.business });
  }

  const textTemplate = (r: TodayRow) => {
    const first = r.contact.split(" ")[0] || "there";
    switch (r.rule) {
      case "equipment-down":
      case "missed-call":
      case "new-request":
        return `Hi ${first}, this is ${ownerName} from the refrigeration company. Got your message about the ${r.equipment}. When's a good time to call, or can we come by today? — ${ownerName}`;
      case "send-quote":
        return `Hi ${first}, ${ownerName} here. Working on your quote for the ${r.equipment} now, you'll have it shortly. — ${ownerName}`;
      case "follow-up-quote":
        return `Hi ${first}, just checking in on the quote${r.quoteTotal ? ` ($${Math.round(r.quoteTotal).toLocaleString()})` : ""} for the ${r.equipment}. Want me to get a tech on the schedule? — ${ownerName}`;
      case "book-tech":
        return `Hi ${first}, thanks for the go-ahead on the ${r.equipment}. What days this week work for a visit? — ${ownerName}`;
      case "confirm-done":
        return `Hi ${first}, checking that the ${r.equipment} is running right after our visit. Anything else we should look at? — ${ownerName}`;
      default:
        return `Hi ${first}, ${ownerName} here following up on the ${r.equipment}. Anything you need from us? — ${ownerName}`;
    }
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
        <p className="text-lg font-semibold">Nobody waiting on you.</p>
        <p className="mt-1 text-sm text-muted-foreground">New requests, quotes going quiet and missed calls will show up here.</p>
      </div>
    );
  }

  return (
    <>
      <ol className="space-y-3" aria-label="Call today">
        {rows.map((r) => {
          const next = nextStage(r.stage);
          return (
            <li key={r.jobId} className={cn("rounded-2xl border bg-card p-4 shadow-sm", r.critical ? "border-red-300 urgent-ring" : "border-border")} data-testid="call-row" data-job-id={r.jobId} data-rule={r.rule}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold", r.critical ? "bg-red-600 text-white" : "bg-primary/10 text-primary")}>{r.reason}</span>
                    {r.urgent && !r.critical && <UrgentBadge />}
                    <StageBadge stage={r.stage} />
                    <span className="text-xs text-muted-foreground">waiting {daysAgoLabel(r.waitingDays)}</span>
                  </div>
                  <h3 className="mt-2 text-base font-semibold leading-tight">
                    <Link href={`/jobs/${r.jobId}`} className="hover:underline">
                      {r.business}
                    </Link>
                    {r.contact && <span className="font-normal text-muted-foreground"> · {r.contact}</span>}
                  </h3>
                  <p className="mt-0.5 text-sm text-foreground/80">
                    <span className="font-medium">{r.equipment}</span>
                    {r.issue && <span className="text-muted-foreground"> — {r.issue}</span>}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    {r.phone ? (
                      <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className="font-medium text-primary underline-offset-2 hover:underline">
                        {formatPhone(r.phone)}
                      </a>
                    ) : (
                      <span className="text-destructive">No phone on file</span>
                    )}
                    {r.quoteTotal != null && <span className="text-muted-foreground">Quote ${Math.round(r.quoteTotal).toLocaleString()}</span>}
                  </div>
                  <p className="mt-2 flex items-start gap-1.5 text-sm text-foreground/80" data-testid="suggestion">
                    <Sparkles className="mt-0.5 size-3.5 shrink-0 text-violet-600" aria-hidden />
                    <span>
                      <span className="sr-only">Suggested next step: </span>
                      {suggestions[r.jobId] ?? fallbackNextStep({ rule: r.rule } as never)}
                    </span>
                  </p>
                </div>
                {canWrite && (
                  <div className="flex flex-wrap gap-2 lg:w-[22rem] lg:justify-end">
                    <Button variant="outline" size="sm" onClick={() => call(r)} aria-label={`Call ${r.business}`}>
                      <Phone /> Call
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setMsg({ channel: "sms", to: r.phone, jobId: r.jobId, customerId: r.customerId, text: textTemplate(r) })} aria-label={`Text ${r.business}`}>
                      <MessageSquare /> Text
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setMsg({ channel: "email", to: r.email, jobId: r.jobId, customerId: r.customerId, subject: `${r.equipment} at ${r.business}`, text: textTemplate(r) })} aria-label={`Email ${r.business}`}>
                      <Mail /> Email
                    </Button>
                    {r.rule === "follow-up-quote" && r.quoteId && (
                      <Button variant="outline" size="sm" onClick={() => remind(r)} disabled={pending} aria-label={`Send quote reminder to ${r.business}`} data-testid="send-reminder">
                        <BellRing /> Send reminder
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => contacted(r)} disabled={pending} aria-label={`Mark ${r.business} contacted`}>
                      <Check /> Contacted
                    </Button>
                    {next && (
                      <Button size="sm" onClick={() => moveNext(r)} disabled={pending} aria-label={`Move ${r.business} to ${STAGE_LABEL[next]}`}>
                        {STAGE_LABEL[next]} <ArrowRight />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {engine && <p className="mt-2 text-xs text-muted-foreground">Next steps by {engine === "groq" ? "Groq" : engine === "mock" ? "mocked AI" : "rules (AI unavailable)"}.</p>}
      <SendMessageDialog target={msg} open={!!msg} onOpenChange={(o) => !o && setMsg(null)} />
      {advance && <AdvanceStageDialog jobId={advance.row.jobId} from={advance.row.stage} next={advance.next} needs={advance.needs} techs={techs} business={advance.row.business} open onOpenChange={(o) => !o && setAdvance(null)} />}
    </>
  );
}

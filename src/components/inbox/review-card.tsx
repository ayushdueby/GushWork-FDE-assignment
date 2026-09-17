"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Pencil, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { reviewMessageAction } from "@/lib/actions/inbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { MessageExtraction } from "@/lib/ai/extract-message";
import { EQUIPMENT_TYPES } from "@/lib/domain/types";
import { StageBadge } from "@/components/shared/stage-badge";

export function ReviewCard({ messageId, status, extraction, job, customer, canWrite }: { messageId: string; status: string; extraction: MessageExtraction | null; job: { id: string; stage: string } | null; customer: { id: string; businessName: string } | null; canWrite: boolean }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!extraction) return null;
  const ex = extraction;

  function submit(fd: FormData) {
    start(async () => {
      const res = await reviewMessageAction(fd);
      if (res.ok) {
        toast.success(res.message);
        setEditing(false);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  const urgencyStyle = ex.urgency === "urgent" ? "bg-red-600 text-white" : ex.urgency === "high" ? "bg-amber-100 text-amber-900" : "bg-muted text-muted-foreground";
  const sel = "native h-11 w-full rounded-lg border border-input bg-background px-3 text-sm";

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 text-sm" data-testid="review-card">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 font-semibold text-violet-900">
          <Sparkles className="size-3.5" /> What we read
        </span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${urgencyStyle}`}>{ex.urgency}</span>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-violet-900 ring-1 ring-violet-200">{ex.intent.replace(/_/g, " ")}</span>
        {status === "needs_review" && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">Needs review</span>}
        {status === "accepted" && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">Reviewed</span>}
        {status === "not_a_lead" && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">Not a lead</span>}
      </div>
      <p className="mt-1 text-foreground/90">{ex.summary}</p>

      {!editing ? (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
          <Field k="Name" v={ex.name} />
          <Field k="Business" v={ex.business} />
          <Field k="Phone" v={ex.phone} />
          <Field k="Email" v={ex.email} />
          <Field k="Equipment" v={ex.equipment} />
          <Field k="Address" v={ex.address} />
          <div className="col-span-full">
            <dt className="text-muted-foreground">Issue</dt>
            <dd>{ex.issue ?? "—"}</dd>
          </div>
        </dl>
      ) : (
        <form action={submit} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="messageId" value={messageId} />
          <input type="hidden" name="decision" value="accept" />
          <input type="hidden" name="edited" value="1" />
          <div>
            <Label htmlFor={`rv-name-${messageId}`}>Name</Label>
            <Input id={`rv-name-${messageId}`} name="name" defaultValue={ex.name ?? ""} />
          </div>
          <div>
            <Label htmlFor={`rv-biz-${messageId}`}>Business</Label>
            <Input id={`rv-biz-${messageId}`} name="business" defaultValue={ex.business ?? ""} />
          </div>
          <div>
            <Label htmlFor={`rv-phone-${messageId}`}>Phone</Label>
            <Input id={`rv-phone-${messageId}`} name="phone" defaultValue={ex.phone ?? ""} />
          </div>
          <div>
            <Label htmlFor={`rv-email-${messageId}`}>Email</Label>
            <Input id={`rv-email-${messageId}`} name="email" defaultValue={ex.email ?? ""} />
          </div>
          <div>
            <Label htmlFor={`rv-eq-${messageId}`}>Equipment</Label>
            <select id={`rv-eq-${messageId}`} name="equipment" defaultValue={ex.equipment ?? "other"} className={sel}>
              {EQUIPMENT_TYPES.map((e) => (
                <option key={e}>{e}</option>
              ))}
            </select>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="urgent" defaultChecked={ex.urgency === "urgent"} className="size-4" /> Urgent
          </label>
          <div className="sm:col-span-2">
            <Label htmlFor={`rv-issue-${messageId}`}>Issue</Label>
            <Textarea id={`rv-issue-${messageId}`} name="issue" defaultValue={ex.issue ?? ""} rows={2} />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm" disabled={pending}>
              Save & accept
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {job && (
          <Link href={`/jobs/${job.id}`} className="inline-flex items-center gap-1.5 text-xs text-primary underline-offset-2 hover:underline">
            Job: <StageBadge stage={job.stage} />
          </Link>
        )}
        {customer && !job && (
          <Link href={`/customers/${customer.id}`} className="text-xs text-primary hover:underline">
            {customer.businessName}
          </Link>
        )}
        {canWrite && status !== "not_a_lead" && !editing && (
          <span className="ml-auto flex gap-2">
            {status !== "accepted" && (
              <form action={submit}>
                <input type="hidden" name="messageId" value={messageId} />
                <input type="hidden" name="decision" value="accept" />
                <Button type="submit" size="sm" disabled={pending} data-testid="review-accept">
                  <Check /> Accept
                </Button>
              </form>
            )}
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
            <form action={submit}>
              <input type="hidden" name="messageId" value={messageId} />
              <input type="hidden" name="decision" value="not_a_lead" />
              <Button type="submit" size="sm" variant="ghost" disabled={pending} className="text-muted-foreground">
                <X /> Not a lead
              </Button>
            </form>
          </span>
        )}
      </div>
    </div>
  );
}

function Field({ k, v }: { k: string; v: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="truncate">{v ?? "—"}</dd>
    </div>
  );
}

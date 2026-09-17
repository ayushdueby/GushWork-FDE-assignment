"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { CallExtraction } from "@/lib/ai/extract-call";
import type { ProposedChange } from "@/lib/pipeline/call-diff";

export interface ReviewData {
  callId: string;
  jobId: string | null;
  transcript: string;
  extraction: CallExtraction;
  changes: ProposedChange[];
  engine?: string;
  applied?: ProposedChange[] | null;
  alreadyApplied?: boolean;
}

/** Transcript + summary + "field: old → new" diff with Apply. */
export function CallReview({ data, onDone }: { data: ReviewData; onDone?: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(data.changes.map((c) => c.field)));
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState<ProposedChange[] | null>(data.applied ?? (data.alreadyApplied ? [] : null));
  const router = useRouter();
  const ex = data.extraction;

  async function apply() {
    setBusy(true);
    try {
      const res = await fetch(`/api/calls/${data.callId}/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: [...selected] }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Apply failed");
      setApplied(json.applied ?? []);
      toast.success(json.applied?.length ? `Applied ${json.applied.length} change${json.applied.length === 1 ? "" : "s"} to the job` : "Nothing to apply");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Apply failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3" data-testid="call-review">
      <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 text-sm">
        <p className="flex items-center gap-1.5 font-semibold text-violet-900">
          <Sparkles className="size-3.5" /> Summary {data.engine && <span className="text-xs font-normal text-violet-700">({data.engine === "groq" ? "Groq" : data.engine === "mock" ? "mocked AI" : "rules"})</span>}
        </p>
        <p className="mt-1">{ex.summary}</p>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {ex.issue && <Row k="Issue" v={ex.issue} wide />}
          {ex.equipment && <Row k="Equipment" v={ex.equipment} />}
          {ex.urgency && <Row k="Urgency" v={ex.urgency} />}
          {ex.quoteAmount != null && <Row k="Quote mentioned" v={`$${ex.quoteAmount.toLocaleString()}`} />}
          {ex.decision && <Row k="Decision" v={ex.decision} />}
          {ex.requestedDate && <Row k="Requested" v={ex.requestedDate} />}
          {ex.nextStep && <Row k="Next step" v={ex.nextStep} wide />}
        </dl>
      </div>

      <details className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
        <summary className="cursor-pointer font-medium">Transcript</summary>
        <p className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-muted-foreground">{data.transcript}</p>
      </details>

      {!data.jobId ? (
        <p className="text-sm text-muted-foreground">This call isn&apos;t linked to a job, so there&apos;s nothing to update.</p>
      ) : applied ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="flex items-center gap-1.5 font-semibold">
            <Check className="size-4" /> {applied.length ? "Applied to the job" : "Reviewed — no changes needed"}
          </p>
          {applied.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {applied.map((c) => (
                <li key={c.field}>
                  {c.label}: {c.old} → <strong>{c.new}</strong>
                </li>
              ))}
            </ul>
          )}
          <Link href={`/jobs/${data.jobId}`} className="mt-2 inline-block underline">
            Open the job
          </Link>
        </div>
      ) : data.changes.length === 0 ? (
        <div className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
          <span className="text-muted-foreground">Nothing on this call changes the job.</span>
          <Button size="sm" variant="outline" onClick={apply} disabled={busy}>
            Mark reviewed
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-border p-3">
          <p className="mb-2 text-sm font-semibold">Proposed changes</p>
          <ul className="space-y-1.5">
            {data.changes.map((c) => (
              <li key={c.field}>
                <label className="flex min-h-9 cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 size-4"
                    checked={selected.has(c.field)}
                    onChange={(e) =>
                      setSelected((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(c.field);
                        else n.delete(c.field);
                        return n;
                      })
                    }
                  />
                  <span>
                    <span className="font-medium">{c.label}:</span> <span className="text-muted-foreground line-through">{c.old}</span> → <span className="font-semibold text-primary">{c.new}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={apply} disabled={busy || selected.size === 0} data-testid="apply-changes">
              {busy ? "Applying…" : `Apply ${selected.size} change${selected.size === 1 ? "" : "s"}`}
            </Button>
            <Button variant="outline" onClick={onDone}>
              Skip
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v, wide }: { k: string; v: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="capitalize-first">{v}</dd>
    </div>
  );
}

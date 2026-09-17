import Link from "next/link";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/domain/types";
import { formatTimestamp } from "@/lib/rules/dates";

export interface QuoteRow {
  id: string;
  status: string;
  total: number;
  sentAt: string | null;
  respondedAt: string | null;
  customerComment: string | null;
  itemCount: number;
  publicToken: string;
}

const STATUS: Record<string, string> = { draft: "bg-slate-100 text-slate-700", sent: "bg-violet-100 text-violet-900", accepted: "bg-emerald-100 text-emerald-900", declined: "bg-rose-100 text-rose-800" };

/** Quotes on a job. The builder itself lives at /quotes/[id] (Phase 4). */
export function QuotePanel({ jobId, quotes, canWrite, canEdit }: { jobId: string; quotes: QuoteRow[]; canWrite: boolean; canEdit: boolean }) {
  return (
    <div className="space-y-3">
      {quotes.length === 0 && <p className="text-sm text-muted-foreground">No quote yet.</p>}
      <ul className="divide-y divide-border">
        {quotes.map((q) => (
          <li key={q.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS[q.status] ?? STATUS.draft}`}>{q.status}</span>
            <span className="font-semibold tabular-nums">{money(q.total)}</span>
            <span className="text-muted-foreground">
              {q.itemCount} line{q.itemCount === 1 ? "" : "s"}
              {q.sentAt && ` · sent ${formatTimestamp(q.sentAt)}`}
              {q.respondedAt && ` · answered ${formatTimestamp(q.respondedAt)}`}
            </span>
            {q.customerComment && <span className="w-full text-muted-foreground">“{q.customerComment}”</span>}
            {canWrite && (
              <Link href={`/quotes/${q.id}`} className="ml-auto text-primary hover:underline">
                Open
              </Link>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <Button variant="outline" size="sm" render={<Link href={`/quotes/new?jobId=${jobId}`} />}>
          Build a quote
        </Button>
      )}
    </div>
  );
}

import Link from "next/link";
import { requirePage } from "@/lib/auth/current";
import { money } from "@/lib/domain/types";
import { formatTimestamp } from "@/lib/rules/dates";
import { listQuotes } from "@/lib/services/quotes";
import { cn } from "@/lib/utils";

export const metadata = { title: "Quotes" };

const STATUS_STYLE: Record<string, string> = { draft: "bg-slate-100 text-slate-700", sent: "bg-violet-100 text-violet-900", accepted: "bg-emerald-100 text-emerald-900", declined: "bg-rose-100 text-rose-800" };

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePage("view:quotes");
  const { status } = await searchParams;
  const quotes = await listQuotes(status || null);
  const totals = { sent: 0, accepted: 0 };
  for (const q of quotes) {
    if (q.status === "sent") totals.sent += q.total;
    if (q.status === "accepted") totals.accepted += q.total;
  }
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Quotes</h1>
        <p className="text-sm text-muted-foreground">Build a quote from any job. Customers accept or decline at a public link; the job moves on its own.</p>
      </header>
      <div className="flex flex-wrap gap-2" role="tablist">
        {[
          ["", "All"],
          ["draft", "Drafts"],
          ["sent", "Waiting on a yes"],
          ["accepted", "Accepted"],
          ["declined", "Declined"],
        ].map(([v, label]) => (
          <Link key={v} href={v ? `/quotes?status=${v}` : "/quotes"} role="tab" aria-selected={(status ?? "") === v} className={cn("rounded-full px-3 py-1.5 text-sm font-medium", (status ?? "") === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>
            {label}
          </Link>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Job</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Sent</th>
              <th className="px-3 py-2">Answered</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {quotes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                  No quotes here yet.
                </td>
              </tr>
            )}
            {quotes.map((q) => (
              <tr key={q.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-3 py-2">
                  <Link href={`/quotes/${q.id}`} className="font-medium hover:underline">
                    {q.customer.businessName}
                  </Link>
                </td>
                <td className="max-w-xs truncate px-3 py-2 text-muted-foreground">
                  {q.job.equipmentType} — {q.job.issue}
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLE[q.status] ?? STATUS_STYLE.draft}`}>{q.status}</span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{q.sentAt ? formatTimestamp(q.sentAt) : "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{q.respondedAt ? formatTimestamp(q.respondedAt) : "—"}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(q.total)}</td>
              </tr>
            ))}
          </tbody>
          {quotes.length > 0 && (
            <tfoot className="border-t border-border bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <td colSpan={6} className="px-3 py-2">
                  Waiting on a yes: <strong>{money(totals.sent)}</strong> · Accepted: <strong>{money(totals.accepted)}</strong>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { QuoteBuilder } from "@/components/quotes/quote-builder";
import { StageBadge } from "@/components/shared/stage-badge";
import { requirePage } from "@/lib/auth/current";
import { can } from "@/lib/auth/permissions";
import { money } from "@/lib/domain/types";
import { formatTimestamp } from "@/lib/rules/dates";
import { getQuoteDetail, priceList } from "@/lib/services/quotes";

const STATUS_STYLE: Record<string, string> = { draft: "bg-slate-100 text-slate-700", sent: "bg-violet-100 text-violet-900", accepted: "bg-emerald-100 text-emerald-900", declined: "bg-rose-100 text-rose-800" };

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("view:quotes");
  const { id } = await params;
  const [q, prices] = await Promise.all([getQuoteDetail(id), priceList()]);
  if (!q) notFound();
  const canEdit = can(user.role, "write:quotes");
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <nav className="text-sm text-muted-foreground">
        <Link href="/quotes" className="hover:underline">
          Quotes
        </Link>{" "}
        / {q.customer.businessName}
      </nav>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLE[q.status] ?? STATUS_STYLE.draft}`}>{q.status}</span>
            <StageBadge stage={q.job.stage} />
            {q.sentAt && <span className="text-xs text-muted-foreground">sent {formatTimestamp(q.sentAt)}</span>}
            {q.respondedAt && <span className="text-xs text-muted-foreground">answered {formatTimestamp(q.respondedAt)}</span>}
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            Quote for{" "}
            <Link href={`/customers/${q.customer.id}`} className="hover:underline">
              {q.customer.businessName}
            </Link>
          </h1>
          <p className="text-sm text-muted-foreground">
            <Link href={`/jobs/${q.job.id}`} className="hover:underline">
              {q.job.equipmentType} — {q.job.issue}
            </Link>
          </p>
          {q.customerComment && <p className="mt-1 rounded-lg bg-muted px-3 py-2 text-sm">Customer: “{q.customerComment}”</p>}
        </div>
        <p className="text-2xl font-bold tabular-nums">{money(q.total)}</p>
      </header>
      <QuoteBuilder quote={{ id: q.id, status: q.status, taxRate: q.taxRate, notes: q.notes, items: q.items.map((i) => ({ description: i.description, qty: i.qty, unitPrice: i.unitPrice })), publicToken: q.publicToken, total: q.total }} priceList={prices} canEdit={canEdit} customer={{ email: q.customer.email, phone: q.customer.phone }} />
    </div>
  );
}

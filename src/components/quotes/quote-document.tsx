import { money } from "@/lib/domain/types";

export interface QuoteDoc {
  id: string;
  status: string;
  createdAt: Date;
  sentAt: Date | null;
  items: { description: string; qty: number; unitPrice: number }[];
  subtotal: number;
  taxRate: number;
  tax: number;
  total: number;
  notes: string;
  customer: { businessName: string; primaryContact: string; phone: string | null; email: string | null; address?: string | null };
  job: { equipmentType: string; issue: string };
  business: { name: string; owner: string; phone: string; email: string };
}

/** The quote as a document — used by the print page and the public page. */
export function QuoteDocument({ q }: { q: QuoteDoc }) {
  return (
    <article className="mx-auto max-w-2xl bg-white p-6 text-slate-900 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-lg font-bold">{q.business.name}</p>
          <p className="text-sm text-slate-600">
            {q.business.owner} · {q.business.phone}
            <br />
            {q.business.email}
          </p>
        </div>
        <div className="text-right text-sm">
          <p className="text-xl font-bold tracking-tight">Quote</p>
          <p className="text-slate-600">#{q.id.slice(-6).toUpperCase()}</p>
          <p className="text-slate-600">{(q.sentAt ?? q.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
        </div>
      </header>
      <section className="grid gap-4 py-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prepared for</p>
          <p className="font-semibold">{q.customer.businessName}</p>
          <p className="text-slate-600">
            {q.customer.primaryContact}
            {q.customer.address && (
              <>
                <br />
                {q.customer.address}
              </>
            )}
            {q.customer.phone && (
              <>
                <br />
                {q.customer.phone}
              </>
            )}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Work</p>
          <p className="font-semibold capitalize">{q.job.equipmentType}</p>
          <p className="text-slate-600">{q.job.issue}</p>
        </div>
      </section>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="py-2">Description</th>
            <th className="py-2 text-right">Qty</th>
            <th className="py-2 text-right">Unit</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {q.items.map((it, i) => (
            <tr key={i} className="border-b border-slate-100">
              <td className="py-2">{it.description}</td>
              <td className="py-2 text-right tabular-nums">{it.qty}</td>
              <td className="py-2 text-right tabular-nums">{money(it.unitPrice)}</td>
              <td className="py-2 text-right tabular-nums">{money(Math.round(it.qty * it.unitPrice * 100) / 100)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="pt-3 text-right text-slate-600">
              Subtotal
            </td>
            <td className="pt-3 text-right tabular-nums">{money(q.subtotal)}</td>
          </tr>
          <tr>
            <td colSpan={3} className="text-right text-slate-600">
              Tax ({q.taxRate}%)
            </td>
            <td className="text-right tabular-nums">{money(q.tax)}</td>
          </tr>
          <tr className="text-lg font-bold">
            <td colSpan={3} className="pt-2 text-right">
              Total
            </td>
            <td className="pt-2 text-right tabular-nums">{money(q.total)}</td>
          </tr>
        </tfoot>
      </table>
      {q.notes && (
        <section className="mt-6 text-sm text-slate-600">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</p>
          <p className="whitespace-pre-wrap">{q.notes}</p>
        </section>
      )}
    </article>
  );
}

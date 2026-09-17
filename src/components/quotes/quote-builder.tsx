"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Printer, Save, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveQuoteAction, sendQuoteAction } from "@/lib/actions/quotes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { money } from "@/lib/domain/types";
import { computeTotals } from "@/lib/quotes/totals";
import { PriceListEditor } from "./price-list-editor";

interface Item {
  description: string;
  qty: number;
  unitPrice: number;
}
export interface PriceItem {
  id: string;
  description: string;
  kind: string;
  unitPrice: number;
}

export function QuoteBuilder({ quote, priceList, canEdit, customer }: { quote: { id: string; status: string; taxRate: number; notes: string; items: Item[]; publicToken: string; total: number }; priceList: PriceItem[]; canEdit: boolean; customer: { email: string | null; phone: string | null } }) {
  const [items, setItems] = useState<Item[]>(quote.items.length ? quote.items : [{ description: "", qty: 1, unitPrice: 0 }]);
  const [taxRate, setTaxRate] = useState(quote.taxRate);
  const [notes, setNotes] = useState(quote.notes);
  const [pending, start] = useTransition();
  const [sent, setSent] = useState<{ url: string; preview: string; simulated: boolean; to: string } | null>(null);
  const router = useRouter();
  const locked = quote.status === "accepted" || quote.status === "declined" || !canEdit;
  const totals = useMemo(() => computeTotals(items, taxRate), [items, taxRate]);

  const setItem = (i: number, patch: Partial<Item>) => setItems((cur) => cur.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const fd = () => {
    const f = new FormData();
    f.set("quoteId", quote.id);
    f.set("items", JSON.stringify(items.filter((it) => it.description.trim())));
    f.set("taxRate", String(taxRate));
    f.set("notes", notes);
    return f;
  };

  function save() {
    start(async () => {
      const res = await saveQuoteAction(fd());
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else toast.error(res.error);
    });
  }
  function send(channel?: "email" | "sms") {
    start(async () => {
      const f = fd();
      if (channel) f.set("channel", channel);
      const res = await sendQuoteAction(f);
      if (res.ok) {
        toast.success(res.message);
        setSent({ url: res.url, preview: res.preview, simulated: res.simulated, to: res.to });
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-4">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Description</th>
                <th className="w-20 px-2 py-2">Qty</th>
                <th className="w-28 px-2 py-2">Unit price</th>
                <th className="w-24 px-2 py-2 text-right">Line</th>
                {!locked && <th className="w-10" />}
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-3 py-1.5">
                    <Input value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} placeholder="Part or labor" disabled={locked} aria-label={`Line ${i + 1} description`} list="price-list-options" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input type="number" min={0} step={0.5} value={it.qty} onChange={(e) => setItem(i, { qty: Number(e.target.value) })} disabled={locked} aria-label={`Line ${i + 1} quantity`} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Input type="number" min={0} step={0.01} value={it.unitPrice} onChange={(e) => setItem(i, { unitPrice: Number(e.target.value) })} disabled={locked} aria-label={`Line ${i + 1} unit price`} />
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{money(Math.round(it.qty * it.unitPrice * 100) / 100)}</td>
                  {!locked && (
                    <td className="px-1 py-1.5">
                      <button type="button" onClick={() => setItems((cur) => cur.filter((_, idx) => idx !== i))} className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive" aria-label={`Remove line ${i + 1}`}>
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id="price-list-options">
            {priceList.map((p) => (
              <option key={p.id} value={p.description} />
            ))}
          </datalist>
          {!locked && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border p-2">
              <Button variant="outline" size="sm" onClick={() => setItems((c) => [...c, { description: "", qty: 1, unitPrice: 0 }])}>
                <Plus /> Blank line
              </Button>
              <span className="text-xs text-muted-foreground">or add from the price list →</span>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
          <div>
            <Label htmlFor="q-notes">Notes for the customer</Label>
            <Textarea id="q-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} disabled={locked} maxLength={2000} />
          </div>
          <div className="space-y-2 rounded-2xl border border-border bg-card p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{money(totals.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="q-tax" className="text-muted-foreground">
                Tax %
              </label>
              <Input id="q-tax" type="number" min={0} max={30} step={0.01} value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} disabled={locked} className="h-9 w-24 text-right" />
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="tabular-nums">{money(totals.tax)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
              <span>Total</span>
              <span className="tabular-nums" data-testid="quote-total">
                {money(totals.total)}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">Saved totals are computed on the server.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {!locked && (
            <Button variant="outline" onClick={save} disabled={pending}>
              <Save /> Save draft
            </Button>
          )}
          {!locked && (
            <Button onClick={() => send()} disabled={pending || totals.total <= 0} data-testid="send-quote">
              <Send /> {quote.status === "sent" ? "Send again" : "Send quote"}
            </Button>
          )}
          {!locked && customer.phone && customer.email && (
            <Button variant="outline" onClick={() => send("sms")} disabled={pending || totals.total <= 0}>
              Send by text instead
            </Button>
          )}
          <Button variant="outline" render={<Link href={`/quotes/${quote.id}/print`} target="_blank" />}>
            <Printer /> Print
          </Button>
          <Button variant="outline" render={<a href={`/api/quotes/${quote.id}/pdf`} />}>
            PDF
          </Button>
          <Button variant="ghost" render={<Link href={`/q/${quote.publicToken}`} target="_blank" />} className="text-muted-foreground">
            Customer view ↗
          </Button>
        </div>
      </div>

      <aside className="space-y-4">
        {!locked && (
          <PriceListEditor
            items={priceList}
            canEdit={canEdit}
            onPick={(p) => setItems((c) => [...c.filter((it) => it.description.trim()), { description: p.description, qty: 1, unitPrice: p.unitPrice }])}
          />
        )}
      </aside>

      <Dialog open={!!sent} onOpenChange={(o) => !o && setSent(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{sent?.simulated ? "Quote sent (simulated)" : "Quote sent"}</DialogTitle>
            <DialogDescription>To {sent?.to}. The customer can accept or decline at the link below.</DialogDescription>
          </DialogHeader>
          {sent && (
            <div className="space-y-3">
              <a href={sent.url} target="_blank" rel="noreferrer" className="block break-all rounded-lg bg-muted p-2 text-sm text-primary underline" data-testid="quote-public-link">
                {sent.url}
              </a>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs">{sent.preview}</pre>
              <div className="flex justify-end">
                <Button onClick={() => setSent(null)}>Done</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

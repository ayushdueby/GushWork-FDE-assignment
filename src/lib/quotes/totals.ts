/** Quote arithmetic — pure so it's unit-tested and computed on the server only. */
export interface LineItemInput {
  description: string;
  qty: number;
  unitPrice: number;
}

export interface Totals {
  subtotal: number;
  tax: number;
  total: number;
  lines: { description: string; qty: number; unitPrice: number; lineTotal: number }[];
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeTotals(items: LineItemInput[], taxRatePercent: number): Totals {
  const lines = items
    .filter((it) => it.description.trim() !== "" || it.qty !== 0 || it.unitPrice !== 0)
    .map((it) => {
      const qty = Number.isFinite(it.qty) && it.qty > 0 ? it.qty : 0;
      const unitPrice = Number.isFinite(it.unitPrice) && it.unitPrice >= 0 ? it.unitPrice : 0;
      return { description: it.description.trim(), qty, unitPrice, lineTotal: round2(qty * unitPrice) };
    });
  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const rate = Number.isFinite(taxRatePercent) && taxRatePercent >= 0 ? taxRatePercent : 0;
  const tax = round2(subtotal * (rate / 100));
  return { subtotal, tax, total: round2(subtotal + tax), lines };
}

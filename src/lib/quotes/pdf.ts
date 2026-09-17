import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { money } from "@/lib/domain/types";
import type { QuoteDoc } from "@/components/quotes/quote-document";

/** A clean one-page quote PDF. pdf-lib only — no headless browser, works on serverless. */
export async function renderQuotePdf(q: QuoteDoc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]); // US Letter
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.09, 0.1, 0.13);
  const muted = rgb(0.42, 0.45, 0.5);
  const line = rgb(0.85, 0.87, 0.9);
  const margin = 54;
  let y = 740;
  const text = (s: string, x: number, size = 10, f = font, color = ink) => page.drawText(sanitize(s), { x, y, size, font: f, color });
  const right = (s: string, xRight: number, size = 10, f = font, color = ink) => page.drawText(sanitize(s), { x: xRight - f.widthOfTextAtSize(sanitize(s), size), y, size, font: f, color });

  text(q.business.name, margin, 16, bold);
  right("QUOTE", 612 - margin, 20, bold);
  y -= 16;
  text(`${q.business.owner} · ${q.business.phone}`, margin, 9, font, muted);
  right(`#${q.id.slice(-6).toUpperCase()}`, 612 - margin, 10, font, muted);
  y -= 12;
  text(q.business.email, margin, 9, font, muted);
  right((q.sentAt ?? q.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }), 612 - margin, 10, font, muted);
  y -= 22;
  page.drawLine({ start: { x: margin, y }, end: { x: 612 - margin, y }, thickness: 1, color: line });
  y -= 24;

  text("PREPARED FOR", margin, 8, bold, muted);
  text("WORK", 330, 8, bold, muted);
  y -= 14;
  text(q.customer.businessName, margin, 11, bold);
  text(q.job.equipmentType, 330, 11, bold);
  y -= 13;
  text(q.customer.primaryContact, margin, 9, font, muted);
  for (const l of wrap(q.job.issue, 44)) {
    text(l, 330, 9, font, muted);
    y -= 11;
  }
  y += 11;
  if (q.customer.address) {
    y -= 11;
    text(q.customer.address, margin, 9, font, muted);
  }
  if (q.customer.phone) {
    y -= 11;
    text(q.customer.phone, margin, 9, font, muted);
  }
  y -= 30;

  const cols = { qty: 400, unit: 470, amt: 612 - margin };
  text("DESCRIPTION", margin, 8, bold, muted);
  right("QTY", cols.qty, 8, bold, muted);
  right("UNIT", cols.unit, 8, bold, muted);
  right("AMOUNT", cols.amt, 8, bold, muted);
  y -= 6;
  page.drawLine({ start: { x: margin, y }, end: { x: 612 - margin, y }, thickness: 0.8, color: line });
  y -= 16;
  for (const it of q.items) {
    const lines = wrap(it.description, 58);
    text(lines[0], margin, 10);
    right(String(it.qty), cols.qty, 10);
    right(money(it.unitPrice), cols.unit, 10);
    right(money(Math.round(it.qty * it.unitPrice * 100) / 100), cols.amt, 10);
    for (const l of lines.slice(1)) {
      y -= 12;
      text(l, margin, 10);
    }
    y -= 8;
    page.drawLine({ start: { x: margin, y }, end: { x: 612 - margin, y }, thickness: 0.5, color: line });
    y -= 14;
    if (y < 160) break;
  }
  y -= 4;
  right("Subtotal", cols.unit, 10, font, muted);
  right(money(q.subtotal), cols.amt, 10);
  y -= 14;
  right(`Tax (${q.taxRate}%)`, cols.unit, 10, font, muted);
  right(money(q.tax), cols.amt, 10);
  y -= 18;
  right("Total", cols.unit, 13, bold);
  right(money(q.total), cols.amt, 13, bold);
  if (q.notes) {
    y -= 34;
    text("NOTES", margin, 8, bold, muted);
    for (const l of wrap(q.notes, 95)) {
      y -= 12;
      if (y < 60) break;
      text(l, margin, 9, font, muted);
    }
  }
  return pdf.save();
}

function sanitize(s: string): string {
  // WinAnsi can't encode every glyph (curly quotes, emoji); swap or drop them rather than crash.
  return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/—/g, "-").replace(/–/g, "-").replace(/[^\x20-\x7E]/g, "");
}

function wrap(s: string, max: number): string[] {
  const words = s.split(/\s+/);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max) {
      if (cur) out.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) out.push(cur);
  return out.length ? out : [""];
}

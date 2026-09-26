import { describe, expect, it } from "vitest";
import { renderQuotePdf } from "@/lib/quotes/pdf";
import { suggestNextSteps } from "@/lib/ai/suggest";
import type { QuoteDoc } from "@/components/quotes/quote-document";

const doc = (over: Partial<QuoteDoc> = {}): QuoteDoc => ({
  id: "cmu5h565w001glkmvhw6g3sn3",
  status: "sent",
  createdAt: new Date(2026, 8, 17),
  sentAt: new Date(2026, 8, 17),
  items: [
    { description: "Door gasket", qty: 2, unitPrice: 95 },
    { description: "Labor (per hour)", qty: 2, unitPrice: 110 },
  ],
  subtotal: 410,
  taxRate: 8.25,
  tax: 33.83,
  total: 443.83,
  notes: "Parts and labor as listed. 30-day workmanship warranty.",
  customer: { businessName: "Harbor Seafood", primaryContact: "Jake Morrison", phone: "(512) 555-0102", email: "jake@harbor.com", address: "3801 S Lamar Blvd" },
  job: { equipmentType: "reach-in", issue: "Two-door reach-in freezer frosting heavily" },
  business: { name: "Denise's Commercial Refrigeration", owner: "Denise", phone: "(512) 555-0100", email: "denise@example.com" },
  ...over,
});

describe("quote PDF", () => {
  it("renders a real PDF with content", async () => {
    const bytes = await renderQuotePdf(doc());
    expect(bytes.byteLength).toBeGreaterThan(800);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect(Buffer.from(bytes).toString("latin1")).toContain("%%EOF");
  });

  it("survives characters WinAnsi can't encode instead of throwing", async () => {
    // Curly quotes, em dashes and emoji come from real customer text and Groq summaries.
    const bytes = await renderQuotePdf(
      doc({
        notes: "Customer said “go ahead” — we'll be there 🙂 at 9am. Temp: 30°F",
        customer: { businessName: "Café Niña 🍦", primaryContact: "José Álvarez", phone: "(512) 555-0102", email: "jose@cafe.com", address: "Straße 5" },
        items: [{ description: "Réfrigérant R‑404A — 6 lb", qty: 6, unitPrice: 38 }],
      }),
    );
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });

  it("handles an empty quote and a very long line list without blowing up", async () => {
    expect((await renderQuotePdf(doc({ items: [], subtotal: 0, tax: 0, total: 0, notes: "" }))).byteLength).toBeGreaterThan(500);
    const many = Array.from({ length: 60 }, (_, i) => ({ description: `Line item number ${i} with a deliberately long description that must wrap`, qty: 1, unitPrice: 10 }));
    expect((await renderQuotePdf(doc({ items: many }))).byteLength).toBeGreaterThan(800);
  });
});

describe("batched next-step suggestions", () => {
  const row = (jobId: string, rule: Parameters<typeof suggestNextSteps>[0][number]["rule"]) => ({
    jobId,
    rule,
    reason: "reason",
    stage: "needs_quote",
    urgent: false,
    waitingDays: 2,
    business: "Rosa's Taqueria",
    contact: "Rosa",
    equipment: "walk-in freezer",
    issue: "Down since Friday",
    quoteTotal: null,
    lastActivity: null,
  });

  it("returns exactly one suggestion per job, keyed by job id", async () => {
    const r = await suggestNextSteps([row("a", "equipment-down"), row("b", "book-tech"), row("c", "follow-up-quote")]);
    expect(Object.keys(r.suggestions).sort()).toEqual(["a", "b", "c"]);
    expect(Object.values(r.suggestions).every((t) => t.length > 0)).toBe(true);
  });

  it("the fallback text is specific to the rule, not one generic line", async () => {
    const r = await suggestNextSteps([row("a", "equipment-down"), row("b", "book-tech"), row("c", "missed-call")]);
    expect(new Set(Object.values(r.suggestions)).size).toBe(3);
    expect(r.suggestions.a).toMatch(/call now/i);
    expect(r.suggestions.b).toMatch(/tech/i);
    expect(r.suggestions.c).toMatch(/call back/i);
  });

  it("an empty list is a no-op (no request, no crash)", async () => {
    const r = await suggestNextSteps([]);
    expect(r.suggestions).toEqual({});
    expect(r.engine).toBe("fallback");
  });
});

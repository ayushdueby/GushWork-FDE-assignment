import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { computeTotals } from "@/lib/quotes/totals";
import { createCustomer } from "@/lib/services/customers";
import { createJob } from "@/lib/services/jobs";
import { createDraftQuote, respondToQuote, sendQuote, updateQuote } from "@/lib/services/quotes";
import { resetDb } from "./db-helpers";

describe("computeTotals", () => {
  it("adds lines, applies tax, rounds to cents", () => {
    const t = computeTotals([{ description: "Gasket", qty: 2, unitPrice: 95 }, { description: "Labor", qty: 1.5, unitPrice: 110 }], 8.25);
    expect(t.subtotal).toBe(355);
    expect(t.tax).toBe(29.29);
    expect(t.total).toBe(384.29);
  });
  it("ignores blank lines, negative prices and bad tax", () => {
    const t = computeTotals([{ description: "", qty: 1, unitPrice: 999 }, { description: "x", qty: -1, unitPrice: 10 }, { description: "y", qty: 1, unitPrice: -5 }, { description: "ok", qty: 1, unitPrice: 10 }], -3);
    expect(t.lines.length).toBe(3);
    expect(t.subtotal).toBe(10);
    expect(t.tax).toBe(0);
    expect(t.total).toBe(10);
  });
  it("avoids float drift on classic cases", () => {
    expect(computeTotals([{ description: "a", qty: 3, unitPrice: 0.1 }], 0).total).toBe(0.3);
    expect(computeTotals([{ description: "a", qty: 1, unitPrice: 1.005 }], 0).total).toBe(1.01);
  });
});

describe("quote lifecycle", () => {
  beforeEach(resetDb);

  async function setup() {
    const c = await createCustomer({ businessName: "Harbor Seafood", phone: "(512) 555-0102", email: "jake@harbor.com" });
    const job = await createJob({ customerId: c.id, issue: "Gaskets shot", equipmentType: "reach-in", source: "call" });
    const q = await createDraftQuote(job.id, "Denise");
    await updateQuote(q.id, { items: [{ description: "Door gasket", qty: 2, unitPrice: 95 }, { description: "Labor", qty: 2, unitPrice: 110 }], taxRate: 8.25, notes: "30-day warranty" }, "Denise");
    return { c, job, q };
  }

  it("totals are computed server-side and the draft is reused", async () => {
    const { job, q } = await setup();
    const again = await createDraftQuote(job.id, "Denise");
    expect(again.id).toBe(q.id);
    const saved = await db.quote.findUnique({ where: { id: q.id } });
    expect(saved?.total).toBe(443.83); // 410 + 8.25% = 33.825 → 33.83
  });

  it("sending moves the job to waiting_on_yes and counts as contact", async () => {
    const { job, q } = await setup();
    const r = await sendQuote(q.id, "Denise");
    expect(r.simulated).toBe(true);
    expect(r.url).toContain("/q/");
    const j = await db.job.findUnique({ where: { id: job.id } });
    expect(j?.stage).toBe("waiting_on_yes");
    expect(j?.lastContactAt).not.toBeNull();
    expect((await db.quote.findUnique({ where: { id: q.id } }))?.status).toBe("sent");
  });

  it("accept → approved, exactly once; a second answer is rejected", async () => {
    const { job, q } = await setup();
    await sendQuote(q.id, "Denise");
    const token = (await db.quote.findUnique({ where: { id: q.id } }))!.publicToken;
    const first = await respondToQuote(token, "accept", "Mornings please");
    expect(first.alreadyAnswered).toBe(false);
    expect(first.status).toBe("accepted");
    expect((await db.job.findUnique({ where: { id: job.id } }))?.stage).toBe("approved");
    const second = await respondToQuote(token, "decline", null);
    expect(second.alreadyAnswered).toBe(true);
    expect(second.status).toBe("accepted");
    expect((await db.job.findUnique({ where: { id: job.id } }))?.stage).toBe("approved");
    expect(await db.notification.count()).toBe(1);
  });

  it("decline → lost with the comment as reason", async () => {
    const { job, q } = await setup();
    await sendQuote(q.id, "Denise");
    const token = (await db.quote.findUnique({ where: { id: q.id } }))!.publicToken;
    await respondToQuote(token, "decline", "Too expensive");
    const j = await db.job.findUnique({ where: { id: job.id } });
    expect(j?.stage).toBe("lost");
    expect(j?.lostReason).toContain("Too expensive");
  });

  it("concurrent double-submit only counts once", async () => {
    const { q } = await setup();
    await sendQuote(q.id, "Denise");
    const token = (await db.quote.findUnique({ where: { id: q.id } }))!.publicToken;
    const results = await Promise.all([respondToQuote(token, "accept", null), respondToQuote(token, "accept", null)]);
    expect(results.filter((r) => !r.alreadyAnswered).length).toBe(1);
  });

  it("refuses to edit or send an answered quote, and to send an empty one", async () => {
    const { q } = await setup();
    await sendQuote(q.id, "Denise");
    const token = (await db.quote.findUnique({ where: { id: q.id } }))!.publicToken;
    await respondToQuote(token, "accept", null);
    await expect(updateQuote(q.id, { items: [{ description: "x", qty: 1, unitPrice: 1 }], taxRate: 0, notes: "" }, "Denise")).rejects.toThrow(/answered/);
    await expect(sendQuote(q.id, "Denise")).rejects.toThrow(/answered/);
    await expect(updateQuote(q.id, { items: [], taxRate: 0, notes: "" }, "Denise")).rejects.toThrow();
  });
});

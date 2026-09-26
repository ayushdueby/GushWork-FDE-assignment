import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { buildReports, csvCell, jobsCsv, parseRange, toCsv } from "@/lib/services/reports";
import { createCustomer } from "@/lib/services/customers";
import { createJob } from "@/lib/services/jobs";
import { resetDb } from "./db-helpers";

describe("csv safety", () => {
  it("neutralises anything a spreadsheet would run as a formula", () => {
    // A customer called "=cmd|' /c calc'!A1" must never execute in Excel.
    expect(csvCell("=cmd|' /c calc'!A1")).toBe("'=cmd|' /c calc'!A1");
    expect(csvCell("+1 512 555 0199")).toBe("'+1 512 555 0199");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell("@handle")).toBe("'@handle");
    expect(csvCell("\tTabbed")).toBe("'\tTabbed");
    expect(csvCell("safe text")).toBe("safe text");
  });

  it("escapes quotes, commas and newlines", () => {
    expect(csvCell('Joe "The Ice" Diner, Inc.')).toBe('"Joe ""The Ice"" Diner, Inc."');
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("writes a BOM and CRLF rows so Excel opens UTF-8 correctly", () => {
    const out = toCsv(["a", "b"], [[1, "x"]]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toContain("a,b\r\n1,x\r\n");
  });
});

describe("parseRange", () => {
  const now = new Date(2026, 8, 17, 15, 0); // Thu Sep 17 2026

  it("defaults to the last 90 days ending today (end is exclusive, so today counts)", () => {
    const r = parseRange(null, null, now);
    expect(r.to.getTime()).toBe(new Date(2026, 8, 18).getTime());
    expect(Math.round((r.to.getTime() - r.from.getTime()) / 86_400_000)).toBe(90);
  });

  it("honours explicit dates and includes the whole end day", () => {
    const r = parseRange("2026-09-01", "2026-09-15", now);
    expect(r.from.getTime()).toBe(new Date(2026, 8, 1).getTime());
    expect(r.to.getTime()).toBe(new Date(2026, 8, 16).getTime());
  });

  it("ignores garbage and falls back to the defaults", () => {
    const r = parseRange("not-a-date", "13/45/2026", now);
    expect(r.to.getTime()).toBe(new Date(2026, 8, 18).getTime());
    expect(Number.isNaN(r.from.getTime())).toBe(false);
  });
});

describe("buildReports", () => {
  const day = 86_400_000;
  const ago = (d: number, h = 10) => {
    const x = new Date(Date.now() - d * day);
    x.setHours(h, 0, 0, 0);
    return x;
  };

  beforeEach(resetDb);

  async function fixture() {
    const tech = await db.tech.create({ data: { name: "Marcus Lee" } });
    const idle = await db.tech.create({ data: { name: "Dev Patel" } });
    const a = await createCustomer({ businessName: "Alpha Diner", phone: "(512) 555-0001" });
    const b = await createCustomer({ businessName: "Beta Grocery", phone: "(512) 555-0002" });

    // Won and completed 3 days ago, $1,000, by Marcus.
    const won = await createJob({ customerId: a.id, issue: "Cooler warm", source: "email", stage: "done", createdAt: ago(10), lastContactAt: ago(9) });
    await db.job.update({ where: { id: won.id }, data: { completedAt: ago(3), techId: tech.id } });
    await db.quote.create({ data: { jobId: won.id, customerId: a.id, status: "accepted", sentAt: ago(8), respondedAt: ago(7), subtotal: 1000, tax: 0, total: 1000 } });

    // Quote still out, $500.
    const open = await createJob({ customerId: b.id, issue: "Ice machine", source: "sms", stage: "waiting_on_yes", createdAt: ago(5), lastContactAt: ago(4) });
    await db.quote.create({ data: { jobId: open.id, customerId: b.id, status: "sent", sentAt: ago(4), subtotal: 500, tax: 0, total: 500 } });

    // Declined quote, $300.
    const lost = await createJob({ customerId: b.id, issue: "Prep table", source: "sms", stage: "lost", createdAt: ago(6), lastContactAt: ago(6) });
    await db.quote.create({ data: { jobId: lost.id, customerId: b.id, status: "declined", sentAt: ago(6), respondedAt: ago(5), subtotal: 300, tax: 0, total: 300 } });

    // Never responded: open, no contact at all.
    const ignored = await createJob({ customerId: a.id, issue: "Nobody called back", source: "web_form", urgent: true, createdAt: ago(2) });

    // A customer who typed a spreadsheet formula as their business name.
    const evil = await createCustomer({ businessName: "=HYPERLINK(\"http://evil\",\"click\")", phone: "+1 512 555 0003" });
    await createJob({ customerId: evil.id, issue: "Reach-in warm", source: "referral", createdAt: ago(1) });
    return { tech, idle, a, b, won, open, lost, ignored, evil };
  }

  it("counts pipeline, sources, win rate, revenue and per-tech work", async () => {
    const f = await fixture();
    const r = await buildReports(parseRange(null, null));

    expect(r.totals.newLeads).toBe(5);
    expect(r.totals.completed).toBe(1);
    expect(r.totals.revenue).toBe(1000);

    const waiting = r.pipelineByStage.find((s) => s.stage === "waiting_on_yes")!;
    expect(waiting.count).toBe(1);
    expect(waiting.value).toBe(500);
    expect(r.pipelineByStage.some((s) => s.stage === "done" || s.stage === "lost")).toBe(false); // pipeline = open work only

    expect(Object.fromEntries(r.leadsBySource.map((s) => [s.source, s.count]))).toEqual({ email: 1, sms: 2, web_form: 1, referral: 1 });

    // 1 accepted vs 1 declined → 50%; the still-open quote doesn't count either way.
    expect(r.quotes.sent).toBe(3);
    expect(r.quotes.open).toBe(1);
    expect(r.quotes.winRate).toBe(0.5);
    expect(r.quotes.acceptedValue).toBe(1000);

    const marcus = r.jobsPerTech.find((t) => t.techId === f.tech.id)!;
    expect(marcus.done).toBe(1);
    expect(marcus.revenue).toBe(1000);
    const dev = r.jobsPerTech.find((t) => t.techId === f.idle.id)!;
    expect(dev).toMatchObject({ done: 0, scheduled: 0, revenue: 0 }); // idle techs still appear

    expect(r.revenueByWeek.reduce((s, w) => s + w.revenue, 0)).toBe(1000);
    expect(r.revenueByMonth.reduce((s, m) => s + m.revenue, 0)).toBe(1000);
  });

  it("lists exactly the open leads nobody has responded to", async () => {
    const f = await fixture();
    const r = await buildReports(parseRange(null, null));
    // Both the web-form lead and the referral were never contacted; oldest first.
    expect(r.neverResponded.map((j) => j.id)).toContain(f.ignored.id);
    expect(r.neverResponded.every((j) => j.stage !== "done" && j.stage !== "lost")).toBe(true);
    expect(r.neverResponded[0].id).toBe(f.ignored.id); // oldest waiting is first
    expect(r.neverResponded.find((j) => j.id === f.ignored.id)!.urgent).toBe(true);
  });

  it("measures first response only for leads that got one", async () => {
    await fixture();
    const r = await buildReports(parseRange(null, null));
    expect(r.firstResponse.measured).toBeGreaterThan(0);
    expect(r.firstResponse.avgHours).toBeGreaterThan(0);
    expect(r.firstResponse.medianHours).toBeGreaterThan(0);
  });

  it("a range with nothing in it returns zeros, not NaN or a crash", async () => {
    await fixture();
    const r = await buildReports(parseRange("2020-01-01", "2020-01-31"));
    expect(r.totals).toEqual({ newLeads: 0, completed: 0, revenue: 0, lost: 0 });
    expect(r.quotes.winRate).toBeNull();
    expect(r.firstResponse.avgHours).toBeNull();
    expect(r.revenueByWeek).toEqual([]);
    expect(r.neverResponded).toEqual([]);
    expect(r.leadsBySource).toEqual([]);
  });

  it("the CSV export has a row per job in range with the fields the bookkeeper needs", async () => {
    await fixture();
    const csv = await jobsCsv(parseRange(null, null));
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toContain("Created,Business,Contact,Phone");
    expect(lines).toHaveLength(6); // header + 5 jobs
    expect(csv).toContain("Alpha Diner");
    expect(csv).toContain("1000.00");
    // Customer-typed formulas and +numbers are neutralised before the bookkeeper opens this.
    expect(csv).toContain("\"'=HYPERLINK(");
    expect(csv).toContain("'+1 512 555 0003");
    expect(csv).not.toMatch(/(^|,)=HYPERLINK/m);
  });
});

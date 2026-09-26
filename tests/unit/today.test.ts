import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { buildCallList, kpis, loadTodayJobs } from "@/lib/services/today";
import { createCustomer } from "@/lib/services/customers";
import { createJob } from "@/lib/services/jobs";
import { recordInboundCall } from "@/lib/services/calls";
import { resetDb } from "./db-helpers";

/**
 * The rules are unit-tested in callToday.test.ts; this is the wiring: real rows out of the
 * database, in the right order, with the KPIs that sit above them.
 */
const day = 86_400_000;
const ago = (d: number, h = 10) => {
  const x = new Date(Date.now() - d * day);
  x.setHours(h, 0, 0, 0);
  return x;
};

describe("Today, built from the database", () => {
  beforeEach(resetDb);

  it("orders the morning list and leaves healthy jobs off it", async () => {
    const c = await createCustomer({ businessName: "Rosa's Taqueria", phone: "(512) 555-0199" });
    const down = await createJob({ customerId: c.id, issue: "Freezer down", equipmentType: "walk-in freezer", source: "call", urgent: true, createdAt: ago(3) });
    const fresh = await createJob({ customerId: c.id, issue: "New request", source: "web_form", createdAt: ago(1) });
    const quiet = await createJob({ customerId: c.id, issue: "Quote out", source: "email", stage: "waiting_on_yes", createdAt: ago(9), lastContactAt: ago(4) });
    const healthy = await createJob({ customerId: c.id, issue: "Quoted yesterday", source: "email", stage: "waiting_on_yes", createdAt: ago(2), lastContactAt: ago(1) });
    const done = await createJob({ customerId: c.id, issue: "Finished", source: "call", stage: "done", createdAt: ago(20), lastContactAt: ago(20) });

    const list = await buildCallList();
    const ids = list.map((i) => i.job.id);
    expect(ids[0]).toBe(down.id); // urgent + equipment down always first
    expect(list[0].critical).toBe(true);
    expect(ids).toContain(fresh.id);
    expect(ids).toContain(quiet.id);
    expect(ids).not.toContain(healthy.id); // ball is in the customer's court
    expect(ids).not.toContain(done.id);
  });

  it("an unreturned missed call rides along with the job and outranks a plain new request", async () => {
    const c = await createCustomer({ businessName: "Big Sky Grocery", phone: "(512) 555-0134" });
    await createJob({ customerId: c.id, issue: "Plain new request", source: "web_form", createdAt: ago(1) });
    const r = await recordInboundCall({ number: "(512) 555-0777", status: "missed" }); // new caller → its own lead
    const list = await buildCallList();
    const missed = list.find((i) => i.job.id === r.jobId);
    expect(missed).toBeTruthy();
    expect(["missed-call", "new-request"]).toContain(missed!.rule);
    const joined = await loadTodayJobs();
    expect(joined.find((j) => j.id === r.jobId)?.missedCallAt).not.toBeNull();
  });

  it("carries the latest quote onto the row so the reminder button has something to send", async () => {
    const c = await createCustomer({ businessName: "Sushi Zen", phone: "(512) 555-0195" });
    const job = await createJob({ customerId: c.id, issue: "Case warm", source: "call", stage: "waiting_on_yes", createdAt: ago(8), lastContactAt: ago(5) });
    await db.quote.create({ data: { jobId: job.id, customerId: c.id, status: "sent", sentAt: ago(5), subtotal: 477, tax: 0, total: 477 } });
    const row = (await buildCallList()).find((i) => i.job.id === job.id)!;
    expect(row.rule).toBe("follow-up-quote");
    expect(row.job.quoteTotal).toBe(477);
    expect(row.job.quoteId).toBeTruthy();
  });

  it("KPIs agree with the list and the board", async () => {
    const c = await createCustomer({ businessName: "Metro Cold Storage", phone: "(512) 555-0120" });
    const openA = await createJob({ customerId: c.id, issue: "A", source: "call", createdAt: ago(3) });
    const openB = await createJob({ customerId: c.id, issue: "B", source: "call", stage: "waiting_on_yes", createdAt: ago(6), lastContactAt: ago(5) });
    await db.quote.create({ data: { jobId: openB.id, customerId: c.id, status: "sent", sentAt: ago(5), subtotal: 800, tax: 0, total: 800 } });
    const doneJob = await createJob({ customerId: c.id, issue: "C", source: "call", stage: "done", createdAt: ago(4), lastContactAt: ago(1) });
    await db.job.update({ where: { id: doneJob.id }, data: { completedAt: new Date() } });

    const k = await kpis();
    const list = await buildCallList();
    expect(k.openJobs).toBe(2);
    expect(k.waitingOnYesTotal).toBe(800);
    expect(k.callsToday).toBe(list.length);
    expect(k.doneThisWeek).toBe(1);
    // Only the job nobody has ever contacted counts; B was contacted (5 days ago), so it's
    // "gone quiet" on the list but not a never-answered lead.
    expect(k.noResponse24h).toBe(1);
    expect(list.some((i) => i.job.id === openA.id)).toBe(true);
  });

  it("an empty database gives an empty list and zeroed KPIs, not a crash", async () => {
    expect(await buildCallList()).toEqual([]);
    expect(await kpis()).toEqual({ openJobs: 0, waitingOnYesTotal: 0, callsToday: 0, doneThisWeek: 0, noResponse24h: 0 });
  });
});

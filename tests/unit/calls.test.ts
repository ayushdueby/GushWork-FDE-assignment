import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { applyCall, attachTranscript, endCall, lookupByDigits, playSampleCall, recentCalls, recordInboundCall, startCall } from "@/lib/services/calls";
import { createCustomer } from "@/lib/services/customers";
import { createJob, setStage } from "@/lib/services/jobs";
import { setSetting } from "@/lib/services/settings";
import { resetDb } from "./db-helpers";

/** GROQ_MOCK=1 → every extraction runs the deterministic keyword path. */
describe("missed calls become leads", () => {
  beforeEach(resetDb);

  it("an unknown number creates a customer, a needs_quote lead and a notification", async () => {
    const r = await recordInboundCall({ number: "(512) 555-0842", status: "missed", actor: "Denise" });
    expect(r.createdCustomer).toBe(true);
    expect(r.created).toBe(true);
    const job = await db.job.findUnique({ where: { id: r.jobId! }, include: { customer: true } });
    expect(job?.stage).toBe("needs_quote");
    expect(job?.source).toBe("call");
    expect(job?.lastContactAt).toBeNull(); // they called us; we still owe them a call back
    expect(job?.customer.phoneDigits).toBe("5125550842");
    expect(r.call.status).toBe("missed");
    expect(await db.notification.count()).toBe(1);
    expect((await db.activity.findMany({ where: { jobId: job!.id }, orderBy: { at: "asc" } })).some((a) => a.type === "missed_call")).toBe(true);
  });

  it("a known caller with an open job gets flagged on that job, not a second one", async () => {
    const c = await createCustomer({ businessName: "Rosa's Taqueria", phone: "512-555-0199" });
    const existing = await createJob({ customerId: c.id, issue: "Freezer down", equipmentType: "walk-in freezer", source: "call" });
    const r = await recordInboundCall({ number: "(512) 555-0199", status: "missed" });
    expect(r.createdCustomer).toBeFalsy();
    expect(r.created).toBe(false);
    expect(r.jobId).toBe(existing.id);
    expect(await db.job.count()).toBe(1);
  });

  it("a voicemail transcript becomes the issue on the new job", async () => {
    const r = await recordInboundCall({ number: "(512) 555-0777", status: "missed", transcript: "Hi it's Sam, our ice machine quit overnight, please call back." });
    const job = await db.job.findUnique({ where: { id: r.jobId! } });
    expect(job?.issue).toContain("ice machine quit");
    expect(r.call.summary).toBe("Voicemail left");
  });

  it("the same provider call id twice does not create a second lead", async () => {
    const first = await recordInboundCall({ number: "(512) 555-0888", status: "missed", externalId: "CA123" });
    const second = await recordInboundCall({ number: "(512) 555-0888", status: "missed", externalId: "CA123" });
    expect(second.duplicate).toBe(true);
    expect(second.call.id).toBe(first.call.id);
    expect(await db.call.count()).toBe(1);
    expect(await db.job.count()).toBe(1);
  });
});

describe("outbound call lifecycle", () => {
  let customerId: string;
  let jobId: string;

  beforeEach(async () => {
    await resetDb();
    const c = await createCustomer({ businessName: "Harbor Seafood", phone: "(512) 555-0102", primaryContact: "Jake" });
    customerId = c.id;
    jobId = (await createJob({ customerId, issue: "Gaskets shot", equipmentType: "reach-in", source: "call" })).id;
  });

  it("dialling a known number links the call to the customer's open job on its own", async () => {
    const call = await startCall({ number: "512.555.0102", direction: "outbound", actor: "Denise" });
    expect(call.customerId).toBe(customerId);
    expect(call.jobId).toBe(jobId);
    expect(call.status).toBe("in_progress");
  });

  it("an answered call counts as contact; a no-answer is logged but still counts as an attempt", async () => {
    const answered = await startCall({ number: "(512) 555-0102", direction: "outbound", actor: "Denise" });
    await endCall(answered.id, { durationSec: 240, actor: "Denise" });
    const job = await db.job.findUnique({ where: { id: jobId } });
    expect(job?.lastContactAt).not.toBeNull();
    const texts = (await db.activity.findMany({ where: { jobId, type: { in: ["call", "contact"] } }, orderBy: { at: "asc" } })).map((a) => a.text);
    expect(texts.some((t) => t.includes("4 min"))).toBe(true);

    const missed = await startCall({ number: "(512) 555-0102", direction: "outbound", actor: "Denise" });
    await endCall(missed.id, { durationSec: 0, actor: "Denise" });
    expect((await db.call.findUnique({ where: { id: missed.id } }))?.status).toBe("missed");
    expect((await db.activity.findMany({ where: { jobId, type: "call" } })).some((a) => a.text.includes("no answer"))).toBe(true);
  });

  it("a transcript produces a summary, a diff, and nothing is applied until asked", async () => {
    const call = await startCall({ number: "(512) 555-0102", direction: "outbound", actor: "Denise" });
    await endCall(call.id, { durationSec: 180, actor: "Denise" });
    const r = await attachTranscript(call.id, "Jake says the reach-in freezer is down and product is thawing. Quoted him around six hundred dollars.", { actor: "Denise" });
    expect(r.ok).toBe(true);
    expect(r.extraction.quoteAmount).toBe(600);
    expect(r.changes.map((c) => c.field)).toContain("quote");
    expect(r.applied).toBeNull(); // nothing applied while auto-apply is off
    const job = await db.job.findUnique({ where: { id: jobId } });
    expect(job?.urgent).toBe(false); // proposed, not applied
    expect(await db.quote.count()).toBe(0);
  });

  it("applying writes the job, drafts the quote, and is idempotent on a second click", async () => {
    const call = await startCall({ number: "(512) 555-0102", direction: "outbound", actor: "Denise" });
    await endCall(call.id, { durationSec: 180, actor: "Denise" });
    const r = await attachTranscript(call.id, "The reach-in freezer is down, product thawing. Quoted around six hundred dollars.", { actor: "Denise" });
    const fields = r.changes.map((c) => c.field);
    const first = await applyCall(call.id, { fields, actor: "Denise" });
    expect(first.applied.length).toBeGreaterThan(0);
    const job = await db.job.findUnique({ where: { id: jobId } });
    expect(job?.urgent).toBe(true);
    expect(job?.lastContactAt).not.toBeNull();
    const quotes = await db.quote.findMany();
    expect(quotes).toHaveLength(1);
    expect(quotes[0].total).toBe(600);
    expect(quotes[0].status).toBe("draft");

    // Second apply: the diff is recomputed against the *current* job, so nothing doubles up.
    const second = await applyCall(call.id, { fields, actor: "Denise" });
    expect(second.applied).toEqual([]);
    expect(await db.quote.count()).toBe(1);
    expect((await db.call.findUnique({ where: { id: call.id } }))?.applied).toBe(true);
  });

  it("only the ticked fields are applied", async () => {
    const call = await startCall({ number: "(512) 555-0102", direction: "outbound", actor: "Denise" });
    await endCall(call.id, { durationSec: 120, actor: "Denise" });
    const r = await attachTranscript(call.id, "Freezer is down and thawing, quoted around six hundred dollars.", { actor: "Denise" });
    expect(r.changes.map((c) => c.field)).toEqual(expect.arrayContaining(["urgent", "quote"]));
    await applyCall(call.id, { fields: ["urgent"], actor: "Denise" }); // deliberately skip the quote
    expect((await db.job.findUnique({ where: { id: jobId } }))?.urgent).toBe(true);
    expect(await db.quote.count()).toBe(0);
  });

  it("a stale review cannot undo newer work: the diff is recomputed at apply time", async () => {
    const call = await startCall({ number: "(512) 555-0102", direction: "outbound", actor: "Denise" });
    await endCall(call.id, { durationSec: 120, actor: "Denise" });
    const r = await attachTranscript(call.id, "Freezer down and thawing, quoted around six hundred dollars.", { actor: "Denise" });
    // Meanwhile the job moves on and someone already flagged it urgent.
    await db.job.update({ where: { id: jobId }, data: { urgent: true } });
    await setStage(jobId, "lost", { lostReason: "Customer cancelled" });
    const applied = await applyCall(call.id, { fields: r.changes.map((c) => c.field), actor: "Denise" });
    expect(applied.applied.some((c) => c.field === "stage")).toBe(false);
    expect((await db.job.findUnique({ where: { id: jobId } }))?.stage).toBe("lost");
  });

  it("auto-apply skips the review step when the owner turns it on", async () => {
    await setSetting("autoApplyCalls", true);
    const call = await startCall({ number: "(512) 555-0102", direction: "outbound", actor: "Denise" });
    await endCall(call.id, { durationSec: 120, actor: "Denise" });
    const r = await attachTranscript(call.id, "Freezer down and thawing, quoted around six hundred dollars.", { actor: "Denise" });
    expect(r.applied).not.toBeNull();
    expect((await db.job.findUnique({ where: { id: jobId } }))?.urgent).toBe(true);
    expect((await db.call.findUnique({ where: { id: call.id } }))?.applied).toBe(true);
  });

  it("refuses to apply a call that isn't linked to a job", async () => {
    const call = await startCall({ number: "(212) 555-0000", direction: "outbound", actor: "Denise" });
    await endCall(call.id, { durationSec: 60, actor: "Denise" });
    await attachTranscript(call.id, "Wrong number, sorry.", { actor: "Denise" });
    await expect(applyCall(call.id, { fields: ["urgent"], actor: "Denise" })).rejects.toThrow(/link this call to a job/i);
  });
});

describe("sample calls and lookups", () => {
  beforeEach(async () => {
    await resetDb();
    const c = await createCustomer({ businessName: "Pho 88", phone: "(512) 555-0162", primaryContact: "Linh" });
    await createJob({ customerId: c.id, issue: "Door won't seal", equipmentType: "walk-in cooler", source: "call", stage: "approved" });
  });

  it("a scripted call runs the whole path and lands on a real job", async () => {
    const r = await playSampleCall("pick-a-date", { actor: "Denise" });
    expect(r.ok).toBe(true);
    expect(r.jobId).toBeTruthy();
    expect(r.transcript).toContain("Tuesday");
    expect(r.changes.some((c) => c.field === "scheduledFor" || c.field === "note")).toBe(true);
    expect((await db.call.findUnique({ where: { id: r.callId } }))?.status).toBe("completed");
  });

  it("rejects an unknown sample key", async () => {
    await expect(playSampleCall("nope", { actor: "Denise" })).rejects.toThrow(/unknown sample/i);
  });

  it("contact lookup matches partial digits and ignores too-short input", async () => {
    expect(await lookupByDigits("55")).toEqual([]);
    const hits = await lookupByDigits("5550162");
    expect(hits[0]?.businessName).toBe("Pho 88");
    expect(hits[0]?.jobs[0]?.stage).toBe("approved");
    expect(await lookupByDigits("9998887")).toEqual([]);
  });

  it("recent calls come back newest first", async () => {
    await recordInboundCall({ number: "(512) 555-0001", status: "missed" });
    await recordInboundCall({ number: "(512) 555-0002", status: "missed" });
    const recent = await recentCalls(5);
    expect(recent.length).toBeGreaterThanOrEqual(2);
    expect(recent[0].startedAt.getTime()).toBeGreaterThanOrEqual(recent[1].startedAt.getTime());
  });
});

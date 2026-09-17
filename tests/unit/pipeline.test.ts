import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { ingestMessage, messageFingerprint, reviewMessage } from "@/lib/pipeline/ingest";
import { fallbackExtractMessage } from "@/lib/ai/extract-message";
import { createCustomer } from "@/lib/services/customers";
import { createJob } from "@/lib/services/jobs";
import { resetDb } from "./db-helpers";

describe("ingestion pipeline (GROQ_MOCK → deterministic extraction)", () => {
  beforeEach(resetDb);

  it("a new urgent request creates a customer and an urgent needs_quote job, flagged for review", async () => {
    const r = await ingestMessage({ channel: "email", from: "Maria Santos <maria@santostaqueria.com>", subject: "Freezer down", body: "Our walk-in freezer at Santos Taqueria is down since last night, food is thawing. Please call 512-555-0231. Maria Santos" });
    expect(r.duplicate).toBe(false);
    expect(r.created).toEqual({ customer: true, job: true });
    expect(r.status).toBe("needs_review");
    const job = await db.job.findUnique({ where: { id: r.jobId! }, include: { customer: true } });
    expect(job?.stage).toBe("needs_quote");
    expect(job?.urgent).toBe(true);
    expect(job?.equipmentType).toBe("walk-in freezer");
    expect(job?.source).toBe("email");
    expect(job?.customer.phoneDigits).toBe("5125550231");
    expect(job?.customer.email).toBe("maria@santostaqueria.com");
    const acts = await db.activity.findMany({ where: { jobId: job!.id } });
    expect(acts.some((a) => a.type === "message_in")).toBe(true);
  });

  it("the same message twice creates nothing new (provider id or content fingerprint)", async () => {
    const msg = { channel: "sms" as const, from: "(512) 555-0288", body: "ice machine died, call me 512-555-0288" };
    const a = await ingestMessage({ ...msg, externalId: "SM123" });
    const b = await ingestMessage({ ...msg, externalId: "SM123" });
    expect(b.duplicate).toBe(true);
    expect(b.messageId).toBe(a.messageId);
    const c = await ingestMessage(msg); // no provider id → fingerprint
    const d = await ingestMessage(msg);
    expect(d.duplicate).toBe(true);
    expect(d.messageId).toBe(c.messageId);
    // Same number, same complaint within a week → one customer, one job, two stored messages.
    expect(await db.customer.count()).toBe(1);
    expect(await db.job.count()).toBe(1);
    expect(await db.message.count()).toBe(2);
    expect(messageFingerprint(msg)).toBe(messageFingerprint({ ...msg, body: msg.body + "  " }));
  });

  it("matches an existing customer by phone and attaches to their open job instead of duplicating", async () => {
    const c = await createCustomer({ businessName: "Northside Diner", phone: "(512) 555-0111", primaryContact: "Gus" });
    const job = await createJob({ customerId: c.id, issue: "Ice machine leaking", equipmentType: "ice machine", source: "call" });
    const r = await ingestMessage({ channel: "sms", from: "512-555-0111", body: "Gus here, the ice machine is still leaking, any update?" });
    expect(r.created.customer).toBe(false);
    expect(r.customerId).toBe(c.id);
    expect(r.jobId).toBe(job.id);
    expect(r.applied).toBe("attached");
    expect(await db.job.count()).toBe(1);
    expect(r.status).toBe("accepted");
  });

  it("\"yes go ahead\" from a quoted customer moves the job to approved and accepts the quote", async () => {
    const c = await createCustomer({ businessName: "Big Sky Grocery", phone: "(512) 555-0134", email: "tom@bigskygrocery.com" });
    const job = await createJob({ customerId: c.id, issue: "Walk-in warm", equipmentType: "walk-in cooler", source: "email", stage: "waiting_on_yes" });
    await db.quote.create({ data: { jobId: job.id, customerId: c.id, status: "sent", sentAt: new Date(), subtotal: 100, tax: 0, total: 100 } });
    const r = await ingestMessage({ channel: "email", from: "tom@bigskygrocery.com", subject: "Re: quote", body: "Looked over the quote, that's fine. Go ahead and schedule it." });
    expect(r.applied).toBe("approved");
    expect((await db.job.findUnique({ where: { id: job.id } }))?.stage).toBe("approved");
    expect((await db.quote.findFirst({ where: { jobId: job.id } }))?.status).toBe("accepted");
    expect(await db.notification.count()).toBe(1);
  });

  it("a decline marks the job lost with the reason", async () => {
    const c = await createCustomer({ businessName: "Sushi Zen", phone: "(512) 555-0195" });
    const job = await createJob({ customerId: c.id, issue: "Case warm", equipmentType: "reach-in", source: "call", stage: "waiting_on_yes" });
    const r = await ingestMessage({ channel: "sms", from: "(512) 555-0195", body: "Thanks for the quote but we're going to pass, too expensive right now." });
    expect(r.applied).toBe("lost");
    const j = await db.job.findUnique({ where: { id: job.id } });
    expect(j?.stage).toBe("lost");
    expect(j?.lostReason).toMatch(/declined/i);
  });

  it("spam is filed as not_a_lead with no customer or job", async () => {
    const r = await ingestMessage({ channel: "email", from: "growth@rankfast-seo.example", subject: "Rank #1 on Google", body: "Our SEO experts guarantee page one. Unsubscribe here." });
    expect(r.status).toBe("not_a_lead");
    expect(await db.customer.count()).toBe(0);
    expect(await db.job.count()).toBe(0);
  });

  it("review: 'not a lead' removes the auto-created job; edits update customer and job", async () => {
    const r = await ingestMessage({ channel: "sms", from: "(512) 555-0777", body: "hey is this the fridge repair people? our beer cooler at the taproom is warm" });
    expect(r.jobId).not.toBeNull();
    await reviewMessage(r.messageId, { decision: "accept", actor: "Denise", edits: { business: "Taproom 512", name: "Sam", urgent: true } });
    const job = await db.job.findUnique({ where: { id: r.jobId! }, include: { customer: true } });
    expect(job?.customer.businessName).toBe("Taproom 512");
    expect(job?.customer.primaryContact).toBe("Sam");
    expect(job?.urgent).toBe(true);
    expect((await db.message.findUnique({ where: { id: r.messageId } }))?.status).toBe("accepted");

    const spamish = await ingestMessage({ channel: "sms", from: "(512) 555-0999", body: "walk-in cooler quote please" });
    await reviewMessage(spamish.messageId, { decision: "not_a_lead", actor: "Denise" });
    expect(await db.job.findUnique({ where: { id: spamish.jobId! } })).toBeNull();
    expect((await db.message.findUnique({ where: { id: spamish.messageId } }))?.status).toBe("not_a_lead");
  });

  it("fallback extraction classifies intent from plain words", () => {
    expect(fallbackExtractMessage({ channel: "sms", body: "yes go ahead with the quote" }).intent).toBe("quote_reply_accept");
    expect(fallbackExtractMessage({ channel: "sms", body: "we'll pass, went with someone else" }).intent).toBe("quote_reply_decline");
    expect(fallbackExtractMessage({ channel: "sms", body: "Tuesday morning at 9 works" }).intent).toBe("scheduling");
    expect(fallbackExtractMessage({ channel: "sms", body: "walk-in freezer is down!! 512-555-0100" }).intent).toBe("new_request");
    expect(fallbackExtractMessage({ channel: "email", body: "Guaranteed #1 on Google, free audit, unsubscribe" }).isLead).toBe(false);
  });
});

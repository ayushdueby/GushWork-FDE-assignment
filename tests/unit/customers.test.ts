import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addEquipment, addSite, createCustomer, customerLabel, enrichCustomer, findMatchingCustomer, getCustomerDetail, searchCustomers, updateCustomer } from "@/lib/services/customers";
import { createJob } from "@/lib/services/jobs";
import { ingestMessage } from "@/lib/pipeline/ingest";
import { resetDb } from "./db-helpers";

describe("customer records", () => {
  beforeEach(resetDb);

  it("stores a matching key for the phone however it was typed, and lower-cases the email", async () => {
    const c = await createCustomer({ businessName: "Rosa's Taqueria", phone: "(512) 555-0199", email: "Rosa@RosasTaqueria.com", address: "1418 E 6th St", siteName: "Main" });
    expect(c.phoneDigits).toBe("5125550199");
    expect(c.email).toBe("rosa@rosastaqueria.com");
    expect(c.sites[0]?.address).toBe("1418 E 6th St");
    expect(await findMatchingCustomer({ phone: "512.555.0199" })).toMatchObject({ by: "phone" });
    expect(await findMatchingCustomer({ email: "ROSA@rosastaqueria.com" })).toMatchObject({ by: "email" });
  });

  it("falls back to the contact name when no business name was given", async () => {
    const c = await createCustomer({ businessName: "", primaryContact: "Marco Diaz", phone: "512-555-0123" });
    expect(c.businessName).toBe("Marco Diaz");
    expect(customerLabel(c)).toBe("Marco Diaz · Marco Diaz");
  });

  it("enrichment fills blanks but never overwrites what Denise already typed", async () => {
    const c = await createCustomer({ businessName: "Big Sky Grocery", primaryContact: "Tom Reyes", phone: "(512) 555-0134" });
    await enrichCustomer(c.id, { primaryContact: "Thomas R", phone: "(999) 999-9999", email: "tom@bigsky.com", address: "9001 N Lamar" });
    const after = await db.customer.findUnique({ where: { id: c.id }, include: { sites: true } });
    expect(after?.primaryContact).toBe("Tom Reyes"); // kept
    expect(after?.phone).toBe("(512) 555-0134"); // kept
    expect(after?.email).toBe("tom@bigsky.com"); // filled
    expect(after?.sites[0]?.address).toBe("9001 N Lamar"); // first site created
  });

  it("enrichment does not invent a second site when one already exists", async () => {
    const c = await createCustomer({ businessName: "Metro Cold Storage", address: "4500 Industrial Terrace", siteName: "Warehouse A" });
    await enrichCustomer(c.id, { address: "Somewhere else" });
    expect(await db.site.count({ where: { customerId: c.id } })).toBe(1);
  });

  it("editing keeps the matching key in sync and logs the change", async () => {
    const c = await createCustomer({ businessName: "Pho 88", phone: "(512) 555-0162" });
    await updateCustomer(c.id, { businessName: "Pho 88 Research", phone: "512-555-9999", email: "New@Pho88.com" }, "Denise");
    const after = await db.customer.findUnique({ where: { id: c.id } });
    expect(after?.businessName).toBe("Pho 88 Research");
    expect(after?.phoneDigits).toBe("5125559999");
    expect(after?.email).toBe("new@pho88.com");
    expect(await findMatchingCustomer({ phone: "(512) 555-0162" })).toBeNull(); // old number no longer matches
    expect((await db.activity.findMany({ where: { customerId: c.id } })).some((a) => a.text.includes("updated"))).toBe(true);
  });

  it("clearing the phone clears the matching key rather than leaving a stale one", async () => {
    const c = await createCustomer({ businessName: "Joe's Pizza", phone: "(512) 555-0147" });
    await updateCustomer(c.id, { businessName: "Joe's Pizza", phone: "" }, "Denise");
    const after = await db.customer.findUnique({ where: { id: c.id } });
    expect(after?.phone).toBeNull();
    expect(after?.phoneDigits).toBeNull();
    expect(await findMatchingCustomer({ phone: "(512) 555-0147" })).toBeNull();
  });

  it("search finds people by business, contact, partial phone and site address", async () => {
    const rosa = await createCustomer({ businessName: "Rosa's Taqueria", primaryContact: "Rosa Delgado", phone: "(512) 555-0199", address: "1418 E 6th St", siteName: "Main" });
    await createCustomer({ businessName: "Big Sky Grocery", primaryContact: "Tom Reyes", phone: "(512) 555-0134" });
    expect((await searchCustomers("Rosa")).map((c) => c.id)).toEqual([rosa.id]);
    expect((await searchCustomers("Delgado")).map((c) => c.id)).toEqual([rosa.id]);
    expect((await searchCustomers("555-0199")).map((c) => c.id)).toEqual([rosa.id]);
    expect((await searchCustomers("6th St")).map((c) => c.id)).toEqual([rosa.id]);
    expect((await searchCustomers("")).length).toBe(2);
    expect(await searchCustomers("nobody here")).toEqual([]);
  });

  it("search surfaces how much open work each customer has", async () => {
    const c = await createCustomer({ businessName: "Metro Cold Storage", phone: "(512) 555-0120" });
    await createJob({ customerId: c.id, issue: "A", source: "call", urgent: true });
    await createJob({ customerId: c.id, issue: "B", source: "call", stage: "done" });
    const row = (await searchCustomers("Metro"))[0];
    expect(row._count.jobs).toBe(2);
    expect(row.jobs).toHaveLength(1); // open only
    expect(row.jobs[0].urgent).toBe(true);
  });

  it("sites and equipment attach to the customer and land on the timeline", async () => {
    const c = await createCustomer({ businessName: "Big Sky Grocery" });
    const site = await addSite(c.id, { name: "Downtown", address: "300 W 2nd St" }, "Denise");
    await addEquipment(site.id, { type: "walk-in freezer", makeModel: "Kolpak KF7" }, "Denise");
    await expect(addEquipment("no-such-site", { type: "reach-in" })).rejects.toThrow(/not found/i);
    const detail = await getCustomerDetail(c.id);
    expect(detail?.sites[0].equipment[0]).toMatchObject({ type: "walk-in freezer", makeModel: "Kolpak KF7" });
    const texts = (detail?.activities ?? []).map((a) => a.text);
    expect(texts.some((t) => t.includes("Site added"))).toBe(true);
    expect(texts.some((t) => t.includes("Equipment added"))).toBe(true);
  });
});

describe("pipeline under concurrency", () => {
  beforeEach(resetDb);

  it("the same text arriving twice at once still yields one customer and one job", async () => {
    const msg = { channel: "sms" as const, from: "(512) 555-0303", body: "walk-in cooler is warm, can you come out? 512-555-0303", externalId: "SM-dup" };
    // Both calls can get past the "have I seen this id?" check; the unique index settles it,
    // and the loser must report a duplicate rather than throwing (Twilio would just retry).
    const [a, b] = await Promise.all([ingestMessage(msg), ingestMessage(msg)]);
    expect([a, b].filter((r) => r.duplicate)).toHaveLength(1);
    expect(a.messageId).toBe(b.messageId);
    expect(await db.message.count()).toBe(1);
    expect(await db.customer.count()).toBe(1);
    expect(await db.job.count()).toBe(1);
  });

  it("two different people texting at the same time get their own records", async () => {
    await Promise.all([
      ingestMessage({ channel: "sms", from: "(512) 555-0401", body: "ice machine down, 512-555-0401" }),
      ingestMessage({ channel: "sms", from: "(512) 555-0402", body: "reach-in warm, 512-555-0402" }),
    ]);
    expect(await db.customer.count()).toBe(2);
    expect(await db.job.count()).toBe(2);
  });
});

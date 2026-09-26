import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { buildDigest, sendDigest } from "@/lib/services/digest";
import { sendOutbound } from "@/lib/services/messaging";
import { createCustomer } from "@/lib/services/customers";
import { createJob } from "@/lib/services/jobs";
import { getSettings, setSetting } from "@/lib/services/settings";
import { adapterStatus } from "@/integrations";
import { verifyTwilioSignature } from "@/integrations/sms/twilio";
import { resetDb } from "./db-helpers";

const ago = (d: number) => new Date(Date.now() - d * 86_400_000);

describe("outbound messaging", () => {
  let customerId: string;
  let jobId: string;

  beforeEach(async () => {
    await resetDb();
    customerId = (await createCustomer({ businessName: "Lakeside Grill", phone: "(512) 555-0177", email: "priya@lakeside.com", primaryContact: "Priya" })).id;
    jobId = (await createJob({ customerId, issue: "Ice machine", equipmentType: "ice machine", source: "sms", createdAt: ago(3) })).id;
  });

  it("a simulated text is stored, timelined, counted as contact, and returns the exact preview", async () => {
    const r = await sendOutbound({ channel: "sms", to: "(512) 555-0177", text: "Hi Priya, checking in on the ice machine.", customerId, jobId, actor: "Denise" });
    expect(r.simulated).toBe(true);
    expect(r.result.ok).toBe(true);
    expect(r.result.preview).toContain("Hi Priya");

    const msg = await db.message.findUnique({ where: { id: r.message.id } });
    expect(msg).toMatchObject({ channel: "sms", direction: "outbound", status: "sent", jobId, customerId });
    expect(msg?.threadKey).toBe("5125550177"); // same key an inbound reply will land on

    const job = await db.job.findUnique({ where: { id: jobId } });
    expect(job?.lastContactAt).not.toBeNull();
    const types = (await db.activity.findMany({ where: { jobId } })).map((a) => a.type);
    expect(types).toContain("message_out");
    expect(types).toContain("contact");
  });

  it("contact: false sends without touching the follow-up clock", async () => {
    await sendOutbound({ channel: "email", to: "priya@lakeside.com", subject: "FYI", text: "No reply needed.", customerId, jobId, actor: "Denise", contact: false });
    expect((await db.job.findUnique({ where: { id: jobId } }))?.lastContactAt).toBeNull();
  });

  it("an email thread keys on the address so replies land on the same conversation", async () => {
    const r = await sendOutbound({ channel: "email", to: "Priya@Lakeside.com", subject: "Your quote", text: "Attached.", customerId, jobId, actor: "Denise" });
    expect((await db.message.findUnique({ where: { id: r.message.id } }))?.threadKey).toBe("priya@lakeside.com");
  });
});

describe("morning digest", () => {
  beforeEach(resetDb);

  it("reads like the list Denise would get at 7am, newest pain first", async () => {
    const c = await createCustomer({ businessName: "Rosa's Taqueria", phone: "(512) 555-0199", primaryContact: "Rosa" });
    await createJob({ customerId: c.id, issue: "Walk-in freezer down", equipmentType: "walk-in freezer", source: "call", urgent: true, createdAt: ago(3) });
    const d = await buildDigest();
    expect(d.count).toBe(1);
    expect(d.subject).toContain("Call list for");
    expect(d.text).toContain("Rosa's Taqueria");
    expect(d.text).toContain("(512) 555-0199");
    expect(d.text).toContain("Equipment down");
    expect(d.text).toMatch(/1 open jobs? · 1 to call today/);
  });

  it("says so plainly when nobody is waiting", async () => {
    const d = await buildDigest();
    expect(d.count).toBe(0);
    expect(d.text).toContain("Nobody waiting on you");
  });

  it("sending routes to the owner's own number/address and logs it without touching any job", async () => {
    await setSetting("ownerPhone", "(512) 555-0100");
    const c = await createCustomer({ businessName: "Big Sky Grocery", phone: "(512) 555-0134" });
    const job = await createJob({ customerId: c.id, issue: "Cooler warm", source: "email", createdAt: ago(2) });
    const r = await sendDigest("sms", "Denise");
    expect(r.ok).toBe(true);
    expect(r.to).toBe("(512) 555-0100");
    expect(r.simulated).toBe(true);
    expect(r.preview).toContain("Big Sky Grocery");
    // The digest is for Denise, not the customer: the job's clock must not move.
    expect((await db.job.findUnique({ where: { id: job.id } }))?.lastContactAt).toBeNull();
  });
});

describe("settings", () => {
  beforeEach(resetDb);

  it("falls back to defaults, then reads back what was saved, with the right types", async () => {
    const defaults = await getSettings();
    expect(defaults.ownerName).toBe("Denise");
    expect(defaults.autoApplyCalls).toBe(false);
    await setSetting("ownerName", "Denise C.");
    await setSetting("autoApplyCalls", true);
    await setSetting("taxRate", 6.25);
    const saved = await getSettings();
    expect(saved.ownerName).toBe("Denise C.");
    expect(saved.autoApplyCalls).toBe(true);
    expect(saved.taxRate).toBe(6.25);
    await setSetting("autoApplyCalls", false);
    expect((await getSettings()).autoApplyCalls).toBe(false);
  });
});

describe("adapter selection", () => {
  it("reports simulated adapters until the matching keys exist, and never leaks a key", () => {
    const status = adapterStatus();
    expect(status.email.kind).toBe("simulated");
    expect(status.sms.kind).toBe("simulated");
    expect(status.voice.kind).toBe("simulated");
    expect(status.database.kind).toBe("real");
    expect(status.recording.kind).toBe("real");
    expect(JSON.stringify(status)).not.toMatch(/gsk_|sk-|AC[0-9a-f]{20}/);
  });

  it("switches SMS and email to the real adapter when their env vars are set", async () => {
    const saved = { ...process.env };
    try {
      process.env.TWILIO_ACCOUNT_SID = "AC_test";
      process.env.TWILIO_AUTH_TOKEN = "tok_test";
      process.env.TWILIO_FROM_NUMBER = "+15125550100";
      process.env.GMAIL_CLIENT_ID = "cid";
      process.env.GMAIL_CLIENT_SECRET = "csec";
      process.env.GMAIL_REFRESH_TOKEN = "rtok";
      const status = adapterStatus();
      expect(status.sms).toEqual({ name: "Twilio SMS", kind: "real" });
      expect(status.voice).toEqual({ name: "Twilio Voice", kind: "real" });
      expect(status.email).toEqual({ name: "Gmail", kind: "real" });
    } finally {
      process.env = saved;
    }
  });

  it("an incomplete Twilio config stays simulated rather than half-working", () => {
    const saved = { ...process.env };
    try {
      process.env.TWILIO_ACCOUNT_SID = "AC_test";
      process.env.TWILIO_AUTH_TOKEN = "tok_test";
      delete process.env.TWILIO_FROM_NUMBER;
      expect(adapterStatus().sms.kind).toBe("simulated");
    } finally {
      process.env = saved;
    }
  });
});

describe("Twilio webhook signatures", () => {
  const url = "https://example.com/api/webhooks/twilio/sms";
  const params = { From: "+15125550199", Body: "freezer down", To: "+15125550100" };

  it("accepts a correct signature and rejects a forged or missing one", async () => {
    const saved = process.env.TWILIO_AUTH_TOKEN;
    try {
      process.env.TWILIO_AUTH_TOKEN = "secret-token";
      // Twilio's scheme: HMAC-SHA1 over the URL plus alphabetically sorted key+value pairs.
      const data = url + Object.keys(params).sort().map((k) => k + params[k as keyof typeof params]).join("");
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("secret-token"), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
      const good = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))).toString("base64");

      expect(await verifyTwilioSignature(url, params, good)).toBe(true);
      expect(await verifyTwilioSignature(url, params, "not-the-signature")).toBe(false);
      expect(await verifyTwilioSignature(url, params, null)).toBe(false);
      // Same signature, tampered body → rejected.
      expect(await verifyTwilioSignature(url, { ...params, Body: "something else" }, good)).toBe(false);
      // Same signature, different URL → rejected.
      expect(await verifyTwilioSignature("https://evil.example/api", params, good)).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.TWILIO_AUTH_TOKEN;
      else process.env.TWILIO_AUTH_TOKEN = saved;
    }
  });

  it("without a token configured it lets local simulation through", async () => {
    const saved = process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_AUTH_TOKEN;
    try {
      expect(await verifyTwilioSignature(url, params, null)).toBe(true);
    } finally {
      if (saved !== undefined) process.env.TWILIO_AUTH_TOKEN = saved;
    }
  });
});

import type { PrismaClient } from "@prisma/client";
import { phoneDigits, type Stage } from "@/lib/domain/types";
import { computeTotals } from "@/lib/quotes/totals";

/**
 * Demo data, always relative to "now" so the Today list demos well on any day.
 * Story anchor: Rosa's Taqueria called last Friday afternoon about a freezer that was down,
 * nobody called back — that's the $2,000 job from the discovery call.
 */

type Db = PrismaClient;

const DAY = 24 * 3600 * 1000;
function at(daysAgo: number, hour = 10, minute = 0, from = new Date()): Date {
  const d = new Date(from.getTime() - daysAgo * DAY);
  d.setHours(hour, minute, 0, 0);
  return d;
}
function lastFriday(from = new Date()): Date {
  const d = new Date(from);
  d.setHours(16, 12, 0, 0);
  const diff = (d.getDay() + 7 - 5) % 7 || 7; // 5 = Friday; today-is-Friday → last week
  d.setDate(d.getDate() - diff);
  return d;
}

export const TECHS = [
  { name: "Marcus Lee", phone: "(512) 555-0141", color: "#2563eb" },
  { name: "Jenna Ortiz", phone: "(512) 555-0142", color: "#059669" },
  { name: "Luis Romero", phone: "(512) 555-0143", color: "#d97706" },
  { name: "Dev Patel", phone: "(512) 555-0144", color: "#7c3aed" },
];

export const PRICE_LIST = [
  { description: "Diagnostic visit", kind: "labor", unitPrice: 125 },
  { description: "Labor (per hour)", kind: "labor", unitPrice: 110 },
  { description: "Emergency / after-hours labor (per hour)", kind: "labor", unitPrice: 165 },
  { description: "Refrigerant R-404A (per lb)", kind: "part", unitPrice: 38 },
  { description: "Compressor, 1.5 HP", kind: "part", unitPrice: 1180 },
  { description: "Condenser fan motor", kind: "part", unitPrice: 240 },
  { description: "Evaporator fan motor", kind: "part", unitPrice: 165 },
  { description: "Thermostat / temperature controller", kind: "part", unitPrice: 145 },
  { description: "Door gasket", kind: "part", unitPrice: 95 },
  { description: "Ice machine water pump", kind: "part", unitPrice: 210 },
  { description: "Coil cleaning", kind: "labor", unitPrice: 180 },
];

export async function clearAll(db: Db) {
  await db.$transaction([
    db.notification.deleteMany(),
    db.activity.deleteMany(),
    db.quoteItem.deleteMany(),
    db.quote.deleteMany(),
    db.call.deleteMany(),
    db.message.deleteMany(),
    db.job.deleteMany(),
    db.equipment.deleteMany(),
    db.site.deleteMany(),
    db.customer.deleteMany(),
    db.user.deleteMany(),
    db.tech.deleteMany(),
    db.priceListItem.deleteMany(),
    db.setting.deleteMany(),
  ]);
}

export async function seedIfEmpty(db: Db) {
  const n = await db.customer.count();
  if (n === 0) await seed(db);
}

export async function resetAndSeed(db: Db) {
  await clearAll(db);
  return seed(db);
}

export async function seed(db: Db, now = new Date()) {
  const techs = await Promise.all(TECHS.map((t) => db.tech.create({ data: t })));
  const [marcus, jenna, luis, dev] = techs;

  await db.user.createMany({
    data: [
      { name: "Denise Carter", role: "owner" },
      { name: "Ray Carter", role: "bookkeeper" },
      ...techs.map((t) => ({ name: t.name, role: "tech", techId: t.id })),
    ],
  });
  await db.priceListItem.createMany({ data: PRICE_LIST.map((p, i) => ({ ...p, sortOrder: i })) });
  await db.setting.createMany({ data: [{ key: "businessName", value: "Denise's Commercial Refrigeration" }, { key: "ownerName", value: "Denise" }] });

  const act = (o: { customerId: string; jobId?: string | null; type: string; text: string; at: Date; actor?: string }) =>
    db.activity.create({ data: { customerId: o.customerId, jobId: o.jobId ?? null, type: o.type, text: o.text, at: o.at, actor: o.actor ?? "Denise" } });

  async function customer(input: { businessName: string; type: string; primaryContact: string; phone: string; email?: string; notes?: string; sites: { name: string; address: string; equipment?: { type: string; makeModel?: string }[] }[]; createdAt: Date }) {
    const c = await db.customer.create({
      data: {
        businessName: input.businessName,
        type: input.type,
        primaryContact: input.primaryContact,
        phone: input.phone,
        phoneDigits: phoneDigits(input.phone),
        email: input.email?.toLowerCase() ?? null,
        notes: input.notes ?? "",
        createdAt: input.createdAt,
        sites: {
          create: input.sites.map((s) => ({ name: s.name, address: s.address, equipment: { create: (s.equipment ?? []).map((e) => ({ type: e.type, makeModel: e.makeModel ?? "" })) } })),
        },
      },
      include: { sites: { include: { equipment: true } } },
    });
    await act({ customerId: c.id, type: "system", text: `Customer created: ${c.businessName}`, at: input.createdAt });
    return c;
  }

  type Cust = Awaited<ReturnType<typeof customer>>;

  async function job(c: Cust, input: { siteIdx?: number; eqIdx?: number; equipmentType: string; source: string; issue: string; urgent?: boolean; stage: Stage; createdAt: Date; lastContactAt?: Date | null; scheduledFor?: Date | null; techId?: string | null; completedAt?: Date | null; lostReason?: string | null; completionNotes?: string }) {
    const site = c.sites[input.siteIdx ?? 0];
    const eq = site?.equipment[input.eqIdx ?? 0];
    const j = await db.job.create({
      data: {
        customerId: c.id,
        siteId: site?.id ?? null,
        equipmentId: eq?.id ?? null,
        equipmentType: input.equipmentType,
        source: input.source,
        issue: input.issue,
        urgent: !!input.urgent,
        stage: input.stage,
        createdAt: input.createdAt,
        lastContactAt: input.lastContactAt ?? null,
        scheduledFor: input.scheduledFor ?? null,
        scheduledEnd: input.scheduledFor ? new Date(input.scheduledFor.getTime() + 2 * 3600 * 1000) : null,
        techId: input.techId ?? null,
        completedAt: input.completedAt ?? null,
        lostReason: input.lostReason ?? null,
        completionNotes: input.completionNotes ?? "",
      },
    });
    await act({ customerId: c.id, jobId: j.id, type: "system", text: `Job created from ${input.source.replace("_", " ")}${input.urgent ? " — marked urgent" : ""}: ${input.issue.slice(0, 120)}`, at: input.createdAt, actor: "system" });
    return j;
  }

  async function quote(c: Cust, j: { id: string }, input: { items: { description: string; qty: number; unitPrice: number }[]; status: string; sentAt?: Date; respondedAt?: Date; comment?: string; notes?: string; reminderSentAt?: Date }) {
    const totals = computeTotals(input.items, 8.25);
    const q = await db.quote.create({
      data: {
        jobId: j.id,
        customerId: c.id,
        taxRate: 8.25,
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        notes: input.notes ?? "Parts and labor as listed. 30-day workmanship warranty.",
        status: input.status,
        sentAt: input.sentAt ?? null,
        respondedAt: input.respondedAt ?? null,
        customerComment: input.comment ?? null,
        reminderSentAt: input.reminderSentAt ?? null,
        items: { create: input.items.map((it, i) => ({ ...it, sortOrder: i })) },
      },
    });
    if (input.sentAt) await act({ customerId: c.id, jobId: j.id, type: "quote", text: `Quote sent — $${totals.total.toFixed(2)}`, at: input.sentAt });
    if (input.status === "accepted" && input.respondedAt) await act({ customerId: c.id, jobId: j.id, type: "quote", text: `Customer accepted the quote${input.comment ? ` — "${input.comment}"` : ""}`, at: input.respondedAt, actor: "customer" });
    if (input.status === "declined" && input.respondedAt) await act({ customerId: c.id, jobId: j.id, type: "quote", text: `Customer declined the quote${input.comment ? ` — "${input.comment}"` : ""}`, at: input.respondedAt, actor: "customer" });
    return q;
  }

  async function message(c: Cust | null, j: { id: string } | null, input: { channel: string; direction: string; from: string; to: string; subject?: string; body: string; at: Date; status?: string; extracted?: object; externalId?: string }) {
    const m = await db.message.create({
      data: {
        channel: input.channel,
        direction: input.direction,
        fromAddr: input.from,
        toAddr: input.to,
        subject: input.subject ?? null,
        body: input.body,
        raw: input.body,
        receivedAt: input.at,
        customerId: c?.id ?? null,
        jobId: j?.id ?? null,
        status: input.status ?? (input.direction === "outbound" ? "sent" : "accepted"),
        extractedJson: input.extracted ? JSON.stringify(input.extracted) : null,
        externalId: input.externalId ?? null,
        threadKey: input.channel === "sms" ? phoneDigits(input.direction === "inbound" ? input.from : input.to) : (input.direction === "inbound" ? input.from : input.to).toLowerCase(),
      },
    });
    if (c) await act({ customerId: c.id, jobId: j?.id, type: input.direction === "inbound" ? "message_in" : "message_out", text: `${input.direction === "inbound" ? "Received" : "Sent"} ${input.channel === "sms" ? "text" : input.channel === "email" ? "email" : "web form"}: ${input.body.slice(0, 120)}`, at: input.at, actor: input.direction === "inbound" ? "customer" : "Denise" });
    return m;
  }

  async function call(c: Cust | null, j: { id: string } | null, input: { direction: string; number: string; at: Date; durationSec: number; status: string; transcript?: string; summary?: string; extracted?: object; applied?: boolean }) {
    const k = await db.call.create({
      data: {
        direction: input.direction,
        number: input.number,
        numberDigits: phoneDigits(input.number),
        startedAt: input.at,
        endedAt: new Date(input.at.getTime() + input.durationSec * 1000),
        durationSec: input.durationSec,
        status: input.status,
        transcript: input.transcript ?? null,
        summary: input.summary ?? null,
        extractedJson: input.extracted ? JSON.stringify(input.extracted) : null,
        applied: !!input.applied,
        appliedAt: input.applied ? new Date(input.at.getTime() + input.durationSec * 1000 + 60_000) : null,
        customerId: c?.id ?? null,
        jobId: j?.id ?? null,
      },
    });
    if (c) {
      const text = input.status === "missed" ? `Missed call from ${input.number}` : `${input.direction === "inbound" ? "Inbound" : "Outbound"} call, ${Math.round(input.durationSec / 60)} min${input.summary ? ` — ${input.summary}` : ""}`;
      await act({ customerId: c.id, jobId: j?.id, type: input.status === "missed" ? "missed_call" : "call", text, at: input.at, actor: input.direction === "inbound" ? "customer" : "Denise" });
    }
    return k;
  }

  const contact = (c: Cust, j: { id: string }, text: string, when: Date) => act({ customerId: c.id, jobId: j.id, type: "contact", text, at: when });
  const stage = (c: Cust, j: { id: string }, label: string, when: Date, actor = "Denise") => act({ customerId: c.id, jobId: j.id, type: "stage", text: `Stage → ${label}`, at: when, actor });

  // ---------------------------------------------------------------------------------------------
  // 1. Rosa's Taqueria — the Friday freezer that never got a call back. Top of Today.
  // ---------------------------------------------------------------------------------------------
  const friday = lastFriday(now);
  const rosa = await customer({
    businessName: "Rosa's Taqueria",
    type: "restaurant",
    primaryContact: "Rosa Delgado",
    phone: "(512) 555-0199",
    email: "rosa@rosastaqueria.com",
    sites: [{ name: "Main location", address: "1418 E 6th St, Austin, TX 78702", equipment: [{ type: "walk-in freezer", makeModel: "Kolpak KF7-1010" }, { type: "reach-in", makeModel: "True T-49F" }] }],
    createdAt: at(400, 9, 0, now),
  });
  const rosaJob = await job(rosa, { equipmentType: "walk-in freezer", source: "call", issue: "Walk-in freezer stopped cooling Friday afternoon; product thawing. Needs someone out ASAP.", urgent: true, stage: "needs_quote", createdAt: friday, lastContactAt: null });
  await call(rosa, rosaJob, {
    direction: "inbound",
    number: "(512) 555-0199",
    at: friday,
    durationSec: 0,
    status: "missed",
    transcript: "Hi Denise, it's Rosa at Rosa's Taqueria. Our walk-in freezer went down about an hour ago, it's reading 28 and climbing and we've got a full weekend of product in there. Please call me back as soon as you can, 512-555-0199. Thanks.",
    summary: "Voicemail: walk-in freezer down, product at risk, wants a call back today.",
    extracted: { issue: "Walk-in freezer down, temperature climbing, product at risk", equipment: "walk-in freezer", urgency: "urgent", nextStep: "Call back and schedule an emergency visit" },
  });
  // A repeat customer: a done job from last quarter with an accepted quote.
  const rosaOld = await job(rosa, { eqIdx: 1, equipmentType: "reach-in", source: "repeat", issue: "Reach-in freezer door gasket torn, frost build-up.", stage: "done", createdAt: at(95, 11, 0, now), lastContactAt: at(90, 14, 0, now), scheduledFor: at(90, 9, 0, now), techId: luis.id, completedAt: at(90, 11, 30, now), completionNotes: "Replaced gasket, cleaned coil." });
  await quote(rosa, rosaOld, { items: [{ description: "Door gasket", qty: 1, unitPrice: 95 }, { description: "Labor (per hour)", qty: 1, unitPrice: 110 }], status: "accepted", sentAt: at(94, 12, 0, now), respondedAt: at(93, 9, 0, now) });
  await stage(rosa, rosaOld, "Done", at(90, 11, 30, now), "Luis Romero");

  // ---------------------------------------------------------------------------------------------
  // 2. Big Sky Grocery — two sites, quote out 4 days, no reply → follow up.
  // ---------------------------------------------------------------------------------------------
  const bigSky = await customer({
    businessName: "Big Sky Grocery",
    type: "grocery",
    primaryContact: "Tom Reyes",
    phone: "(512) 555-0134",
    email: "tom@bigskygrocery.com",
    sites: [
      { name: "Northside", address: "9001 N Lamar Blvd, Austin, TX 78753", equipment: [{ type: "walk-in cooler", makeModel: "Amerikooler 8x12" }, { type: "reach-in", makeModel: "Hussmann RL" }] },
      { name: "Downtown", address: "300 W 2nd St, Austin, TX 78701", equipment: [{ type: "walk-in freezer", makeModel: "Kolpak" }] },
    ],
    createdAt: at(300, 9, 0, now),
  });
  const bigSkyJob = await job(bigSky, { equipmentType: "walk-in cooler", source: "email", issue: "Northside walk-in cooler holding 45°F, compressor cycling constantly.", stage: "waiting_on_yes", createdAt: at(6, 8, 30, now), lastContactAt: at(4, 15, 10, now) });
  await message(bigSky, bigSkyJob, { channel: "email", direction: "inbound", from: "tom@bigskygrocery.com", to: "service@denisesrefrigeration.com", subject: "Walk-in at Northside running warm", body: "Hi Denise,\n\nOur Northside walk-in cooler is holding around 45 and the compressor never seems to shut off. Can you get someone out this week for a look and a quote?\n\nThanks,\nTom Reyes\nBig Sky Grocery\n512-555-0134", at: at(6, 8, 30, now), extracted: { name: "Tom Reyes", business: "Big Sky Grocery", phone: "512-555-0134", equipment: "walk-in cooler", issue: "Walk-in cooler holding 45°F, compressor cycling", urgency: "high", intent: "new_request" } });
  await call(bigSky, bigSkyJob, { direction: "outbound", number: "(512) 555-0134", at: at(5, 10, 20, now), durationSec: 312, status: "completed", transcript: "Denise: Hi Tom, Denise here, got your email about the Northside walk-in. Tom: Yeah it's been holding 45 since Monday. Denise: Sounds like a low charge or a fan motor. I'll have Marcus swing by tomorrow morning to look. Tom: Great. Denise: I'll send a quote after he's had eyes on it.", summary: "Diagnostic visit agreed for the next morning; quote to follow.", extracted: { issue: "Walk-in holding 45°F since Monday", equipment: "walk-in cooler", urgency: "high", nextStep: "Diagnostic visit tomorrow, then quote" }, applied: true });
  await contact(bigSky, bigSkyJob, "Called customer", at(5, 10, 20, now));
  await quote(bigSky, bigSkyJob, { items: [{ description: "Condenser fan motor", qty: 1, unitPrice: 240 }, { description: "Refrigerant R-404A (per lb)", qty: 6, unitPrice: 38 }, { description: "Labor (per hour)", qty: 3, unitPrice: 110 }, { description: "Coil cleaning", qty: 1, unitPrice: 180 }], status: "sent", sentAt: at(4, 15, 10, now) });
  await stage(bigSky, bigSkyJob, "Waiting on yes", at(4, 15, 10, now));
  const bigSkyOld = await job(bigSky, { siteIdx: 1, equipmentType: "walk-in freezer", source: "repeat", issue: "Downtown freezer evaporator icing over.", stage: "done", createdAt: at(40, 9, 0, now), lastContactAt: at(36, 9, 0, now), scheduledFor: at(36, 8, 0, now), techId: marcus.id, completedAt: at(36, 12, 0, now), completionNotes: "Defrost timer replaced." });
  await quote(bigSky, bigSkyOld, { items: [{ description: "Thermostat / temperature controller", qty: 1, unitPrice: 145 }, { description: "Labor (per hour)", qty: 2, unitPrice: 110 }], status: "accepted", sentAt: at(39, 10, 0, now), respondedAt: at(38, 16, 0, now) });
  await stage(bigSky, bigSkyOld, "Done", at(36, 12, 0, now), "Marcus Lee");

  // 3. Lakeside Grill — quote $640 out 3 days.
  const lakeside = await customer({ businessName: "Lakeside Grill", type: "restaurant", primaryContact: "Priya Nair", phone: "(512) 555-0177", email: "priya@lakesidegrill.com", sites: [{ name: "Main location", address: "2100 Lakeshore Blvd, Austin, TX 78741", equipment: [{ type: "ice machine", makeModel: "Hoshizaki KM-500" }] }], createdAt: at(220, 9, 0, now) });
  const lakesideJob = await job(lakeside, { equipmentType: "ice machine", source: "sms", issue: "Ice machine making small, cloudy cubes; bin never fills.", stage: "waiting_on_yes", createdAt: at(5, 13, 0, now), lastContactAt: at(3, 11, 0, now) });
  await message(lakeside, lakesideJob, { channel: "sms", direction: "inbound", from: "(512) 555-0177", to: "(512) 555-0100", body: "Hi Denise, Priya at Lakeside. Ice machine is making tiny cloudy cubes and the bin never fills. Not an emergency but we're going through bagged ice. Can you quote a fix?", at: at(5, 13, 0, now), extracted: { name: "Priya", business: "Lakeside Grill", equipment: "ice machine", issue: "Small cloudy cubes, bin never fills", urgency: "normal", intent: "new_request" } });
  await quote(lakeside, lakesideJob, { items: [{ description: "Ice machine water pump", qty: 1, unitPrice: 210 }, { description: "Labor (per hour)", qty: 2, unitPrice: 110 }, { description: "Coil cleaning", qty: 1, unitPrice: 180 }], status: "sent", sentAt: at(3, 11, 0, now) });
  await stage(lakeside, lakesideJob, "Waiting on yes", at(3, 11, 0, now));

  // 4. Pho 88 — approved yesterday, needs a tech.
  const pho = await customer({ businessName: "Pho 88", type: "restaurant", primaryContact: "Linh Tran", phone: "(512) 555-0162", email: "linh@pho88austin.com", sites: [{ name: "Main location", address: "8557 Research Blvd, Austin, TX 78758", equipment: [{ type: "walk-in cooler", makeModel: "Nor-Lake 6x8" }] }], createdAt: at(150, 9, 0, now) });
  const phoJob = await job(pho, { equipmentType: "walk-in cooler", source: "call", issue: "Walk-in cooler door won't seal, temp drifting up to 42 overnight.", stage: "approved", createdAt: at(4, 9, 0, now), lastContactAt: at(1, 16, 30, now) });
  await quote(pho, phoJob, { items: [{ description: "Door gasket", qty: 1, unitPrice: 95 }, { description: "Door closer / hinge kit", qty: 1, unitPrice: 130 }, { description: "Labor (per hour)", qty: 1.5, unitPrice: 110 }], status: "accepted", sentAt: at(3, 10, 0, now), respondedAt: at(1, 16, 30, now), comment: "Yes, go ahead. Mornings are best." });
  await call(pho, phoJob, { direction: "inbound", number: "(512) 555-0162", at: at(1, 16, 30, now), durationSec: 95, status: "completed", transcript: "Linh: Hi Denise, Linh from Pho 88. We got the quote for the door, that's fine, go ahead. Denise: Great, I'll get someone scheduled. Any day work better? Linh: Mornings before 11 are best. Denise: Perfect, I'll text you the time.", summary: "Customer approved the door repair quote; prefers mornings before 11.", extracted: { decision: "approved", requestedDate: "mornings before 11", nextStep: "Schedule a morning visit" }, applied: true });
  await stage(pho, phoJob, "Approved – schedule", at(1, 16, 32, now));

  // 5. Metro Cold Storage — scheduled 2 days ago, never marked done (+ done job earlier).
  const metro = await customer({ businessName: "Metro Cold Storage", type: "warehouse", primaryContact: "Dwayne Brooks", phone: "(512) 555-0120", email: "ops@metrocoldstorage.com", notes: "Gate code 4471. Ask for Dwayne or the shift lead.", sites: [{ name: "Warehouse A", address: "4500 Industrial Terrace, Austin, TX 78744", equipment: [{ type: "walk-in freezer", makeModel: "Bally 30x40 blast" }, { type: "walk-in cooler", makeModel: "Bally 20x30" }] }, { name: "Warehouse B", address: "4520 Industrial Terrace, Austin, TX 78744", equipment: [{ type: "walk-in freezer", makeModel: "Bally 30x40" }] }], createdAt: at(500, 9, 0, now) });
  const metroJob = await job(metro, { equipmentType: "walk-in freezer", source: "repeat", issue: "Warehouse A blast freezer alarm — high temp during defrost cycle.", stage: "scheduled", createdAt: at(7, 8, 0, now), lastContactAt: at(3, 9, 0, now), scheduledFor: at(2, 8, 0, now), techId: luis.id });
  await quote(metro, metroJob, { items: [{ description: "Diagnostic visit", qty: 1, unitPrice: 125 }, { description: "Thermostat / temperature controller", qty: 1, unitPrice: 145 }, { description: "Labor (per hour)", qty: 3, unitPrice: 110 }], status: "accepted", sentAt: at(6, 11, 0, now), respondedAt: at(5, 9, 0, now) });
  await act({ customerId: metro.id, jobId: metroJob.id, type: "schedule", text: `Scheduled for ${at(2, 8, 0, now).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} with Luis Romero`, at: at(3, 9, 0, now) });
  await stage(metro, metroJob, "Scheduled", at(3, 9, 0, now));
  const metroOld = await job(metro, { siteIdx: 1, equipmentType: "walk-in freezer", source: "repeat", issue: "Warehouse B freezer quarterly maintenance and coil cleaning.", stage: "done", createdAt: at(21, 9, 0, now), lastContactAt: at(15, 9, 0, now), scheduledFor: at(15, 8, 0, now), techId: dev.id, completedAt: at(15, 13, 0, now), completionNotes: "Coils cleaned, charge checked, all good." });
  await quote(metro, metroOld, { items: [{ description: "Coil cleaning", qty: 2, unitPrice: 180 }, { description: "Labor (per hour)", qty: 2, unitPrice: 110 }], status: "accepted", sentAt: at(20, 10, 0, now), respondedAt: at(19, 9, 0, now) });
  await stage(metro, metroOld, "Done", at(15, 13, 0, now), "Dev Patel");

  // 6. Blue Door Bakery — healthy: quote sent yesterday.
  const blueDoor = await customer({ businessName: "Blue Door Bakery", type: "restaurant", primaryContact: "Hannah Weiss", phone: "(512) 555-0188", email: "hannah@bluedoorbakery.com", sites: [{ name: "Main location", address: "1200 S Congress Ave, Austin, TX 78704", equipment: [{ type: "reach-in", makeModel: "True TS-49" }] }], createdAt: at(80, 9, 0, now) });
  const blueDoorJob = await job(blueDoor, { equipmentType: "reach-in", source: "sms", issue: "Reach-in cooler running 5–8 degrees warm, fan noisy.", stage: "waiting_on_yes", createdAt: at(2, 10, 0, now), lastContactAt: at(1, 14, 0, now) });
  await quote(blueDoor, blueDoorJob, { items: [{ description: "Evaporator fan motor", qty: 1, unitPrice: 165 }, { description: "Labor (per hour)", qty: 1.5, unitPrice: 110 }], status: "sent", sentAt: at(1, 14, 0, now) });
  await stage(blueDoor, blueDoorJob, "Waiting on yes", at(1, 14, 0, now));
  await message(blueDoor, blueDoorJob, { channel: "sms", direction: "inbound", from: "(512) 555-0188", to: "(512) 555-0100", body: "Got the quote, thanks! Checking with my partner, will let you know tomorrow.", at: at(1, 15, 5, now), extracted: { intent: "other", summary: "Reviewing the quote, reply tomorrow" } });

  // 7. Northside Diner — healthy: scheduled tomorrow, contacted today.
  const diner = await customer({ businessName: "Northside Diner", type: "restaurant", primaryContact: "Gus Papadakis", phone: "(512) 555-0111", email: "gus@northsidediner.com", sites: [{ name: "Main location", address: "7020 Burnet Rd, Austin, TX 78757", equipment: [{ type: "walk-in cooler" }, { type: "ice machine", makeModel: "Manitowoc Indigo" }] }], createdAt: at(365, 9, 0, now) });
  const dinerJob = await job(diner, { eqIdx: 1, equipmentType: "ice machine", source: "call", issue: "Ice machine leaking water onto the floor from the back.", stage: "scheduled", createdAt: at(3, 9, 0, now), lastContactAt: at(0, 8, 15, now), scheduledFor: at(-1, 9, 0, now), techId: marcus.id });
  await quote(diner, dinerJob, { items: [{ description: "Ice machine water pump", qty: 1, unitPrice: 210 }, { description: "Labor (per hour)", qty: 1.5, unitPrice: 110 }], status: "accepted", sentAt: at(2, 11, 0, now), respondedAt: at(2, 15, 0, now) });
  await stage(diner, dinerJob, "Scheduled", at(1, 10, 0, now));
  await message(diner, dinerJob, { channel: "sms", direction: "outbound", from: "(512) 555-0100", to: "(512) 555-0111", body: "Hi Gus, confirming Marcus will be at Northside Diner tomorrow at 9am for the ice machine. Reply if that changes. — Denise", at: at(0, 8, 15, now) });

  // 8. Marisol's Cantina — done today.
  const marisol = await customer({ businessName: "Marisol's Cantina", type: "restaurant", primaryContact: "Marisol Vega", phone: "(512) 555-0155", sites: [{ name: "Main location", address: "2500 E Cesar Chavez St, Austin, TX 78702", equipment: [{ type: "walk-in cooler" }] }], createdAt: at(200, 9, 0, now) });
  const marisolJob = await job(marisol, { equipmentType: "walk-in cooler", source: "call", issue: "Walk-in cooler evaporator fan seized.", stage: "done", createdAt: at(4, 9, 0, now), lastContactAt: at(0, 11, 0, now), scheduledFor: at(0, 8, 0, now), techId: jenna.id, completedAt: at(0, 11, 0, now), completionNotes: "Replaced evap fan motor, cooler back to 36°F." });
  await quote(marisol, marisolJob, { items: [{ description: "Evaporator fan motor", qty: 1, unitPrice: 165 }, { description: "Labor (per hour)", qty: 2, unitPrice: 110 }], status: "accepted", sentAt: at(3, 10, 0, now), respondedAt: at(3, 12, 0, now) });
  await stage(marisol, marisolJob, "Done", at(0, 11, 0, now), "Jenna Ortiz");

  // 9. Fresh Mart — done 2 days ago.
  const freshMart = await customer({ businessName: "Fresh Mart", type: "grocery", primaryContact: "Sam Okafor", phone: "(512) 555-0166", email: "sam@freshmartatx.com", sites: [{ name: "Main location", address: "5600 Manor Rd, Austin, TX 78723", equipment: [{ type: "reach-in", makeModel: "Hussmann dairy case" }] }], createdAt: at(120, 9, 0, now) });
  const freshJob = await job(freshMart, { equipmentType: "reach-in", source: "web_form", issue: "Dairy case running warm on one side.", stage: "done", createdAt: at(8, 9, 0, now), lastContactAt: at(2, 15, 0, now), scheduledFor: at(2, 13, 0, now), techId: dev.id, completedAt: at(2, 15, 0, now), completionNotes: "Cleared drain, cleaned coil." });
  await quote(freshMart, freshJob, { items: [{ description: "Coil cleaning", qty: 1, unitPrice: 180 }, { description: "Labor (per hour)", qty: 1, unitPrice: 110 }], status: "accepted", sentAt: at(7, 10, 0, now), respondedAt: at(6, 9, 0, now) });
  await stage(freshMart, freshJob, "Done", at(2, 15, 0, now), "Dev Patel");

  // 10. Kwik Stop #4 — brand-new web form request this morning.
  const kwik = await customer({ businessName: "Kwik Stop #4", type: "grocery", primaryContact: "Alicia Moreno", phone: "(512) 555-0190", email: "store4@kwikstop.com", sites: [{ name: "Store #4", address: "1901 E Riverside Dr, Austin, TX 78741", equipment: [{ type: "ice machine", makeModel: "Scotsman C0522" }] }], createdAt: at(0, 7, 40, now) });
  const kwikJob = await job(kwik, { equipmentType: "ice machine", source: "web_form", issue: "Ice machine stopped making ice overnight. We sell bagged ice so this hurts.", stage: "needs_quote", createdAt: at(0, 7, 40, now), lastContactAt: null });
  await message(kwik, kwikJob, { channel: "web_form", direction: "inbound", from: "store4@kwikstop.com", to: "website", subject: "Website request", body: "Name: Alicia Moreno\nBusiness: Kwik Stop #4\nPhone: 512-555-0190\nEmail: store4@kwikstop.com\nEquipment: Ice machine\nMessage: Ice machine stopped making ice overnight. We sell bagged ice so this hurts. Can someone come today or tomorrow?", at: at(0, 7, 40, now), extracted: { name: "Alicia Moreno", business: "Kwik Stop #4", phone: "512-555-0190", email: "store4@kwikstop.com", equipment: "ice machine", issue: "Ice machine stopped making ice overnight", urgency: "high", intent: "new_request" } });

  // 11. Harbor Seafood — contacted yesterday, no quote yet → "Send the quote".
  const harbor = await customer({ businessName: "Harbor Seafood", type: "restaurant", primaryContact: "Jake Morrison", phone: "(512) 555-0102", email: "jake@harborseafoodatx.com", sites: [{ name: "Main location", address: "3801 S Lamar Blvd, Austin, TX 78704", equipment: [{ type: "reach-in", makeModel: "Traulsen G-series" }, { type: "walk-in cooler" }] }], createdAt: at(60, 9, 0, now) });
  const harborJob = await job(harbor, { equipmentType: "reach-in", source: "call", issue: "Two-door reach-in freezer frosting heavily, door gaskets shot.", stage: "needs_quote", createdAt: at(2, 14, 0, now), lastContactAt: at(1, 9, 30, now) });
  await call(harbor, harborJob, { direction: "outbound", number: "(512) 555-0102", at: at(1, 9, 30, now), durationSec: 240, status: "completed", transcript: "Denise: Hey Jake, Denise. About the reach-in. Jake: Yeah the two-door freezer is frosting up like crazy, both gaskets are shot. Denise: Two gaskets and probably a defrost heater. I'll write it up, should be around six hundred. Jake: Sounds good, send it over.", summary: "Two door gaskets plus possible defrost heater; customer expects ~$600 quote.", extracted: { issue: "Reach-in freezer frosting heavily, both gaskets shot", equipment: "reach-in", urgency: "normal", quoteAmount: 600, nextStep: "Send the quote" }, applied: true });
  await contact(harbor, harborJob, "Called customer", at(1, 9, 30, now));

  // 12. Sunrise Cafe — scheduled next week but quiet 3 days → "Hasn't heard from us".
  const sunrise = await customer({ businessName: "Sunrise Cafe", type: "restaurant", primaryContact: "Mei Chen", phone: "(512) 555-0123", email: "mei@sunrisecafeatx.com", sites: [{ name: "Main location", address: "4001 N Lamar Blvd, Austin, TX 78756", equipment: [{ type: "walk-in cooler" }] }], createdAt: at(90, 9, 0, now) });
  const sunriseJob = await job(sunrise, { equipmentType: "walk-in cooler", source: "referral", issue: "Walk-in cooler annual service and coil cleaning.", stage: "scheduled", createdAt: at(9, 9, 0, now), lastContactAt: at(3, 10, 0, now), scheduledFor: at(-6, 10, 0, now), techId: jenna.id });
  await quote(sunrise, sunriseJob, { items: [{ description: "Coil cleaning", qty: 1, unitPrice: 180 }, { description: "Labor (per hour)", qty: 1, unitPrice: 110 }], status: "accepted", sentAt: at(8, 10, 0, now), respondedAt: at(7, 9, 0, now) });
  await stage(sunrise, sunriseJob, "Scheduled", at(3, 10, 0, now));

  // 13. Joe's Pizza — lost.
  const joes = await customer({ businessName: "Joe's Pizza", type: "restaurant", primaryContact: "Joe Bianchi", phone: "(512) 555-0147", sites: [{ name: "Main location", address: "1600 Barton Springs Rd, Austin, TX 78704", equipment: [{ type: "reach-in" }] }], createdAt: at(30, 9, 0, now) });
  const joesJob = await job(joes, { equipmentType: "reach-in", source: "call", issue: "Pizza prep table not holding temp.", stage: "lost", createdAt: at(12, 9, 0, now), lastContactAt: at(9, 9, 0, now), lostReason: "Went with someone else — we were 2 days late with the quote." });
  await quote(joes, joesJob, { items: [{ description: "Thermostat / temperature controller", qty: 1, unitPrice: 145 }, { description: "Labor (per hour)", qty: 1.5, unitPrice: 110 }], status: "declined", sentAt: at(9, 9, 0, now), respondedAt: at(5, 9, 0, now), comment: "Already had it fixed, sorry." });
  await stage(joes, joesJob, "Lost", at(5, 9, 5, now));

  // 14. Greenleaf Market — repeat: done 12 days ago + visit today at 2pm.
  const greenleaf = await customer({ businessName: "Greenleaf Market", type: "grocery", primaryContact: "Nora Fitzgerald", phone: "(512) 555-0171", email: "nora@greenleafmarket.com", sites: [{ name: "Main location", address: "2900 W Anderson Ln, Austin, TX 78757", equipment: [{ type: "walk-in cooler", makeModel: "Amerikooler" }, { type: "reach-in", makeModel: "Hussmann produce case" }] }], createdAt: at(250, 9, 0, now) });
  const greenOld = await job(greenleaf, { equipmentType: "walk-in cooler", source: "repeat", issue: "Walk-in cooler compressor short-cycling.", stage: "done", createdAt: at(16, 9, 0, now), lastContactAt: at(12, 9, 0, now), scheduledFor: at(12, 8, 0, now), techId: marcus.id, completedAt: at(12, 12, 0, now), completionNotes: "Replaced start capacitor and contactor." });
  await quote(greenleaf, greenOld, { items: [{ description: "Contactor + start capacitor", qty: 1, unitPrice: 160 }, { description: "Labor (per hour)", qty: 2, unitPrice: 110 }], status: "accepted", sentAt: at(15, 10, 0, now), respondedAt: at(14, 9, 0, now) });
  await stage(greenleaf, greenOld, "Done", at(12, 12, 0, now), "Marcus Lee");
  const greenToday = await job(greenleaf, { eqIdx: 1, equipmentType: "reach-in", source: "repeat", issue: "Produce case fogging up, lights flickering.", stage: "scheduled", createdAt: at(3, 9, 0, now), lastContactAt: at(1, 9, 0, now), scheduledFor: at(0, 14, 0, now), techId: jenna.id });
  await quote(greenleaf, greenToday, { items: [{ description: "Diagnostic visit", qty: 1, unitPrice: 125 }], status: "accepted", sentAt: at(2, 10, 0, now), respondedAt: at(2, 11, 0, now) });
  await stage(greenleaf, greenToday, "Scheduled", at(1, 9, 0, now));

  // 15. Alamo Storage & Distribution — referral, 2 days, never called.
  const alamo = await customer({ businessName: "Alamo Storage & Distribution", type: "warehouse", primaryContact: "Carla Mendes", phone: "(512) 555-0109", email: "cmendes@alamostorage.com", sites: [{ name: "Dock 3", address: "7800 Shoal Creek Blvd, Austin, TX 78757", equipment: [{ type: "walk-in cooler", makeModel: "Kysor 40x60" }] }], createdAt: at(2, 11, 0, now) });
  await job(alamo, { equipmentType: "walk-in cooler", source: "referral", issue: "Referred by Metro Cold Storage. Wants a quote on a preventive maintenance contract for a 40x60 walk-in.", stage: "needs_quote", createdAt: at(2, 11, 0, now), lastContactAt: null });

  // 16. The Copper Kettle — approved 3 days ago, still not booked.
  const kettle = await customer({ businessName: "The Copper Kettle", type: "restaurant", primaryContact: "Owen Blake", phone: "(512) 555-0180", email: "owen@copperkettleatx.com", sites: [{ name: "Main location", address: "500 W 5th St, Austin, TX 78701", equipment: [{ type: "walk-in freezer" }] }], createdAt: at(45, 9, 0, now) });
  const kettleJob = await job(kettle, { equipmentType: "walk-in freezer", source: "email", issue: "Walk-in freezer door heater failed; door freezing shut in the mornings.", stage: "approved", createdAt: at(6, 9, 0, now), lastContactAt: at(3, 10, 0, now) });
  await quote(kettle, kettleJob, { items: [{ description: "Door frame heater kit", qty: 1, unitPrice: 220 }, { description: "Labor (per hour)", qty: 2, unitPrice: 110 }], status: "accepted", sentAt: at(5, 10, 0, now), respondedAt: at(3, 10, 0, now), comment: "Approved. Any weekday after 2pm." });
  await stage(kettle, kettleJob, "Approved – schedule", at(3, 10, 0, now), "customer");

  // 17. Sushi Zen — quote out 6 days, very quiet.
  const sushi = await customer({ businessName: "Sushi Zen", type: "restaurant", primaryContact: "Kenji Watanabe", phone: "(512) 555-0195", email: "kenji@sushizenatx.com", sites: [{ name: "Main location", address: "3300 Bee Caves Rd, Austin, TX 78746", equipment: [{ type: "reach-in", makeModel: "Turbo Air sushi case" }] }], createdAt: at(70, 9, 0, now) });
  const sushiJob = await job(sushi, { equipmentType: "reach-in", source: "call", issue: "Sushi display case not holding 38°F during service.", stage: "waiting_on_yes", createdAt: at(8, 9, 0, now), lastContactAt: at(6, 12, 0, now) });
  await quote(sushi, sushiJob, { items: [{ description: "Thermostat / temperature controller", qty: 1, unitPrice: 145 }, { description: "Refrigerant R-404A (per lb)", qty: 2, unitPrice: 38 }, { description: "Labor (per hour)", qty: 2, unitPrice: 110 }], status: "sent", sentAt: at(6, 12, 0, now) });
  await stage(sushi, sushiJob, "Waiting on yes", at(6, 12, 0, now));

  // Historical done jobs for the revenue chart (last 8 weeks).
  const history: [Cust, number, string, number][] = [
    [diner, 26, "walk-in cooler", 540],
    [lakeside, 33, "ice machine", 410],
    [sunrise, 48, "walk-in cooler", 690],
    [harbor, 52, "walk-in cooler", 1320],
    [blueDoor, 19, "reach-in", 275],
    [pho, 58, "walk-in cooler", 860],
  ];
  for (const [c, d, eq, price] of history) {
    const j = await job(c, { equipmentType: eq, source: "repeat", issue: `${eq} service visit`, stage: "done", createdAt: at(d + 4, 9, 0, now), lastContactAt: at(d, 9, 0, now), scheduledFor: at(d, 9, 0, now), techId: techs[d % 4].id, completedAt: at(d, 12, 0, now), completionNotes: "Completed." });
    await quote(c, j, { items: [{ description: "Service visit", qty: 1, unitPrice: price }], status: "accepted", sentAt: at(d + 3, 10, 0, now), respondedAt: at(d + 2, 10, 0, now) });
    await stage(c, j, "Done", at(d, 12, 0, now), techs[d % 4].name);
  }

  // Unmatched / needs-review inbox items so the Inbox has something to triage.
  await message(null, null, { channel: "email", direction: "inbound", from: "promo@seo-leads-pro.example", to: "service@denisesrefrigeration.com", subject: "Rank #1 on Google for refrigeration repair", body: "Hi! We can get your business to the top of Google in 30 days. Reply for a free audit.", at: at(1, 6, 0, now), status: "not_a_lead", extracted: { intent: "other", isLead: false, summary: "SEO spam" } });
  await message(null, null, { channel: "sms", direction: "inbound", from: "(512) 555-0777", to: "(512) 555-0100", body: "hey is this the fridge repair people? our beer cooler at the taproom is warm. 512-555-0777", at: at(0, 6, 55, now), status: "needs_review", extracted: { phone: "512-555-0777", equipment: "reach-in", issue: "Beer cooler at the taproom is warm", urgency: "high", intent: "new_request", name: null, business: null } });

  return { customers: 17, techs: techs.length };
}

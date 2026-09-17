import { db } from "@/lib/db";
import { emailAdapter, smsAdapter } from "@/integrations";
import { STAGE_LABEL, money, type Stage } from "@/lib/domain/types";
import { computeTotals, type LineItemInput } from "@/lib/quotes/totals";
import { logActivity, notify } from "./activity";
import { isForwardMove } from "@/lib/domain/types";
import { getSettings } from "./settings";

function clean(v: string | null | undefined, max = 500): string {
  return (v ?? "").trim().slice(0, max);
}

export async function createDraftQuote(jobId: string, actor: string) {
  const job = await db.job.findUnique({ where: { id: jobId }, include: { quotes: { where: { status: "draft" }, take: 1 } } });
  if (!job) throw new Error("Job not found");
  if (job.quotes[0]) return job.quotes[0];
  const settings = await getSettings();
  const q = await db.quote.create({
    data: { jobId, customerId: job.customerId, taxRate: settings.taxRate, subtotal: 0, tax: 0, total: 0, status: "draft", notes: "Parts and labor as listed. 30-day workmanship warranty.", items: { create: [{ description: "Diagnostic visit", qty: 1, unitPrice: 125, sortOrder: 0 }] } },
  });
  await logActivity({ customerId: job.customerId, jobId, type: "quote", text: "Quote draft started", actor });
  return q;
}

export interface QuoteInput {
  items: LineItemInput[];
  taxRate: number;
  notes: string;
}

/** Totals are always recomputed here — the client never decides what a quote is worth. */
export async function updateQuote(id: string, input: QuoteInput, actor: string) {
  const q = await db.quote.findUnique({ where: { id } });
  if (!q) throw new Error("Quote not found");
  if (q.status === "accepted" || q.status === "declined") throw new Error("This quote has been answered and can't be edited. Start a new one.");
  const items = input.items.map((it) => ({ description: clean(it.description, 200), qty: Number(it.qty) || 0, unitPrice: Number(it.unitPrice) || 0 })).filter((it) => it.description);
  if (items.length === 0) throw new Error("Add at least one line item.");
  if (items.some((it) => it.qty <= 0 || it.unitPrice < 0)) throw new Error("Quantities must be positive and prices can't be negative.");
  const taxRate = Math.min(30, Math.max(0, Number(input.taxRate) || 0));
  const totals = computeTotals(items, taxRate);
  await db.quoteItem.deleteMany({ where: { quoteId: id } });
  const updated = await db.quote.update({
    where: { id },
    data: { taxRate, subtotal: totals.subtotal, tax: totals.tax, total: totals.total, notes: clean(input.notes, 2000), items: { create: totals.lines.map((l, i) => ({ description: l.description, qty: l.qty, unitPrice: l.unitPrice, sortOrder: i })) } },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  await logActivity({ customerId: q.customerId, jobId: q.jobId, type: "quote", text: `Quote updated — ${money(totals.total)}`, actor });
  return updated;
}

export function publicQuoteUrl(token: string): string {
  return `${process.env.APP_URL ?? "http://localhost:3000"}/q/${token}`;
}

/** Email the quote link and move the job to waiting_on_yes. Re-sending an already-sent quote is allowed (it's a nudge). */
export async function sendQuote(id: string, actor: string, opts: { channel?: "email" | "sms" } = {}) {
  const q = await db.quote.findUnique({ where: { id }, include: { job: { include: { customer: true } }, items: true } });
  if (!q) throw new Error("Quote not found");
  if (q.status === "accepted" || q.status === "declined") throw new Error("This quote has already been answered.");
  if (q.items.length === 0 || q.total <= 0) throw new Error("Add line items before sending.");
  const c = q.job.customer;
  const settings = await getSettings();
  const url = publicQuoteUrl(q.publicToken);
  const channel = opts.channel ?? (c.email ? "email" : c.phone ? "sms" : "email");
  const to = channel === "email" ? c.email : c.phone;
  if (!to) throw new Error(`No ${channel === "email" ? "email address" : "phone number"} on file for ${c.businessName}.`);
  const first = c.primaryContact.split(" ")[0] || "there";
  const text =
    channel === "email"
      ? `Hi ${first},\n\nHere's your quote from ${settings.businessName} for the ${q.job.equipmentType} at ${c.businessName}: ${money(q.total)}.\n\nReview and accept or decline online:\n${url}\n\n${q.notes}\n\nThanks,\n${settings.ownerName}\n${settings.ownerPhone}`
      : `Hi ${first}, your quote from ${settings.businessName} for the ${q.job.equipmentType} is ${money(q.total)}. Accept or decline here: ${url} — ${settings.ownerName}`;
  const adapter = channel === "email" ? emailAdapter() : smsAdapter();
  const result = channel === "email" ? await emailAdapter().send({ to, subject: `Quote ${money(q.total)} — ${c.businessName}`, text }) : await smsAdapter().send({ to, text });
  if (!result.ok) throw new Error(result.error ?? "Send failed");
  await db.message.create({ data: { channel, direction: "outbound", fromAddr: "office", toAddr: to, subject: channel === "email" ? `Quote ${money(q.total)} — ${c.businessName}` : null, body: text, raw: result.preview ?? "", status: "sent", customerId: c.id, jobId: q.jobId, externalId: result.id ? `out:${result.id}` : null, threadKey: channel === "sms" ? to.replace(/\D/g, "").replace(/^1(\d{10})$/, "$1") : to.toLowerCase() } });
  const wasSent = q.status === "sent";
  const now = new Date();
  await db.quote.update({ where: { id }, data: { status: "sent", sentAt: q.sentAt ?? now, ...(wasSent ? { reminderSentAt: now } : {}) } });
  const from = q.job.stage as Stage;
  const forward = isForwardMove(from, "waiting_on_yes");
  if (from === "needs_quote" || from === "waiting_on_yes") {
    await db.job.update({ where: { id: q.jobId }, data: { stage: "waiting_on_yes", lastContactAt: now, lostReason: null } });
    if (forward) await logActivity({ customerId: c.id, jobId: q.jobId, type: "stage", text: `Stage → ${STAGE_LABEL.waiting_on_yes}`, actor });
  } else {
    await db.job.update({ where: { id: q.jobId }, data: { lastContactAt: now } });
  }
  await logActivity({ customerId: c.id, jobId: q.jobId, type: "quote", text: `${wasSent ? "Quote reminder" : "Quote"} ${money(q.total)} sent by ${channel} to ${to}${adapter.kind === "simulated" ? " (simulated)" : ""}`, actor });
  return { url, to, channel, simulated: adapter.kind === "simulated", preview: result.preview ?? text, reminder: wasSent };
}

export async function getPublicQuote(token: string) {
  return db.quote.findUnique({ where: { publicToken: token }, include: { items: { orderBy: { sortOrder: "asc" } }, job: { include: { customer: { include: { sites: { take: 1 } } } } } } });
}

/** Customer answers from the public page. Exactly once: a second answer is rejected. */
export async function respondToQuote(token: string, decision: "accept" | "decline", comment: string | null) {
  const q = await getPublicQuote(token);
  if (!q) throw new Error("Quote not found");
  if (q.status === "accepted" || q.status === "declined") return { alreadyAnswered: true as const, status: q.status as "accepted" | "declined", quote: q };
  if (q.status === "draft") throw new Error("This quote hasn't been sent yet.");
  const now = new Date();
  const note = clean(comment, 1000) || null;
  // Guard against a double click racing itself: only flip if still "sent".
  const flipped = await db.quote.updateMany({ where: { id: q.id, status: "sent" }, data: { status: decision === "accept" ? "accepted" : "declined", respondedAt: now, customerComment: note } });
  if (flipped.count === 0) {
    const again = await getPublicQuote(token);
    return { alreadyAnswered: true as const, status: (again?.status ?? "accepted") as "accepted" | "declined", quote: again ?? q };
  }
  const c = q.job.customer;
  if (decision === "accept") {
    if (q.job.stage === "waiting_on_yes" || q.job.stage === "needs_quote") {
      await db.job.update({ where: { id: q.jobId }, data: { stage: "approved", lostReason: null } });
      await logActivity({ customerId: c.id, jobId: q.jobId, type: "stage", text: `Customer accepted the quote online — Stage → ${STAGE_LABEL.approved}`, actor: "customer" });
    }
    await logActivity({ customerId: c.id, jobId: q.jobId, type: "quote", text: `Quote ${money(q.total)} accepted${note ? ` — “${note}”` : ""}`, actor: "customer" });
    await notify({ text: `${c.businessName} accepted the ${money(q.total)} quote`, href: `/jobs/${q.jobId}` });
  } else {
    if (q.job.stage !== "done" && q.job.stage !== "lost") {
      await db.job.update({ where: { id: q.jobId }, data: { stage: "lost", lostReason: note ? `Declined quote: ${note}` : "Declined quote online" } });
      await logActivity({ customerId: c.id, jobId: q.jobId, type: "stage", text: `Customer declined the quote online — Stage → ${STAGE_LABEL.lost}${note ? ` (${note})` : ""}`, actor: "customer" });
    }
    await logActivity({ customerId: c.id, jobId: q.jobId, type: "quote", text: `Quote ${money(q.total)} declined${note ? ` — “${note}”` : ""}`, actor: "customer" });
    await notify({ text: `${c.businessName} declined the ${money(q.total)} quote${note ? `: “${note.slice(0, 60)}”` : ""}`, href: `/jobs/${q.jobId}` });
  }
  return { alreadyAnswered: false as const, status: decision === "accept" ? ("accepted" as const) : ("declined" as const), quote: q };
}

export async function listQuotes(status?: string | null) {
  return db.quote.findMany({ where: status ? { status } : {}, orderBy: { updatedAt: "desc" }, include: { customer: { select: { id: true, businessName: true } }, job: { select: { id: true, issue: true, stage: true, equipmentType: true } } }, take: 300 });
}

export async function getQuoteDetail(id: string) {
  return db.quote.findUnique({ where: { id }, include: { items: { orderBy: { sortOrder: "asc" } }, customer: true, job: { select: { id: true, issue: true, stage: true, equipmentType: true } } } });
}

export async function priceList() {
  return db.priceListItem.findMany({ orderBy: [{ sortOrder: "asc" }, { description: "asc" }] });
}

export async function upsertPriceItem(input: { id?: string | null; description: string; kind: string; unitPrice: number }) {
  const description = clean(input.description, 120);
  if (!description) throw new Error("Description is required.");
  const unitPrice = Number(input.unitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error("Price must be a positive number.");
  const kind = input.kind === "labor" ? "labor" : "part";
  if (input.id) return db.priceListItem.update({ where: { id: input.id }, data: { description, kind, unitPrice } });
  const count = await db.priceListItem.count();
  return db.priceListItem.create({ data: { description, kind, unitPrice, sortOrder: count } });
}

export async function deletePriceItem(id: string) {
  await db.priceListItem.delete({ where: { id } });
}

"use server";

import { z } from "zod";
import { createDraftQuote, deletePriceItem, sendQuote, updateQuote, upsertPriceItem } from "@/lib/services/quotes";
import { guarded, refreshAll, str } from "./util";

const ItemsSchema = z.array(z.object({ description: z.string(), qty: z.number(), unitPrice: z.number() })).max(50);

export async function createQuoteAction(fd: FormData) {
  return guarded("write:quotes", async (user) => {
    const q = await createDraftQuote(str(fd, "jobId"), user.name);
    refreshAll();
    return { quoteId: q.id };
  });
}

export async function saveQuoteAction(fd: FormData) {
  return guarded("write:quotes", async (user) => {
    const items = ItemsSchema.parse(JSON.parse(str(fd, "items") || "[]"));
    const q = await updateQuote(str(fd, "quoteId"), { items, taxRate: Number(str(fd, "taxRate")) || 0, notes: str(fd, "notes") }, user.name);
    refreshAll();
    return { message: "Quote saved", total: q.total, subtotal: q.subtotal, tax: q.tax };
  });
}

export async function sendQuoteAction(fd: FormData) {
  return guarded("write:quotes", async (user) => {
    const itemsRaw = str(fd, "items");
    if (itemsRaw) {
      const items = ItemsSchema.parse(JSON.parse(itemsRaw));
      await updateQuote(str(fd, "quoteId"), { items, taxRate: Number(str(fd, "taxRate")) || 0, notes: str(fd, "notes") }, user.name);
    }
    const channel = str(fd, "channel") === "sms" ? "sms" : str(fd, "channel") === "email" ? "email" : undefined;
    const r = await sendQuote(str(fd, "quoteId"), user.name, { channel });
    refreshAll();
    return { message: r.reminder ? `Reminder sent${r.simulated ? " (simulated)" : ""}` : `Quote sent by ${r.channel}${r.simulated ? " (simulated)" : ""} — job is now Waiting on yes`, url: r.url, preview: r.preview, simulated: r.simulated, to: r.to };
  });
}

export async function sendQuoteReminderAction(fd: FormData) {
  return guarded("write:quotes", async (user) => {
    const r = await sendQuote(str(fd, "quoteId"), user.name);
    refreshAll();
    return { message: `Reminder sent to ${r.to}${r.simulated ? " (simulated)" : ""}`, preview: r.preview, simulated: r.simulated };
  });
}

export async function savePriceItemAction(fd: FormData) {
  return guarded("write:quotes", async () => {
    await upsertPriceItem({ id: str(fd, "id") || null, description: str(fd, "description"), kind: str(fd, "kind"), unitPrice: Number(str(fd, "unitPrice")) });
    refreshAll();
    return { message: "Price list saved" };
  });
}

export async function deletePriceItemAction(fd: FormData) {
  return guarded("write:quotes", async () => {
    await deletePriceItem(str(fd, "id"));
    refreshAll();
    return { message: "Removed" };
  });
}

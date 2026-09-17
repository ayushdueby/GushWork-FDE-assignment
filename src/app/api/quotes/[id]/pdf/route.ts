import { api } from "@/lib/api";
import { db } from "@/lib/db";
import { renderQuotePdf } from "@/lib/quotes/pdf";
import { getQuoteDetail } from "@/lib/services/quotes";
import { getSettings } from "@/lib/services/settings";

export const GET = api("view:quotes", async (_req, { params }) => {
  const [q, settings] = await Promise.all([getQuoteDetail(params.id), getSettings()]);
  if (!q) return new Response("Not found", { status: 404 });
  const site = await db.site.findFirst({ where: { customerId: q.customerId } });
  const bytes = await renderQuotePdf({ ...q, customer: { ...q.customer, address: site?.address ?? null }, business: { name: settings.businessName, owner: settings.ownerName, phone: settings.ownerPhone, email: settings.ownerEmail } });
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="quote-${q.id.slice(-6)}.pdf"` } });
});

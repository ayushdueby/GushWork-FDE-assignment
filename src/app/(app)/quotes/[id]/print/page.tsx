import { notFound } from "next/navigation";
import { QuoteDocument } from "@/components/quotes/quote-document";
import { requirePage } from "@/lib/auth/current";
import { getQuoteDetail } from "@/lib/services/quotes";
import { getSettings } from "@/lib/services/settings";
import { db } from "@/lib/db";

export const metadata = { title: "Print quote" };

export default async function PrintQuotePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("view:quotes");
  const { id } = await params;
  const [q, settings] = await Promise.all([getQuoteDetail(id), getSettings()]);
  if (!q) notFound();
  const site = await db.site.findFirst({ where: { customerId: q.customerId } });
  return (
    <div className="-mx-4 -mt-5 bg-white md:-mx-8">
      <div className="no-print mx-auto flex max-w-2xl items-center justify-between px-6 pt-4 text-sm">
        <a href={`/quotes/${q.id}`} className="text-primary underline">
          ← Back
        </a>
        <a href={`/api/quotes/${q.id}/pdf`} className="text-primary underline">
          Download PDF
        </a>
      </div>
      <QuoteDocument q={{ ...q, customer: { ...q.customer, address: site?.address ?? null }, business: { name: settings.businessName, owner: settings.ownerName, phone: settings.ownerPhone, email: settings.ownerEmail } }} />
      <script dangerouslySetInnerHTML={{ __html: "window.addEventListener('load',()=>setTimeout(()=>window.print(),300))" }} />
    </div>
  );
}

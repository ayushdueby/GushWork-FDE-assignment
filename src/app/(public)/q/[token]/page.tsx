import { notFound } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { QuoteDocument } from "@/components/quotes/quote-document";
import { getPublicQuote } from "@/lib/services/quotes";
import { getSettings } from "@/lib/services/settings";

export const metadata = { title: "Your quote" };

/** Public: the customer reads the quote and answers once. No login. */
export default async function PublicQuotePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const [q, settings] = await Promise.all([getPublicQuote(token), getSettings()]);
  if (!q || q.status === "draft") notFound();
  const answered = q.status === "accepted" || q.status === "declined";
  const business = { name: settings.businessName, owner: settings.ownerName, phone: settings.ownerPhone, email: settings.ownerEmail };
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      {sp.error && (
        <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {sp.error}
        </p>
      )}
      {answered && (
        <div className={`mb-4 flex items-center gap-3 rounded-2xl border p-4 ${q.status === "accepted" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`} role="status" data-testid="quote-answered">
          {q.status === "accepted" ? <CheckCircle2 className="size-6" /> : <XCircle className="size-6" />}
          <div>
            <p className="font-semibold">{q.status === "accepted" ? "You accepted this quote." : "You declined this quote."}</p>
            <p className="text-sm">
              {q.status === "accepted" ? `${settings.ownerName} will call to schedule the visit.` : "Thanks for letting us know."} {q.respondedAt && `(${q.respondedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })})`}
            </p>
          </div>
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-border shadow-sm">
        <QuoteDocument q={{ ...q, customer: { ...q.job.customer, address: q.job.customer.sites[0]?.address ?? null }, job: q.job, business }} />
      </div>
      {!answered && (
        <form method="post" action={`/api/public/quotes/${q.publicToken}/respond`} className="mt-6 space-y-3 rounded-2xl border border-border bg-card p-4">
          <p className="font-semibold">Ready to go ahead?</p>
          <label htmlFor="comment" className="block text-sm text-muted-foreground">
            Anything we should know? (optional)
          </label>
          <textarea id="comment" name="comment" maxLength={1000} rows={2} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-base" placeholder="Mornings work best for us." />
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="submit" name="decision" value="accept" className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 text-base font-semibold text-white hover:bg-emerald-700 focus-visible:ring-3 focus-visible:ring-ring/50" data-testid="accept-quote">
              <CheckCircle2 className="size-5" /> Accept quote
            </button>
            <button type="submit" name="decision" value="decline" className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-background px-5 text-base font-semibold hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50" data-testid="decline-quote">
              <XCircle className="size-5" /> Decline
            </button>
          </div>
          <p className="text-xs text-muted-foreground">You can answer once. Questions? Call {settings.ownerPhone}.</p>
        </form>
      )}
    </main>
  );
}

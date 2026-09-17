import { redirect } from "next/navigation";
import { requirePage } from "@/lib/auth/current";
import { createDraftQuote } from "@/lib/services/quotes";

/** /quotes/new?jobId=… creates (or reuses) a draft and lands in the builder. */
export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ jobId?: string }> }) {
  const user = await requirePage("write:quotes");
  const { jobId } = await searchParams;
  if (!jobId) redirect("/quotes");
  const q = await createDraftQuote(jobId, user.name);
  redirect(`/quotes/${q.id}`);
}

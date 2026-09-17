import { requirePage } from "@/lib/auth/current";

export const metadata = { title: "Reports" };

export default async function Page() {
  await requirePage("view:reports");
  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-dashed border-border bg-card p-10 text-center">
      <h1 className="text-xl font-semibold">Reports</h1>
      <p className="mt-1 text-sm text-muted-foreground">This module lands in the next build phase.</p>
    </div>
  );
}

import { NewJobForm } from "@/components/jobs/new-job-form";
import { requirePage } from "@/lib/auth/current";

export const metadata = { title: "New job" };

export default async function NewJobPage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  await requirePage("write:crm");
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">New job</h1>
        <p className="text-sm text-muted-foreground">Only a name plus a phone or a description is required.</p>
      </header>
      <NewJobForm initialCustomerId={sp.customerId} />
    </div>
  );
}

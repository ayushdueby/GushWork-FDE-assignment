import Link from "next/link";
import { Search } from "lucide-react";
import { NewCustomerDialog } from "@/components/customers/customer-forms";
import { requirePage } from "@/lib/auth/current";
import { can } from "@/lib/auth/permissions";
import { formatPhone } from "@/lib/domain/types";
import { searchCustomers } from "@/lib/services/customers";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requirePage("view:customers");
  const { q = "" } = await searchParams;
  const customers = await searchCustomers(q);
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground">{customers.length} customer{customers.length === 1 ? "" : "s"}</p>
        </div>
        {can(user.role, "write:crm") && <NewCustomerDialog />}
      </header>
      <form className="relative max-w-md" role="search">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input name="q" defaultValue={q} placeholder="Search by business, contact, phone or address" aria-label="Search customers" className="h-11 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm" />
      </form>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {customers.length === 0 && <li className="px-4 py-10 text-center text-sm text-muted-foreground">No customers match “{q}”.</li>}
        {customers.map((c) => (
          <li key={c.id}>
            <Link href={`/customers/${c.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/40">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{c.businessName}</span>
                <span className="block text-sm text-muted-foreground">
                  {c.primaryContact}
                  {c.phone && ` · ${formatPhone(c.phone)}`}
                  {c.sites[0]?.address && ` · ${c.sites[0].address}`}
                </span>
              </span>
              <span className="text-xs capitalize text-muted-foreground">{c.type}</span>
              <span className="text-xs text-muted-foreground">
                {c._count.jobs} job{c._count.jobs === 1 ? "" : "s"}
              </span>
              {c.jobs.length > 0 && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.jobs.some((j) => j.urgent) ? "bg-red-600 text-white" : "bg-primary/10 text-primary"}`}>{c.jobs.length} open</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

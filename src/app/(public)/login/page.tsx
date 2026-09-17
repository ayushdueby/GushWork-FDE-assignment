import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth/current";
import { homeFor } from "@/lib/auth/permissions";
import type { Role } from "@/lib/domain/types";
import { seedIfEmpty } from "@/lib/seed/seed";
import { Snowflake } from "lucide-react";

export const metadata = { title: "Sign in" };

const ROLE_BLURB: Record<string, string> = {
  owner: "Everything: Today, Inbox, Dialer, Jobs, Quotes, Schedule, Reports.",
  bookkeeper: "Reports, Quotes and Customers — read-only.",
  tech: "Just your own jobs on the tech view.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; switch?: string }> }) {
  const sp = await searchParams;
  const user = await currentUser();
  if (user && !sp.switch) redirect(sp.next && sp.next.startsWith("/") ? sp.next : homeFor(user.role as Role));
  await seedIfEmpty(db);
  const users = await db.user.findMany({ include: { tech: true }, orderBy: [{ role: "asc" }, { name: "asc" }] });
  const order: Record<string, number> = { owner: 0, bookkeeper: 1, tech: 2 };
  users.sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name));

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
          <Snowflake className="size-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Cooler Calls</h1>
        <p className="mt-1 text-muted-foreground">Demo sign-in. Pick who you are — no password.</p>
      </div>
      <form method="post" action="/api/auth/login" className="space-y-2">
        <input type="hidden" name="next" value={sp.next ?? ""} />
        {users.map((u) => (
          <button
            key={u.id}
            type="submit"
            name="userId"
            value={u.id}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition hover:border-primary hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold" style={u.tech ? { background: u.tech.color, color: "white" } : undefined}>
              {u.name
                .split(" ")
                .map((p) => p[0])
                .join("")
                .slice(0, 2)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{u.name}</span>
              <span className="block text-sm text-muted-foreground">
                <span className="capitalize">{u.role}</span> · {ROLE_BLURB[u.role]}
              </span>
            </span>
          </button>
        ))}
      </form>
      <p className="mt-6 text-center text-xs text-muted-foreground">Roles are enforced on the server. Use the switcher in the header to change users any time.</p>
    </main>
  );
}

import Link from "next/link";
import { Snowflake } from "lucide-react";
import { adapterStatus } from "@/integrations";
import type { CurrentUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import type { Role } from "@/lib/domain/types";
import { DemoBanner } from "./demo-banner";
import { BottomNav, SideNav } from "./nav";
import { NotificationsBell } from "./notifications";
import { UserMenu } from "./user-menu";
import { DialerProvider } from "@/components/dialer/dialer-provider";

export async function AppShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const inboxCount = user.role === "owner" ? await db.message.count({ where: { direction: "inbound", status: "needs_review" } }) : 0;
  const status = adapterStatus();
  return (
    <DialerProvider enabled={user.role === "owner"}>
      <div className="flex min-h-screen flex-col">
        <DemoBanner status={status} />
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur">
          <Link href={user.role === "tech" ? "/tech" : user.role === "bookkeeper" ? "/reports" : "/"} className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Snowflake className="size-4" />
            </span>
            <span className="hidden sm:inline">Cooler Calls</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            {user.role === "owner" && <NotificationsBell />}
            <UserMenu name={user.name} role={user.role} />
          </div>
        </header>
        <div className="flex flex-1">
          <SideNav role={user.role as Role} inboxCount={inboxCount} />
          <main id="main" className="min-w-0 flex-1 px-4 pb-24 pt-5 md:px-8 md:pb-10">
            {children}
          </main>
        </div>
        <BottomNav role={user.role as Role} inboxCount={inboxCount} />
      </div>
    </DialerProvider>
  );
}

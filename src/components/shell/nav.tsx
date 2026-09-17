"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, FileText, Inbox, KanbanSquare, Phone, Sun, Users, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { can, type Permission } from "@/lib/auth/permissions";
import type { Role } from "@/lib/domain/types";

const ITEMS: { href: string; label: string; icon: typeof Sun; perm: Permission }[] = [
  { href: "/", label: "Today", icon: Sun, perm: "view:today" },
  { href: "/inbox", label: "Inbox", icon: Inbox, perm: "view:inbox" },
  { href: "/dialer", label: "Dialer", icon: Phone, perm: "view:dialer" },
  { href: "/jobs", label: "Jobs", icon: KanbanSquare, perm: "view:jobs" },
  { href: "/customers", label: "Customers", icon: Users, perm: "view:customers" },
  { href: "/quotes", label: "Quotes", icon: FileText, perm: "view:quotes" },
  { href: "/schedule", label: "Schedule", icon: CalendarDays, perm: "view:schedule" },
  { href: "/reports", label: "Reports", icon: BarChart3, perm: "view:reports" },
  { href: "/tech", label: "Tech view", icon: Wrench, perm: "view:tech" },
];

export function navItemsFor(role: Role) {
  return ITEMS.filter((i) => can(role, i.perm) && !(role === "owner" && i.href === "/tech"));
}

export function SideNav({ role, inboxCount }: { role: Role; inboxCount: number }) {
  const path = usePathname();
  const items = navItemsFor(role);
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  return (
    <nav aria-label="Main" className="hidden w-56 shrink-0 flex-col gap-1 border-r border-border bg-card p-3 md:flex">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active(it.href) ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition",
              active(it.href) ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            <span className="flex-1">{it.label}</span>
            {it.href === "/inbox" && inboxCount > 0 && (
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", active(it.href) ? "bg-white/20" : "bg-destructive text-white")} aria-label={`${inboxCount} need review`}>
                {inboxCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ role, inboxCount }: { role: Role; inboxCount: number }) {
  const path = usePathname();
  const items = navItemsFor(role).slice(0, 5);
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  if (items.length <= 1) return null;
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active(it.href) ? "page" : undefined}
                className={cn("relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", active(it.href) ? "text-primary" : "text-muted-foreground")}
              >
                <Icon className="size-5" />
                {it.label}
                {it.href === "/inbox" && inboxCount > 0 && <span className="absolute right-[calc(50%-1.5rem)] top-1.5 size-2 rounded-full bg-destructive" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

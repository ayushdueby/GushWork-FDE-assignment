"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { timeAgo } from "@/lib/rules/dates";

interface Item {
  id: string;
  text: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Polls every 20s so a quote accepted on the public page shows up for Denise without a refresh. */
export function NotificationsBell() {
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const load = () =>
      fetch("/api/notifications", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => data && setItems(data.items ?? []))
        .catch(() => {
          /* offline — try again next tick */
        });
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, []);

  const unread = items.filter((i) => !i.readAt).length;

  async function markRead() {
    if (!unread) return;
    await fetch("/api/notifications", { method: "POST" }).catch(() => {});
    setItems((cur) => cur.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })));
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) markRead();
      }}
    >
      <DropdownMenuTrigger className="relative grid size-11 place-items-center rounded-lg hover:bg-muted" aria-label={unread ? `${unread} new notifications` : "Notifications"}>
        <Bell className="size-5" />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 grid min-w-5 place-items-center rounded-full bg-destructive px-1 text-[11px] font-bold text-white">{unread}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 && <div className="px-3 py-4 text-sm text-muted-foreground">Nothing new.</div>}
        {items.slice(0, 12).map((n) => (
          <DropdownMenuItem key={n.id} render={n.href ? <Link href={n.href} /> : <div />} className="flex flex-col items-start gap-0.5 py-2">
            <span className={n.readAt ? "text-foreground/80" : "font-medium"}>{n.text}</span>
            <span className="text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

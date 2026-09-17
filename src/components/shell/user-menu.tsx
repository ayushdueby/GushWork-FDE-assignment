"use client";

import Link from "next/link";
import { ChevronDown, LogOut, Repeat } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function UserMenu({ name, role }: { name: string; role: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm hover:bg-muted" aria-label="Account menu">
        <span className="grid size-8 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {name
            .split(" ")
            .map((p) => p[0])
            .join("")
            .slice(0, 2)}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block leading-tight font-medium">{name}</span>
          <span className="block text-xs capitalize leading-tight text-muted-foreground">{role}</span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
          {name} <span className="font-normal capitalize text-muted-foreground">· {role}</span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/login?switch=1" />}>
          <Repeat className="size-4" /> Switch user / role
        </DropdownMenuItem>
        <form action="/api/auth/logout" method="post">
          <DropdownMenuItem render={<button type="submit" className="w-full" />}>
            <LogOut className="size-4" /> Sign out
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

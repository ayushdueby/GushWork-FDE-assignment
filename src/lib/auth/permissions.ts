import type { Role } from "@/lib/domain/types";

/**
 * Who can do what. Enforced on the server (proxy.ts, server actions, route handlers),
 * and only *then* used to hide links in the UI.
 */
export type Permission =
  | "view:today"
  | "view:inbox"
  | "view:dialer"
  | "view:jobs"
  | "view:customers"
  | "view:quotes"
  | "view:schedule"
  | "view:reports"
  | "view:tech"
  | "write:crm" // jobs, customers, messages, calls, schedule
  | "write:quotes"
  | "write:tech" // on my way / mark done for own jobs
  | "admin"; // reset demo data, settings

const GRANTS: Record<Role, Permission[]> = {
  owner: ["view:today", "view:inbox", "view:dialer", "view:jobs", "view:customers", "view:quotes", "view:schedule", "view:reports", "view:tech", "write:crm", "write:quotes", "write:tech", "admin"],
  bookkeeper: ["view:reports", "view:quotes", "view:customers"],
  tech: ["view:tech", "write:tech"],
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return GRANTS[role]?.includes(permission) ?? false;
}

/** Where each role lands after login. */
export function homeFor(role: Role): string {
  if (role === "tech") return "/tech";
  if (role === "bookkeeper") return "/reports";
  return "/";
}

/** Page prefix → permission needed to open it. Longest prefix wins. */
export const PAGE_PERMISSIONS: [string, Permission][] = [
  ["/inbox", "view:inbox"],
  ["/dialer", "view:dialer"],
  ["/jobs", "view:jobs"],
  ["/customers", "view:customers"],
  ["/quotes", "view:quotes"],
  ["/schedule", "view:schedule"],
  ["/reports", "view:reports"],
  ["/tech", "view:tech"],
  ["/settings", "admin"],
  ["/api/ai", "view:today"],
  ["/api/calls", "view:dialer"],
  ["/api/reports", "view:reports"],
  ["/api/quotes", "view:quotes"],
  ["/api/notifications", "view:today"],
  ["/api/gmail", "admin"],
  ["/", "view:today"],
];

export function permissionForPath(pathname: string): Permission {
  let best: [string, Permission] | null = null;
  for (const entry of PAGE_PERMISSIONS) {
    const [prefix] = entry;
    const match = prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(prefix + "/");
    if (match && (!best || prefix.length > best[0].length)) best = entry;
  }
  return best ? best[1] : "view:today";
}

/** Public routes never require a session. */
export const PUBLIC_PREFIXES = ["/login", "/request", "/q/", "/api/public", "/api/webhooks", "/api/health", "/api/auth"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p) || pathname.startsWith(p.replace(/\/$/, "") + "/"));
}

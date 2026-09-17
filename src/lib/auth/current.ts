import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@/lib/domain/types";
import { can, homeFor, type Permission } from "./permissions";
import { SESSION_COOKIE, readSessionToken, type SessionPayload } from "./session";

export type CurrentUser = SessionPayload;

/** Cached per request. Null when logged out. */
export const currentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  return readSessionToken(jar.get(SESSION_COOKIE)?.value);
});

export class PermissionError extends Error {
  status = 403;
  constructor(msg = "You don't have permission to do that.") {
    super(msg);
  }
}

/** For server actions and route handlers: throws (403) instead of redirecting. */
export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) throw new PermissionError("Please sign in.");
  if (!can(user.role, permission)) throw new PermissionError();
  return user;
}

/** For pages: redirects to login or the role's home. */
export async function requirePage(permission: Permission): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!can(user.role, permission)) redirect(homeFor(user.role as Role) + "?denied=1");
  return user;
}

export function isReadOnly(user: CurrentUser | null): boolean {
  return !user || !can(user.role, "write:crm");
}

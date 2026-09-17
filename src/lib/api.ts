import { NextResponse } from "next/server";
import { PermissionError, requirePermission, type CurrentUser } from "@/lib/auth/current";
import type { Permission } from "@/lib/auth/permissions";

/** Route-handler wrapper: permission check + uniform JSON errors. */
export function api(permission: Permission, handler: (req: Request, ctx: { user: CurrentUser; params: Record<string, string> }) => Promise<Response>) {
  return async (req: Request, context: { params: Promise<Record<string, string>> }) => {
    try {
      const user = await requirePermission(permission);
      const params = await context.params;
      return await handler(req, { user, params });
    } catch (err) {
      if (err instanceof PermissionError) return NextResponse.json({ error: err.message }, { status: err.status });
      console.error("[api]", err);
      return NextResponse.json({ error: err instanceof Error ? err.message : "Something went wrong" }, { status: 400 });
    }
  };
}

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

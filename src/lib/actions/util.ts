import { revalidatePath } from "next/cache";
import { PermissionError, requirePermission, type CurrentUser } from "@/lib/auth/current";
import type { Permission } from "@/lib/auth/permissions";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Every server action: check permission, run, translate throws into {ok:false}. */
export async function guarded<T extends object>(permission: Permission, fn: (user: CurrentUser) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const user = await requirePermission(permission);
    const data = await fn(user);
    return { ok: true, ...data };
  } catch (err) {
    if (!(err instanceof PermissionError)) console.error("[action]", err);
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export function refreshAll() {
  revalidatePath("/", "layout");
}

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
export const num = (fd: FormData, k: string): number | null => {
  const v = str(fd, k);
  if (!v) return null;
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

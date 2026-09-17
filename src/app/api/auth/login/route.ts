import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { homeFor } from "@/lib/auth/permissions";
import { SESSION_COOKIE, cookieOptions, createSessionToken } from "@/lib/auth/session";
import type { Role } from "@/lib/domain/types";
import { seedIfEmpty } from "@/lib/seed/seed";

/** Demo login: pick a user, no password. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const userId = String(form?.get("userId") ?? "");
  const next = String(form?.get("next") ?? "");
  await seedIfEmpty(db);
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "Pick a user." }, { status: 400 });
  const token = await createSessionToken({ userId: user.id, role: user.role as Role, name: user.name, techId: user.techId ?? null });
  const dest = next.startsWith("/") && !next.startsWith("//") ? next : homeFor(user.role as Role);
  const res = NextResponse.redirect(new URL(dest, req.url), { status: 303 });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions());
  return res;
}

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth/current";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ items: [] }, { status: 401 });
  const items = await db.notification.findMany({ where: { forRole: user.role }, orderBy: { createdAt: "desc" }, take: 30 });
  return NextResponse.json({ items });
}

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  await db.notification.updateMany({ where: { forRole: user.role, readAt: null }, data: { readAt: new Date() } });
  return NextResponse.json({ ok: true });
}

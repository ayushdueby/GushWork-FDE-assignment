import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, time: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "db error" }, { status: 500 });
  }
}

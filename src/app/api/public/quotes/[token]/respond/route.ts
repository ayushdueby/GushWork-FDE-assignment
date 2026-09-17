import { NextResponse } from "next/server";
import { respondToQuote } from "@/lib/services/quotes";
import { clientIp, rateLimit } from "@/lib/util/rate-limit";

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const rl = rateLimit(`quote:${clientIp(req)}`, 20, 10 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const ct = req.headers.get("content-type") ?? "";
  const raw = ct.includes("application/json") ? await req.json().catch(() => ({})) : Object.fromEntries((await req.formData().catch(() => new FormData())).entries());
  const decision = String(raw.decision ?? "");
  const comment = raw.comment == null ? null : String(raw.comment).slice(0, 1000);
  const wantsHtml = !ct.includes("application/json");
  if (decision !== "accept" && decision !== "decline") {
    return wantsHtml ? NextResponse.redirect(new URL(`/q/${token}?error=${encodeURIComponent("Pick accept or decline.")}`, req.url), { status: 303 }) : NextResponse.json({ error: "decision must be accept or decline" }, { status: 400 });
  }
  try {
    const r = await respondToQuote(token, decision, comment);
    if (wantsHtml) return NextResponse.redirect(new URL(`/q/${token}?done=1`, req.url), { status: 303 });
    return NextResponse.json({ ok: true, status: r.status, alreadyAnswered: r.alreadyAnswered }, { status: r.alreadyAnswered ? 409 : 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Something went wrong";
    if (wantsHtml) return NextResponse.redirect(new URL(`/q/${token}?error=${encodeURIComponent(msg)}`, req.url), { status: 303 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

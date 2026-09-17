import { NextResponse } from "next/server";
import { z } from "zod";
import { ingestMessage } from "@/lib/pipeline/ingest";
import { clientIp, rateLimit } from "@/lib/util/rate-limit";

/** Her website's contact form posts here. Same pipeline as email and SMS. */
const Body = z.object({
  name: z.string().trim().min(1, "Your name is required").max(120),
  business: z.string().trim().max(160).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  email: z.string().trim().max(160).optional().default(""),
  address: z.string().trim().max(240).optional().default(""),
  equipment: z.string().trim().max(40).optional().default(""),
  urgent: z.union([z.literal("on"), z.literal("true"), z.literal("1"), z.literal("")]).optional(),
  message: z.string().trim().min(5, "Tell us a little about the problem").max(5000),
  website: z.string().optional(), // honeypot: bots fill it, humans can't see it
});

export async function POST(req: Request) {
  const rl = rateLimit(`request:${clientIp(req)}`, 10, 10 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests. Try again in a few minutes." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const ct = req.headers.get("content-type") ?? "";
  const raw = ct.includes("application/json") ? await req.json().catch(() => ({})) : Object.fromEntries((await req.formData().catch(() => new FormData())).entries());
  const parsed = Body.safeParse(raw);
  const wantsHtml = !ct.includes("application/json");
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Please check the form.";
    if (wantsHtml) return NextResponse.redirect(new URL(`/request?error=${encodeURIComponent(msg)}`, req.url), { status: 303 });
    return NextResponse.json({ error: msg, issues: parsed.error.issues }, { status: 400 });
  }
  const d = parsed.data;
  if (d.website) {
    // Honeypot tripped: pretend it worked, create nothing.
    return wantsHtml ? NextResponse.redirect(new URL("/request/thanks", req.url), { status: 303 }) : NextResponse.json({ ok: true });
  }
  if (!d.phone && !d.email) {
    const msg = "Add a phone number or an email so we can reach you.";
    return wantsHtml ? NextResponse.redirect(new URL(`/request?error=${encodeURIComponent(msg)}`, req.url), { status: 303 }) : NextResponse.json({ error: msg }, { status: 400 });
  }

  const body = [`Name: ${d.name}`, d.business && `Business: ${d.business}`, d.phone && `Phone: ${d.phone}`, d.email && `Email: ${d.email}`, d.address && `Address: ${d.address}`, d.equipment && `Equipment: ${d.equipment}`, d.urgent ? "Urgent: yes — equipment is down" : "", `Message: ${d.message}`].filter(Boolean).join("\n");
  const r = await ingestMessage({ channel: "web_form", from: d.email || d.phone || d.name, to: "website", subject: `Website request from ${d.business || d.name}`, body, raw: JSON.stringify(raw), actor: "website" });
  if (wantsHtml) return NextResponse.redirect(new URL("/request/thanks", req.url), { status: 303 });
  return NextResponse.json({ ok: true, jobId: r.jobId, duplicate: r.duplicate });
}

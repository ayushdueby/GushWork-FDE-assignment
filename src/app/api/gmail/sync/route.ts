import { NextResponse } from "next/server";
import { syncGmailAction } from "@/lib/actions/inbox";

/** Cron-friendly endpoint (owner session or CRON_SECRET header). */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("x-cron-secret") === secret) {
    const { ingestMessage } = await import("@/lib/pipeline/ingest");
    const { gmailConfigured, gmailFetchInbox } = await import("@/integrations/email/gmail");
    if (!gmailConfigured()) return NextResponse.json({ ok: false, error: "Gmail not configured" }, { status: 400 });
    const msgs = await gmailFetchInbox(20);
    for (const m of msgs) await ingestMessage({ channel: "email", from: m.from, to: m.to, subject: m.subject, body: m.text, externalId: `gmail-${m.id}`, receivedAt: m.receivedAt, actor: "gmail sync" });
    return NextResponse.json({ ok: true, synced: msgs.length });
  }
  const res = await syncGmailAction();
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}

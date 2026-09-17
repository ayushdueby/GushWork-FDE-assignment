import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/current";

/** Step 2: exchange the code for a refresh token and show it so it can be stored as GMAIL_REFRESH_TOKEN. */
export async function GET(req: Request) {
  try {
    await requirePermission("admin");
  } catch {
    return NextResponse.json({ error: "Owner only" }, { status: 403 });
  }
  const code = new URL(req.url).searchParams.get("code");
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });
  const redirectUri = `${process.env.APP_URL ?? new URL(req.url).origin}/api/gmail/callback`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.GMAIL_CLIENT_ID ?? "", client_secret: process.env.GMAIL_CLIENT_SECRET ?? "", redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const json = (await res.json()) as { refresh_token?: string; error?: string };
  if (!json.refresh_token) return NextResponse.json({ error: json.error ?? "No refresh token returned; try again with prompt=consent" }, { status: 400 });
  // Deliberately not persisted to the DB: secrets live in env. Shown once for the owner to copy.
  return new NextResponse(`<html><body style="font-family:system-ui;padding:2rem"><h1>Mailbox connected</h1><p>Add this to your environment as <code>GMAIL_REFRESH_TOKEN</code>, redeploy, then use “Sync Gmail” in the Inbox.</p><pre style="background:#f4f4f5;padding:1rem;border-radius:8px">${json.refresh_token}</pre><a href="/inbox">Back to Inbox</a></body></html>`, { headers: { "Content-Type": "text/html" } });
}

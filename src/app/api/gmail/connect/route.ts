import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/current";

/** Step 1 of "Connect mailbox": send the owner to Google's consent screen. */
export async function GET(req: Request) {
  try {
    await requirePermission("admin");
  } catch {
    return NextResponse.json({ error: "Owner only" }, { status: 403 });
  }
  const clientId = process.env.GMAIL_CLIENT_ID;
  if (!clientId || !process.env.GMAIL_CLIENT_SECRET) {
    return NextResponse.redirect(new URL("/inbox?gmail=missing-keys", req.url));
  }
  const redirectUri = `${process.env.APP_URL ?? new URL(req.url).origin}/api/gmail/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send",
  });
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

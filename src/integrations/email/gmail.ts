import type { EmailAdapter, EmailMessage, SendResult } from "../types";

/**
 * Gmail through the REST API with an OAuth refresh token. Active only when
 * GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN are set
 * (the refresh token is obtained with the "Connect mailbox" flow in /api/gmail/connect).
 */
export function gmailConfigured(): boolean {
  return !!(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN);
}

export async function gmailAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Gmail token refresh failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

function toBase64Url(s: string): string {
  return Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const gmailEmail: EmailAdapter = {
  name: "Gmail",
  kind: "real",
  async send(msg: EmailMessage): Promise<SendResult> {
    try {
      const token = await gmailAccessToken();
      const from = process.env.GMAIL_FROM ?? "me";
      const raw = [`From: ${from}`, `To: ${msg.to}`, `Subject: ${msg.subject}`, "Content-Type: text/plain; charset=utf-8", "", msg.text].join("\r\n");
      const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw: toBase64Url(raw) }),
      });
      if (!res.ok) return { ok: false, error: `Gmail send failed: ${res.status}` };
      const json = (await res.json()) as { id: string };
      return { ok: true, id: json.id };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Gmail error" };
    }
  },
};

export interface GmailInbound {
  id: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  receivedAt: Date;
}

/** Pull recent unread inbox messages (used by /api/gmail/sync). */
export async function gmailFetchInbox(max = 20): Promise<GmailInbound[]> {
  const token = await gmailAccessToken();
  const headers = { Authorization: `Bearer ${token}` };
  const list = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}&q=${encodeURIComponent("in:inbox is:unread")}`, { headers });
  if (!list.ok) throw new Error(`Gmail list failed: ${list.status}`);
  const { messages = [] } = (await list.json()) as { messages?: { id: string }[] };
  const out: GmailInbound[] = [];
  for (const m of messages) {
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, { headers });
    if (!res.ok) continue;
    const full = (await res.json()) as { id: string; internalDate: string; payload: { headers: { name: string; value: string }[]; body?: { data?: string }; parts?: { mimeType: string; body?: { data?: string } }[] } };
    const h = (name: string) => full.payload.headers.find((x) => x.name.toLowerCase() === name)?.value ?? "";
    const part = full.payload.parts?.find((p) => p.mimeType === "text/plain") ?? full.payload.parts?.[0];
    const data = part?.body?.data ?? full.payload.body?.data ?? "";
    const text = data ? Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8") : "";
    out.push({ id: full.id, from: h("from"), to: h("to"), subject: h("subject"), text, receivedAt: new Date(Number(full.internalDate)) });
  }
  return out;
}

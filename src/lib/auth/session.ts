import type { Role } from "@/lib/domain/types";

/**
 * Demo login: pick a user, no password. The cookie is HMAC-signed so a role can't be
 * forged by editing it; it is *not* meant to be real authentication (see README).
 */
export const SESSION_COOKIE = "cc_session";
const MAX_AGE_SEC = 30 * 24 * 3600;

function secret(): string {
  return process.env.SESSION_SECRET?.trim() || "cooler-calls-demo-secret";
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64url(new Uint8Array(sig));
}

export interface SessionPayload {
  userId: string;
  role: Role;
  name: string;
  techId: string | null;
  exp: number;
}

export async function createSessionToken(p: Omit<SessionPayload, "exp">, now = Date.now()): Promise<string> {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ ...p, exp: now + MAX_AGE_SEC * 1000 })));
  return `${payload}.${await hmac(payload)}`;
}

export async function readSessionToken(token: string | undefined | null, now = Date.now()): Promise<SessionPayload | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = await hmac(payload);
  if (!timingSafeEqual(expected, sig)) return null;
  try {
    const pad = payload.length % 4 === 0 ? "" : "=".repeat(4 - (payload.length % 4));
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/") + pad);
    const data = JSON.parse(json) as SessionPayload;
    if (typeof data.exp !== "number" || data.exp < now) return null;
    if (!data.userId || !data.role) return null;
    return data;
  } catch {
    return null;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "0",
    path: "/",
    maxAge: MAX_AGE_SEC,
  };
}

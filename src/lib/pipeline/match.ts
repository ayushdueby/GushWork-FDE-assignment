import { phoneDigits } from "@/lib/domain/types";

/**
 * Customer matching used by every inbound channel: phone (exact digits), email (exact,
 * lower-cased), then fuzzy business name. Pure functions so they're easy to test.
 */

const NOISE = new Set(["the", "a", "an", "inc", "llc", "co", "corp", "ltd", "restaurant", "cafe", "café", "and", "&", "of"]);

export function normalizeBusinessName(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !NOISE.has(w))
    .join(" ")
    .trim();
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = s.replace(/\s+/g, " ");
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Sørensen–Dice similarity on character bigrams, 0..1. */
export function similarity(a: string, b: string): number {
  const na = normalizeBusinessName(a);
  const nb = normalizeBusinessName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ga = bigrams(na);
  const gb = bigrams(nb);
  let overlap = 0;
  for (const [g, n] of ga) overlap += Math.min(n, gb.get(g) ?? 0);
  const total = [...ga.values()].reduce((s, n) => s + n, 0) + [...gb.values()].reduce((s, n) => s + n, 0);
  return total === 0 ? 0 : (2 * overlap) / total;
}

export interface MatchCandidate {
  id: string;
  businessName: string;
  phoneDigits: string | null;
  email: string | null;
}

export interface MatchInput {
  phone?: string | null;
  email?: string | null;
  businessName?: string | null;
}

export type MatchResult = { customer: MatchCandidate; by: "phone" | "email" | "name"; confidence: number } | null;

export const FUZZY_THRESHOLD = 0.82;

export function matchCustomer(input: MatchInput, candidates: MatchCandidate[]): MatchResult {
  const digits = phoneDigits(input.phone);
  if (digits.length >= 7) {
    const hit = candidates.find((c) => c.phoneDigits && (c.phoneDigits === digits || c.phoneDigits.endsWith(digits) || digits.endsWith(c.phoneDigits)));
    if (hit) return { customer: hit, by: "phone", confidence: 1 };
  }
  const email = (input.email ?? "").trim().toLowerCase();
  if (email) {
    const hit = candidates.find((c) => c.email && c.email.toLowerCase() === email);
    if (hit) return { customer: hit, by: "email", confidence: 1 };
  }
  if (input.businessName && normalizeBusinessName(input.businessName)) {
    let best: { c: MatchCandidate; s: number } | null = null;
    for (const c of candidates) {
      const s = similarity(input.businessName, c.businessName);
      if (s >= FUZZY_THRESHOLD && (!best || s > best.s)) best = { c, s };
    }
    if (best) return { customer: best.c, by: "name", confidence: best.s };
  }
  return null;
}

import { describe, expect, it } from "vitest";
import { clientIp, rateLimit } from "@/lib/util/rate-limit";

describe("rateLimit", () => {
  it("allows up to the limit, blocks after, and recovers once the window rolls", () => {
    const key = `k-${Math.random()}`;
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) expect(rateLimit(key, 5, 60_000, t0 + i).ok).toBe(true);
    const blocked = rateLimit(key, 5, 60_000, t0 + 10);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(60);
    // Still blocked just before the window rolls, allowed just after.
    expect(rateLimit(key, 5, 60_000, t0 + 59_000).ok).toBe(false);
    expect(rateLimit(key, 5, 60_000, t0 + 61_000).ok).toBe(true);
  });

  it("keys are independent, so one caller can't lock out another", () => {
    const t0 = 2_000_000;
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    for (let i = 0; i < 3; i++) rateLimit(a, 3, 60_000, t0);
    expect(rateLimit(a, 3, 60_000, t0).ok).toBe(false);
    expect(rateLimit(b, 3, 60_000, t0).ok).toBe(true);
  });
});

describe("clientIp", () => {
  it("prefers the first x-forwarded-for hop, then x-real-ip, then a local fallback", () => {
    expect(clientIp(new Request("http://x/", { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } }))).toBe("203.0.113.7");
    expect(clientIp(new Request("http://x/", { headers: { "x-real-ip": "198.51.100.4" } }))).toBe("198.51.100.4");
    expect(clientIp(new Request("http://x/"))).toBe("local");
  });
});

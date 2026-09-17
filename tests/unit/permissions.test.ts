import { describe, expect, it } from "vitest";
import { can, homeFor, isPublicPath, permissionForPath } from "@/lib/auth/permissions";
import { createSessionToken, readSessionToken } from "@/lib/auth/session";

describe("permissions", () => {
  it("owner can do everything; bookkeeper is read-only on three areas; tech only the tech view", () => {
    expect(can("owner", "admin")).toBe(true);
    expect(can("owner", "write:crm")).toBe(true);
    expect(can("bookkeeper", "view:reports")).toBe(true);
    expect(can("bookkeeper", "view:quotes")).toBe(true);
    expect(can("bookkeeper", "view:customers")).toBe(true);
    expect(can("bookkeeper", "write:quotes")).toBe(false);
    expect(can("bookkeeper", "write:crm")).toBe(false);
    expect(can("bookkeeper", "view:today")).toBe(false);
    expect(can("tech", "view:tech")).toBe(true);
    expect(can("tech", "write:tech")).toBe(true);
    expect(can("tech", "view:jobs")).toBe(false);
    expect(can("tech", "view:reports")).toBe(false);
    expect(can(null, "view:tech")).toBe(false);
  });
  it("maps paths to the permission they need (longest prefix wins)", () => {
    expect(permissionForPath("/")).toBe("view:today");
    expect(permissionForPath("/jobs/abc")).toBe("view:jobs");
    expect(permissionForPath("/quotes/abc/print")).toBe("view:quotes");
    expect(permissionForPath("/api/calls/x/apply")).toBe("view:dialer");
    expect(permissionForPath("/api/reports/export")).toBe("view:reports");
    expect(permissionForPath("/tech")).toBe("view:tech");
    expect(permissionForPath("/settings")).toBe("admin");
  });
  it("knows the public surface", () => {
    for (const p of ["/login", "/request", "/request/thanks", "/q/abc123", "/api/public/request", "/api/webhooks/twilio/sms", "/api/health"]) expect(isPublicPath(p)).toBe(true);
    for (const p of ["/", "/jobs", "/api/calls", "/quotes/x", "/api/gmail/sync"]) expect(isPublicPath(p)).toBe(false);
  });
  it("sends each role home", () => {
    expect(homeFor("owner")).toBe("/");
    expect(homeFor("bookkeeper")).toBe("/reports");
    expect(homeFor("tech")).toBe("/tech");
  });
});

describe("session tokens", () => {
  it("round-trips and rejects tampering or expiry", async () => {
    const token = await createSessionToken({ userId: "u1", role: "tech", name: "Dev", techId: "t1" });
    const s = await readSessionToken(token);
    expect(s?.role).toBe("tech");
    expect(s?.techId).toBe("t1");
    // Flip the role inside the payload: signature no longer matches.
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()), role: "owner" })).toString("base64url");
    expect(await readSessionToken(`${forged}.${sig}`)).toBeNull();
    expect(await readSessionToken(`${payload}.${sig}x`)).toBeNull();
    expect(await readSessionToken(token, Date.now() + 31 * 86_400_000)).toBeNull();
    expect(await readSessionToken("garbage")).toBeNull();
    expect(await readSessionToken(null)).toBeNull();
  });
});

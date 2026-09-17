import { describe, expect, it } from "vitest";
import { fallbackExtractCall, spokenAmount } from "@/lib/ai/extract-call";
import { parseRequestedDate, proposeChanges } from "@/lib/pipeline/call-diff";

const NOW = new Date(2026, 8, 16, 9, 0); // Wed Sep 16 2026 09:00
const base = { stage: "needs_quote" as const, urgent: false, issue: "Missed call — call back to find out what they need", equipmentType: "other", scheduledFor: null, quoteTotal: null, quoteStatus: null };

describe("spoken amounts", () => {
  it.each([
    ["around eighteen hundred all in", 1800],
    ["should be about six hundred", 600],
    ["two thousand", 2000],
    ["twelve fifty", null],
  ])("%s → %s", (text, n) => {
    expect(spokenAmount(text)).toBe(n);
  });
});

describe("fallback call extraction", () => {
  it("pulls urgency, equipment, amount and decision from the transcript", () => {
    const ex = fallbackExtractCall("Rosa: our walk-in freezer is down and product is thawing. Denise: around eighteen hundred for a compressor. Rosa: go ahead, whatever it takes, today please.");
    expect(ex.urgency).toBe("urgent");
    expect(ex.equipment).toBe("walk-in freezer");
    expect(ex.quoteAmount).toBe(1800);
    expect(ex.decision).toBe("approved");
    expect(ex.requestedDate).toBe("today");
  });
  it("reads dollar figures and declines", () => {
    const ex = fallbackExtractCall("Tom: the $1,059 quote is too expensive, we're going with someone else.");
    expect(ex.quoteAmount).toBe(1059);
    expect(ex.decision).toBe("declined");
  });
});

describe("parseRequestedDate", () => {
  it("resolves weekdays, tomorrow and times", () => {
    expect(parseRequestedDate("Tuesday morning", NOW)?.toString()).toBe(new Date(2026, 8, 22, 9, 0).toString());
    expect(parseRequestedDate("tomorrow at 2", NOW)?.toString()).toBe(new Date(2026, 8, 17, 14, 0).toString());
    expect(parseRequestedDate("Thursday afternoon", NOW)?.toString()).toBe(new Date(2026, 8, 17, 14, 0).toString());
    expect(parseRequestedDate("next Wednesday", NOW)?.toString()).toBe(new Date(2026, 8, 23, 9, 0).toString());
  });
  it("never proposes a time in the past for 'today'", () => {
    const late = new Date(2026, 8, 16, 17, 30);
    expect(parseRequestedDate("today", late)?.toString()).toBe(new Date(2026, 8, 16, 18, 0).toString());
    expect(parseRequestedDate("today", new Date(2026, 8, 16, 23, 30))).toBeNull();
  });
  it("gives up on vague text", () => {
    expect(parseRequestedDate("sometime soon", NOW)).toBeNull();
    expect(parseRequestedDate(null, NOW)).toBeNull();
  });
});

describe("proposeChanges", () => {
  it("urgent + amount on a needs_quote job → urgent, issue, draft quote and a note (no stage jump)", () => {
    const ch = proposeChanges({ issue: "Walk-in freezer down", equipment: "walk-in freezer", urgency: "urgent", quoteAmount: 1800, decision: "approved", requestedDate: "today", nextStep: null, summary: "" }, base, NOW);
    const fields = ch.map((c) => c.field);
    expect(fields).toContain("urgent");
    expect(fields).toContain("equipmentType");
    expect(fields).toContain("issue");
    expect(fields).toContain("quote");
    expect(fields).toContain("note");
    expect(fields).not.toContain("stage");
    expect(ch.find((c) => c.field === "quote")?.new).toBe("$1,800");
  });
  it("a yes on a sent quote → stage approved; with a date → scheduled + visit", () => {
    const quoted = { ...base, stage: "waiting_on_yes" as const, issue: "Walk-in holding 45", equipmentType: "walk-in cooler", quoteTotal: 1059, quoteStatus: "sent" };
    const yes = proposeChanges({ issue: null, equipment: null, urgency: null, quoteAmount: 1059, decision: "approved", requestedDate: null, nextStep: null, summary: "" }, quoted, NOW);
    expect(yes.map((c) => c.field)).toEqual(["stage"]);
    expect(yes[0].value).toBe("approved");
    const dated = proposeChanges({ issue: null, equipment: null, urgency: null, quoteAmount: null, decision: "approved", requestedDate: "Tuesday at 9", nextStep: null, summary: "" }, quoted, NOW);
    expect(dated.map((c) => c.field)).toEqual(["scheduledFor", "stage"]);
    expect(dated.find((c) => c.field === "stage")?.value).toBe("scheduled");
  });
  it("a decline → lost; no-ops when nothing changed", () => {
    const quoted = { ...base, stage: "waiting_on_yes" as const, issue: "Case warm", equipmentType: "reach-in", quoteTotal: 477, quoteStatus: "sent" };
    expect(proposeChanges({ issue: null, equipment: null, urgency: null, quoteAmount: null, decision: "declined", requestedDate: null, nextStep: null, summary: "" }, quoted, NOW).map((c) => c.value)).toEqual(["lost"]);
    expect(proposeChanges({ issue: null, equipment: null, urgency: null, quoteAmount: 477, decision: null, requestedDate: null, nextStep: null, summary: "" }, quoted, NOW)).toEqual([]);
  });
  it("never touches done or lost jobs' stage", () => {
    const done = { ...base, stage: "done" as const };
    expect(proposeChanges({ issue: null, equipment: null, urgency: null, quoteAmount: null, decision: "approved", requestedDate: "Friday", nextStep: null, summary: "" }, done, NOW).some((c) => c.field === "stage")).toBe(false);
  });
});

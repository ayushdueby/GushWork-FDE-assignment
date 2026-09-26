import { describe, expect, it } from "vitest";
import { STAGE_PATH, formatPhone, isEquipmentType, isForwardMove, isOpenStage, isSource, isStage, money, nextStage, phoneDigits } from "@/lib/domain/types";

describe("phone helpers", () => {
  it.each([
    ["(512) 555-0199", "5125550199"],
    ["512.555.0199", "5125550199"],
    ["+1 512 555 0199", "5125550199"],
    ["1-512-555-0199", "5125550199"],
    ["5125550199", "5125550199"],
  ])("digits(%s) drops formatting and the US 1", (input, expected) => {
    expect(phoneDigits(input)).toBe(expected);
  });

  it("keeps an 11-digit non-US number intact and survives junk", () => {
    expect(phoneDigits("+44 20 7946 0958")).toBe("442079460958");
    expect(phoneDigits("")).toBe("");
    expect(phoneDigits(null)).toBe("");
    expect(phoneDigits(undefined)).toBe("");
    expect(phoneDigits("ext. 204")).toBe("204");
  });

  it("every formatting of the same US number shares one matching key", () => {
    const keys = new Set(["(512) 555-0199", "512-555-0199", "+1 512 555 0199", "15125550199"].map(phoneDigits));
    expect(keys.size).toBe(1);
  });

  it("formats 10-digit numbers and passes everything else through", () => {
    expect(formatPhone("5125550199")).toBe("(512) 555-0199");
    expect(formatPhone("+1 (512) 555-0199")).toBe("(512) 555-0199");
    expect(formatPhone("+442079460958")).toBe("+442079460958");
    expect(formatPhone("")).toBe("");
    expect(formatPhone(null)).toBe("");
  });
});

describe("money", () => {
  it("drops cents when whole, keeps them when not, and never prints NaN", () => {
    expect(money(1800)).toBe("$1,800");
    expect(money(443.83)).toBe("$443.83");
    expect(money(0)).toBe("$0");
    expect(money(null)).toBe("$0");
    expect(money(undefined)).toBe("$0");
    expect(money(Number.NaN)).toBe("$0");
  });
});

describe("stage helpers", () => {
  it("walks the forward path and stops at done", () => {
    expect(nextStage("needs_quote")).toBe("waiting_on_yes");
    expect(nextStage("waiting_on_yes")).toBe("approved");
    expect(nextStage("approved")).toBe("scheduled");
    expect(nextStage("scheduled")).toBe("done");
    expect(nextStage("done")).toBeNull();
    expect(nextStage("lost")).toBeNull(); // lost is a side exit, not on the path
  });

  it("only forward moves along the path count as contact", () => {
    expect(isForwardMove("needs_quote", "approved")).toBe(true);
    expect(isForwardMove("scheduled", "done")).toBe(true);
    expect(isForwardMove("approved", "needs_quote")).toBe(false);
    expect(isForwardMove("needs_quote", "needs_quote")).toBe(false);
    expect(isForwardMove("waiting_on_yes", "lost")).toBe(false);
    expect(isForwardMove("lost", "approved")).toBe(false);
  });

  it("knows which stages are open, and validates unknown values", () => {
    expect(STAGE_PATH.filter(isOpenStage)).toEqual(["needs_quote", "waiting_on_yes", "approved", "scheduled"]);
    expect(isOpenStage("done")).toBe(false);
    expect(isOpenStage("lost")).toBe(false);
    expect(isStage("approved")).toBe(true);
    expect(isStage("APPROVED")).toBe(false);
    expect(isStage("")).toBe(false);
    expect(isStage(null)).toBe(false);
    expect(isSource("web_form")).toBe(true);
    expect(isSource("pigeon")).toBe(false);
    expect(isEquipmentType("walk-in freezer")).toBe(true);
    expect(isEquipmentType("freezer")).toBe(false);
  });
});

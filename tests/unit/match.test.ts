import { describe, expect, it } from "vitest";
import { matchCustomer, normalizeBusinessName, similarity } from "@/lib/pipeline/match";

const candidates = [
  { id: "a", businessName: "Rosa's Taqueria", phoneDigits: "5125550199", email: "rosa@rosastaqueria.com" },
  { id: "b", businessName: "Big Sky Grocery", phoneDigits: "5125550134", email: "tom@bigskygrocery.com" },
  { id: "c", businessName: "The Copper Kettle Restaurant", phoneDigits: null, email: null },
];

describe("customer matching", () => {
  it("matches by phone regardless of formatting, and phone beats everything", () => {
    expect(matchCustomer({ phone: "(512) 555-0199", email: "tom@bigskygrocery.com" }, candidates)?.customer.id).toBe("a");
    expect(matchCustomer({ phone: "+1 512 555 0134" }, candidates)?.customer.id).toBe("b");
    expect(matchCustomer({ phone: "512.555.0134" }, candidates)?.by).toBe("phone");
  });
  it("matches by email case-insensitively", () => {
    expect(matchCustomer({ email: "TOM@BigSkyGrocery.com" }, candidates)?.customer.id).toBe("b");
  });
  it("fuzzy-matches business names with noise words and typos", () => {
    expect(matchCustomer({ businessName: "Copper Kettle" }, candidates)?.customer.id).toBe("c");
    expect(matchCustomer({ businessName: "Rosas Taqueria Inc" }, candidates)?.customer.id).toBe("a");
    expect(matchCustomer({ businessName: "Big Sky Grocer" }, candidates)?.customer.id).toBe("b");
  });
  it("does not match unrelated names", () => {
    expect(matchCustomer({ businessName: "Harbor Seafood" }, candidates)).toBeNull();
    expect(matchCustomer({ businessName: "" }, candidates)).toBeNull();
    expect(matchCustomer({}, candidates)).toBeNull();
  });
  it("normalises names and measures similarity sanely", () => {
    expect(normalizeBusinessName("The Copper Kettle, Inc.")).toBe("copper kettle");
    expect(similarity("Big Sky Grocery", "Big Sky Grocery")).toBe(1);
    expect(similarity("Big Sky Grocery", "Sushi Zen")).toBeLessThan(0.3);
  });
});

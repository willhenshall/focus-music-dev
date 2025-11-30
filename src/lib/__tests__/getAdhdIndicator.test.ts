import { describe, it, expect } from "vitest";
import { getAdhdIndicator } from "../quizAlgorithm";

describe("getAdhdIndicator", () => {
  it("returns 50 for 'none' (note: 0 || 50 = 50 due to falsy check)", () => {
    // Known quirk: levelMap['none'] = 0, but `0 || 50` returns 50
    expect(getAdhdIndicator({ avatar_2: "none" })).toBe(50);
  });

  it("returns 33 for 'little'", () => {
    expect(getAdhdIndicator({ avatar_2: "little" })).toBe(33);
  });

  it("returns 66 for 'medium'", () => {
    expect(getAdhdIndicator({ avatar_2: "medium" })).toBe(66);
  });

  it("returns 100 for 'lot'", () => {
    expect(getAdhdIndicator({ avatar_2: "lot" })).toBe(100);
  });

  it("returns 50 as fallback for unknown values", () => {
    expect(getAdhdIndicator({ avatar_2: "unknown_value" })).toBe(50);
  });

  it("returns 50 as fallback when avatar_2 is undefined", () => {
    expect(getAdhdIndicator({})).toBe(50);
  });
});

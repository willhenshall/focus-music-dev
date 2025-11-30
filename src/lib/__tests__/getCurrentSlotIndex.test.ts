import { describe, it, expect } from "vitest";
import { getCurrentSlotIndex } from "../slotStrategyEngine";

describe("getCurrentSlotIndex", () => {
  it("returns 1 for first track of session (playCount 0)", () => {
    expect(getCurrentSlotIndex(0, 5)).toBe(1);
  });

  it("returns last slot at end of first cycle", () => {
    expect(getCurrentSlotIndex(4, 5)).toBe(5);
  });

  it("wraps back to 1 after completing a cycle", () => {
    expect(getCurrentSlotIndex(5, 5)).toBe(1);
  });

  it("continues wrapping correctly after multiple cycles", () => {
    expect(getCurrentSlotIndex(10, 5)).toBe(1);
    expect(getCurrentSlotIndex(11, 5)).toBe(2);
  });

  it("works with different slot counts", () => {
    expect(getCurrentSlotIndex(7, 3)).toBe(2);
    expect(getCurrentSlotIndex(0, 10)).toBe(1);
    expect(getCurrentSlotIndex(9, 10)).toBe(10);
  });
});

import { describe, it, expect } from "vitest";
import { getTextColor } from "../colorExtractor";

describe("getTextColor", () => {
  it("returns dark text (#1e293b) for light backgrounds", () => {
    // White background → should return dark text
    expect(getTextColor("rgb(255, 255, 255)")).toBe("#1e293b");
  });

  it("returns white text (#ffffff) for dark backgrounds", () => {
    // Black background → should return white text
    expect(getTextColor("rgb(0, 0, 0)")).toBe("#ffffff");
  });

  it("returns white text for mid-dark backgrounds", () => {
    // Dark gray (luminance < 0.5)
    expect(getTextColor("rgb(50, 50, 50)")).toBe("#ffffff");
  });

  it("returns dark text for mid-light backgrounds", () => {
    // Light gray (luminance > 0.5)
    expect(getTextColor("rgb(200, 200, 200)")).toBe("#1e293b");
  });

  it("returns white text (#ffffff) for invalid/empty input", () => {
    // Edge case: no RGB values found
    expect(getTextColor("")).toBe("#ffffff");
    expect(getTextColor("not-a-color")).toBe("#ffffff");
  });
});

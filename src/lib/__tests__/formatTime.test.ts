import { describe, it, expect } from "vitest";
import { formatTime } from "../enterpriseAudioEngine";

describe("formatTime", () => {
  it('formatTime(65) should equal "1:05"', () => {
    expect(formatTime(65)).toBe("1:05");
  });

  it('formatTime(5) should equal "0:05"', () => {
    expect(formatTime(5)).toBe("0:05");
  });

  it('formatTime(0) should equal "0:00"', () => {
    expect(formatTime(0)).toBe("0:00");
  });
});

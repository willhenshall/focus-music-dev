import { describe, it, expect } from "vitest";
import { calculateBrainType } from "../brainTypeCalculator";

describe("calculateBrainType", () => {
  it("classifies high openness as explorer", () => {
    const result = calculateBrainType({
      openness: 0.8,
      conscientiousness: 0.3,
      extraversion: 0.3,
      agreeableness: 0.5,
      neuroticism: 0.3,
    });
    expect(result.primaryType).toBe("explorer");
  });

  it("classifies high conscientiousness + low openness as systematic_executor", () => {
    const result = calculateBrainType({
      openness: 0.3,
      conscientiousness: 0.8,
      extraversion: 0.3,
      agreeableness: 0.5,
      neuroticism: 0.3,
    });
    expect(result.primaryType).toBe("systematic_executor");
  });

  it("classifies high conscientiousness + high openness as focused_builder", () => {
    const result = calculateBrainType({
      openness: 0.7,
      conscientiousness: 0.8,
      extraversion: 0.3,
      agreeableness: 0.5,
      neuroticism: 0.3,
    });
    expect(result.primaryType).toBe("focused_builder");
  });

  it("classifies high extraversion as collaborator", () => {
    const result = calculateBrainType({
      openness: 0.3,
      conscientiousness: 0.5,
      extraversion: 0.9,
      agreeableness: 0.5,
      neuroticism: 0.3,
    });
    expect(result.primaryType).toBe("collaborator");
  });

  it("classifies high neuroticism as worrier", () => {
    const result = calculateBrainType({
      openness: 0.3,
      conscientiousness: 0.5,
      extraversion: 0.3,
      agreeableness: 0.5,
      neuroticism: 0.9,
    });
    expect(result.primaryType).toBe("worrier");
  });

  it("classifies low conscientiousness as dabbler", () => {
    const result = calculateBrainType({
      openness: 0.3,
      conscientiousness: 0.2,
      extraversion: 0.3,
      agreeableness: 0.5,
      neuroticism: 0.3,
    });
    expect(result.primaryType).toBe("dabbler");
  });

  it("returns dabbler when all scores are zero (low conscientiousness)", () => {
    // When C = 0, dabbler score = (1 - 0) = 1.0, which is highest
    const result = calculateBrainType({
      openness: 0,
      conscientiousness: 0,
      extraversion: 0,
      agreeableness: 0,
      neuroticism: 0,
    });
    expect(result.primaryType).toBe("dabbler");
  });

  it("includes scores object in result", () => {
    const result = calculateBrainType({
      openness: 0.8,
      conscientiousness: 0.5,
      extraversion: 0.5,
      agreeableness: 0.5,
      neuroticism: 0.5,
    });
    expect(result.scores).toBeDefined();
    expect(typeof result.scores.explorer).toBe("number");
  });
});

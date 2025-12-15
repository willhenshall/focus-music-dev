import { describe, it, expect } from "vitest";
import {
  normalizeField,
  calculateDistance,
  evaluateRule,
  evaluateRuleGroups,
  scoreTrack,
  getCurrentSlotIndex,
  FIELD_RANGES,
  type SlotField,
  type SlotRule,
  type SlotRuleGroup,
  type SlotTargets,
  type SlotBoost,
} from "../slotStrategyEngine";

describe("slotStrategyEngine", () => {
  // ============================================================================
  // normalizeField
  // ============================================================================
  describe("normalizeField", () => {
    it("returns 0.5 for null values", () => {
      expect(normalizeField("speed", null)).toBe(0.5);
    });

    it("returns 0.5 for undefined values", () => {
      expect(normalizeField("speed", undefined)).toBe(0.5);
    });

    it("normalizes speed field correctly (range 0-5)", () => {
      expect(normalizeField("speed", 0)).toBe(0);
      expect(normalizeField("speed", 2.5)).toBe(0.5);
      expect(normalizeField("speed", 5)).toBe(1);
    });

    it("normalizes intensity field correctly (range 0-5)", () => {
      expect(normalizeField("intensity", 0)).toBe(0);
      expect(normalizeField("intensity", 5)).toBe(1);
    });

    it("normalizes valence field correctly (range -1 to 1)", () => {
      expect(normalizeField("valence", -1)).toBe(0);
      expect(normalizeField("valence", 0)).toBe(0.5);
      expect(normalizeField("valence", 1)).toBe(1);
    });

    it("normalizes arousal field correctly (range 0-1)", () => {
      expect(normalizeField("arousal", 0)).toBe(0);
      expect(normalizeField("arousal", 0.5)).toBe(0.5);
      expect(normalizeField("arousal", 1)).toBe(1);
    });

    it("normalizes bpm field correctly (range 60-180)", () => {
      expect(normalizeField("bpm", 60)).toBe(0);
      expect(normalizeField("bpm", 120)).toBe(0.5);
      expect(normalizeField("bpm", 180)).toBe(1);
    });

    it("clamps values outside range to [0, 1]", () => {
      expect(normalizeField("speed", -1)).toBe(0);
      expect(normalizeField("speed", 10)).toBe(1);
    });
  });

  // ============================================================================
  // calculateDistance
  // ============================================================================
  describe("calculateDistance", () => {
    describe("null/undefined handling", () => {
      it("returns 1 (max distance) when target is null", () => {
        expect(calculateDistance("speed", null, 3, "near")).toBe(1);
      });

      it("returns 1 (max distance) when value is null", () => {
        expect(calculateDistance("speed", 3, null, "near")).toBe(1);
      });

      it("returns 1 (max distance) when both are undefined", () => {
        expect(calculateDistance("speed", undefined, undefined, "near")).toBe(1);
      });
    });

    describe("exact mode", () => {
      it("returns 0 when values match exactly", () => {
        expect(calculateDistance("speed", 3, 3, "exact")).toBe(0);
      });

      it("returns 1 when values do not match", () => {
        expect(calculateDistance("speed", 3, 4, "exact")).toBe(1);
      });

      it("works with string values", () => {
        expect(calculateDistance("key", "C", "C", "exact")).toBe(0);
        expect(calculateDistance("key", "C", "D", "exact")).toBe(1);
      });
    });

    describe("near mode - numeric fields", () => {
      it("returns 0 for identical values", () => {
        expect(calculateDistance("speed", 3, 3, "near")).toBe(0);
      });

      it("returns correct normalized distance for speed field", () => {
        // Speed range is 0-5, so distance of 2.5 = 0.5 normalized
        const distance = calculateDistance("speed", 0, 2.5, "near");
        expect(distance).toBeCloseTo(0.5);
      });

      it("returns correct normalized distance for valence field", () => {
        // Valence range is -1 to 1, so -1 to 0 = 0.5 normalized distance
        const distance = calculateDistance("valence", -1, 0, "near");
        expect(distance).toBeCloseTo(0.5);
      });
    });

    describe("near mode - musical key field", () => {
      it("returns 0 for same key", () => {
        expect(calculateDistance("key", "C", "C", "near")).toBe(0);
      });

      it("calculates chromatic distance correctly", () => {
        // C to D is 2 semitones, normalized by 6 = 2/6 ≈ 0.333
        const distance = calculateDistance("key", "C", "D", "near");
        expect(distance).toBeCloseTo(2 / 6);
      });

      it("handles wrap-around for opposite keys", () => {
        // C to F# is 6 semitones (opposite side of circle)
        const distance = calculateDistance("key", "C", "F#", "near");
        expect(distance).toBe(1); // 6/6 = 1 (maximum distance)
      });

      it("takes shorter path around chromatic circle", () => {
        // C to B: direct = 11, wrap = 1, should use 1
        const distance = calculateDistance("key", "C", "B", "near");
        expect(distance).toBeCloseTo(1 / 6);
      });
    });
  });

  // ============================================================================
  // evaluateRule
  // ============================================================================
  describe("evaluateRule", () => {
    const createRule = (field: string, operator: string, value: any): SlotRule => ({
      id: "test-rule",
      groupId: "test-group",
      field,
      operator: operator as any,
      value,
    });

    describe("eq operator", () => {
      it("returns true when values match", () => {
        const rule = createRule("genre", "eq", "Acoustical");
        expect(evaluateRule(rule, { genre: "Acoustical" })).toBe(true);
      });

      it("returns false when values do not match", () => {
        const rule = createRule("genre", "eq", "Acoustical");
        expect(evaluateRule(rule, { genre: "Electronic" })).toBe(false);
      });
    });

    describe("neq operator", () => {
      it("returns true when values differ", () => {
        const rule = createRule("genre", "neq", "Acoustical");
        expect(evaluateRule(rule, { genre: "Electronic" })).toBe(true);
      });

      it("returns false when values match", () => {
        const rule = createRule("genre", "neq", "Acoustical");
        expect(evaluateRule(rule, { genre: "Acoustical" })).toBe(false);
      });
    });

    describe("in operator", () => {
      it("returns true when value is in array", () => {
        const rule = createRule("genre", "in", ["Acoustical", "Electronic"]);
        expect(evaluateRule(rule, { genre: "Acoustical" })).toBe(true);
      });

      it("returns false when value is not in array", () => {
        const rule = createRule("genre", "in", ["Acoustical", "Electronic"]);
        expect(evaluateRule(rule, { genre: "Classical" })).toBe(false);
      });
    });

    describe("nin operator", () => {
      it("returns true when value is not in array", () => {
        const rule = createRule("genre", "nin", ["Acoustical", "Electronic"]);
        expect(evaluateRule(rule, { genre: "Classical" })).toBe(true);
      });

      it("returns false when value is in array", () => {
        const rule = createRule("genre", "nin", ["Acoustical", "Electronic"]);
        expect(evaluateRule(rule, { genre: "Acoustical" })).toBe(false);
      });
    });

    describe("gte operator", () => {
      it("returns true when value is greater", () => {
        const rule = createRule("speed", "gte", 3);
        expect(evaluateRule(rule, { speed: 4 })).toBe(true);
      });

      it("returns true when value is equal", () => {
        const rule = createRule("speed", "gte", 3);
        expect(evaluateRule(rule, { speed: 3 })).toBe(true);
      });

      it("returns false when value is less", () => {
        const rule = createRule("speed", "gte", 3);
        expect(evaluateRule(rule, { speed: 2 })).toBe(false);
      });
    });

    describe("lte operator", () => {
      it("returns true when value is less", () => {
        const rule = createRule("speed", "lte", 3);
        expect(evaluateRule(rule, { speed: 2 })).toBe(true);
      });

      it("returns true when value is equal", () => {
        const rule = createRule("speed", "lte", 3);
        expect(evaluateRule(rule, { speed: 3 })).toBe(true);
      });

      it("returns false when value is greater", () => {
        const rule = createRule("speed", "lte", 3);
        expect(evaluateRule(rule, { speed: 4 })).toBe(false);
      });
    });

    describe("between operator", () => {
      it("returns true when value is in range", () => {
        const rule = createRule("speed", "between", [2, 4]);
        expect(evaluateRule(rule, { speed: 3 })).toBe(true);
      });

      it("returns true when value equals lower bound", () => {
        const rule = createRule("speed", "between", [2, 4]);
        expect(evaluateRule(rule, { speed: 2 })).toBe(true);
      });

      it("returns true when value equals upper bound", () => {
        const rule = createRule("speed", "between", [2, 4]);
        expect(evaluateRule(rule, { speed: 4 })).toBe(true);
      });

      it("returns false when value is outside range", () => {
        const rule = createRule("speed", "between", [2, 4]);
        expect(evaluateRule(rule, { speed: 5 })).toBe(false);
      });
    });

    describe("exists operator", () => {
      it("returns true when field exists and value is true", () => {
        const rule = createRule("genre", "exists", true);
        expect(evaluateRule(rule, { genre: "Acoustical" })).toBe(true);
      });

      it("returns false when field is null and value is true", () => {
        const rule = createRule("genre", "exists", true);
        expect(evaluateRule(rule, { genre: null })).toBe(false);
      });

      it("returns true when field is null and value is false", () => {
        const rule = createRule("genre", "exists", false);
        expect(evaluateRule(rule, { genre: null })).toBe(true);
      });
    });

    describe("SQL-style metadata fields", () => {
      it("handles metadata->> field syntax", () => {
        const rule = createRule("metadata->>'genre'", "eq", "Acoustical");
        expect(evaluateRule(rule, { genre: "Acoustical" })).toBe(true);
      });
    });
  });

  // ============================================================================
  // evaluateRuleGroups
  // ============================================================================
  describe("evaluateRuleGroups", () => {
    const createGroup = (
      logic: "AND" | "OR",
      rules: Array<{ field: string; operator: string; value: any }>
    ): SlotRuleGroup => ({
      id: "test-group",
      strategyId: "test-strategy",
      logic,
      order: 0,
      rules: rules.map((r, i) => ({
        id: `rule-${i}`,
        groupId: "test-group",
        field: r.field,
        operator: r.operator as any,
        value: r.value,
      })),
    });

    it("returns true for empty groups array", () => {
      expect(evaluateRuleGroups([], { genre: "Acoustical" })).toBe(true);
    });

    it("returns true for group with empty rules", () => {
      const group = createGroup("AND", []);
      expect(evaluateRuleGroups([group], { genre: "Acoustical" })).toBe(true);
    });

    describe("AND logic", () => {
      it("returns true when all rules pass", () => {
        const group = createGroup("AND", [
          { field: "genre", operator: "eq", value: "Acoustical" },
          { field: "speed", operator: "gte", value: 2 },
        ]);
        expect(evaluateRuleGroups([group], { genre: "Acoustical", speed: 3 })).toBe(true);
      });

      it("returns false when any rule fails", () => {
        const group = createGroup("AND", [
          { field: "genre", operator: "eq", value: "Acoustical" },
          { field: "speed", operator: "gte", value: 5 },
        ]);
        expect(evaluateRuleGroups([group], { genre: "Acoustical", speed: 3 })).toBe(false);
      });
    });

    describe("OR logic", () => {
      it("returns true when any rule passes", () => {
        const group = createGroup("OR", [
          { field: "genre", operator: "eq", value: "Electronic" },
          { field: "speed", operator: "gte", value: 2 },
        ]);
        expect(evaluateRuleGroups([group], { genre: "Acoustical", speed: 3 })).toBe(true);
      });

      it("returns false when all rules fail", () => {
        const group = createGroup("OR", [
          { field: "genre", operator: "eq", value: "Electronic" },
          { field: "speed", operator: "gte", value: 5 },
        ]);
        expect(evaluateRuleGroups([group], { genre: "Acoustical", speed: 3 })).toBe(false);
      });
    });

    describe("multiple groups (implicit AND)", () => {
      it("returns true when all groups pass", () => {
        const group1 = createGroup("AND", [{ field: "genre", operator: "eq", value: "Acoustical" }]);
        const group2 = createGroup("AND", [{ field: "speed", operator: "gte", value: 2 }]);
        expect(evaluateRuleGroups([group1, group2], { genre: "Acoustical", speed: 3 })).toBe(true);
      });

      it("returns false when any group fails", () => {
        const group1 = createGroup("AND", [{ field: "genre", operator: "eq", value: "Acoustical" }]);
        const group2 = createGroup("AND", [{ field: "speed", operator: "gte", value: 5 }]);
        expect(evaluateRuleGroups([group1, group2], { genre: "Acoustical", speed: 3 })).toBe(false);
      });
    });
  });

  // ============================================================================
  // scoreTrack
  // ============================================================================
  describe("scoreTrack", () => {
    const defaultTargets: SlotTargets = {
      speed: 3,
      intensity: 3,
      brightness: 3,
    };

    const defaultBoosts: SlotBoost[] = [
      { id: "b1", strategyId: "s1", field: "speed", mode: "near", weight: 1 },
      { id: "b2", strategyId: "s1", field: "intensity", mode: "near", weight: 1 },
      { id: "b3", strategyId: "s1", field: "brightness", mode: "near", weight: 1 },
    ];

    it("returns perfect score (1.0) for exact match", () => {
      const metadata = { speed: 3, intensity: 3, brightness: 3 };
      const result = scoreTrack(defaultTargets, defaultBoosts, metadata);
      expect(result.score).toBe(1);
    });

    it("returns lower score for mismatched values", () => {
      const metadata = { speed: 0, intensity: 0, brightness: 0 };
      const result = scoreTrack(defaultTargets, defaultBoosts, metadata);
      expect(result.score).toBeLessThan(1);
    });

    it("applies weight correctly", () => {
      const targets: SlotTargets = { speed: 3, intensity: 3 };
      const highWeightBoosts: SlotBoost[] = [
        { id: "b1", strategyId: "s1", field: "speed", mode: "near", weight: 10 },
        { id: "b2", strategyId: "s1", field: "intensity", mode: "near", weight: 1 },
      ];

      // Speed matches, intensity doesn't
      const metadata = { speed: 3, intensity: 0 };
      const result = scoreTrack(targets, highWeightBoosts, metadata);

      // Score should be weighted toward speed (which matches)
      expect(result.score).toBeGreaterThan(0.5);
    });

    it("ignores fields not in targets", () => {
      const targets: SlotTargets = { speed: 3 };
      const boosts: SlotBoost[] = [
        { id: "b1", strategyId: "s1", field: "speed", mode: "near", weight: 1 },
        { id: "b2", strategyId: "s1", field: "intensity", mode: "near", weight: 1 },
      ];
      const metadata = { speed: 3, intensity: 0 };
      const result = scoreTrack(targets, boosts, metadata);
      // Only speed should be considered since intensity is not in targets
      expect(result.score).toBe(1);
    });

    it("ignores null/undefined metadata values", () => {
      const targets: SlotTargets = { speed: 3, intensity: 3 };
      const boosts: SlotBoost[] = [
        { id: "b1", strategyId: "s1", field: "speed", mode: "near", weight: 1 },
        { id: "b2", strategyId: "s1", field: "intensity", mode: "near", weight: 1 },
      ];
      const metadata = { speed: 3, intensity: null };
      const result = scoreTrack(targets, boosts, metadata);
      // Only speed should contribute to score
      expect(result.score).toBe(1);
    });

    it("returns distances for each scored field", () => {
      const metadata = { speed: 3, intensity: 3, brightness: 3 };
      const result = scoreTrack(defaultTargets, defaultBoosts, metadata);
      expect(result.distances).toHaveProperty("speed");
      expect(result.distances).toHaveProperty("intensity");
      expect(result.distances).toHaveProperty("brightness");
      expect(result.distances.speed).toBe(0);
    });

    it("returns 0 score when no boosts are weighted", () => {
      const result = scoreTrack(defaultTargets, [], { speed: 3 });
      expect(result.score).toBe(0);
    });
  });

  // ============================================================================
  // getCurrentSlotIndex (already tested in separate file, but included for completeness)
  // ============================================================================
  describe("getCurrentSlotIndex", () => {
    it("returns 1 for first track of session", () => {
      expect(getCurrentSlotIndex(0, 5)).toBe(1);
    });

    it("wraps correctly after a full cycle", () => {
      expect(getCurrentSlotIndex(5, 5)).toBe(1);
    });

    it("handles large play counts", () => {
      expect(getCurrentSlotIndex(1000, 20)).toBe(1);
      expect(getCurrentSlotIndex(1001, 20)).toBe(2);
    });
  });
});


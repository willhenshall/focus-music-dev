import { describe, it, expect } from 'vitest';
import {
  getActiveEnergyLevels,
  getEnergyLevelClassName,
  getEnergyDisplay,
  getEnergySortScore,
  getEnergyExportValue,
  getPrimaryEnergyLevel,
  energyLevelToBooleans,
  hasEnergyDefined,
  matchesEnergyLevel,
  type EnergyBooleans,
} from '../energyFieldUtils';

/**
 * Unit tests for Energy Field Utilities
 * 
 * Tests the consolidated energy field logic that derives display from boolean fields.
 * This is part of the energy field consolidation to deprecate the legacy `energy_level` string.
 */

describe('energyFieldUtils', () => {
  // Test data representing different track energy configurations
  const trackLowOnly: EnergyBooleans = { energy_low: true, energy_medium: false, energy_high: false };
  const trackMediumOnly: EnergyBooleans = { energy_low: false, energy_medium: true, energy_high: false };
  const trackHighOnly: EnergyBooleans = { energy_low: false, energy_medium: false, energy_high: true };
  const trackLowAndMedium: EnergyBooleans = { energy_low: true, energy_medium: true, energy_high: false };
  const trackLowAndHigh: EnergyBooleans = { energy_low: true, energy_medium: false, energy_high: true };
  const trackMediumAndHigh: EnergyBooleans = { energy_low: false, energy_medium: true, energy_high: true };
  const trackAllEnergy: EnergyBooleans = { energy_low: true, energy_medium: true, energy_high: true };
  const trackNoEnergy: EnergyBooleans = { energy_low: false, energy_medium: false, energy_high: false };
  const trackUndefined: EnergyBooleans = {};

  describe('getActiveEnergyLevels', () => {
    it('returns ["low"] for track with only low energy', () => {
      expect(getActiveEnergyLevels(trackLowOnly)).toEqual(['low']);
    });

    it('returns ["medium"] for track with only medium energy', () => {
      expect(getActiveEnergyLevels(trackMediumOnly)).toEqual(['medium']);
    });

    it('returns ["high"] for track with only high energy', () => {
      expect(getActiveEnergyLevels(trackHighOnly)).toEqual(['high']);
    });

    it('returns ["low", "medium"] for track with low and medium energy', () => {
      expect(getActiveEnergyLevels(trackLowAndMedium)).toEqual(['low', 'medium']);
    });

    it('returns ["low", "high"] for track with low and high energy', () => {
      expect(getActiveEnergyLevels(trackLowAndHigh)).toEqual(['low', 'high']);
    });

    it('returns ["medium", "high"] for track with medium and high energy', () => {
      expect(getActiveEnergyLevels(trackMediumAndHigh)).toEqual(['medium', 'high']);
    });

    it('returns ["low", "medium", "high"] for track with all energy levels', () => {
      expect(getActiveEnergyLevels(trackAllEnergy)).toEqual(['low', 'medium', 'high']);
    });

    it('returns empty array for track with no energy levels', () => {
      expect(getActiveEnergyLevels(trackNoEnergy)).toEqual([]);
    });

    it('returns empty array for track with undefined energy fields', () => {
      expect(getActiveEnergyLevels(trackUndefined)).toEqual([]);
    });
  });

  describe('getEnergyLevelClassName', () => {
    it('returns green class for low energy', () => {
      expect(getEnergyLevelClassName('low')).toBe('bg-green-100 text-green-800');
    });

    it('returns yellow class for medium energy', () => {
      expect(getEnergyLevelClassName('medium')).toBe('bg-yellow-100 text-yellow-800');
    });

    it('returns red class for high energy', () => {
      expect(getEnergyLevelClassName('high')).toBe('bg-red-100 text-red-800');
    });
  });

  describe('getEnergyDisplay', () => {
    it('returns "low" label with green class for low-only track', () => {
      const result = getEnergyDisplay(trackLowOnly);
      expect(result.levels).toEqual(['low']);
      expect(result.label).toBe('low');
      expect(result.className).toBe('bg-green-100 text-green-800');
      expect(result.isMultiEnergy).toBe(false);
      expect(result.isUndefined).toBe(false);
    });

    it('returns "medium" label with yellow class for medium-only track', () => {
      const result = getEnergyDisplay(trackMediumOnly);
      expect(result.levels).toEqual(['medium']);
      expect(result.label).toBe('medium');
      expect(result.className).toBe('bg-yellow-100 text-yellow-800');
      expect(result.isMultiEnergy).toBe(false);
      expect(result.isUndefined).toBe(false);
    });

    it('returns "high" label with red class for high-only track', () => {
      const result = getEnergyDisplay(trackHighOnly);
      expect(result.levels).toEqual(['high']);
      expect(result.label).toBe('high');
      expect(result.className).toBe('bg-red-100 text-red-800');
      expect(result.isMultiEnergy).toBe(false);
      expect(result.isUndefined).toBe(false);
    });

    it('returns abbreviated label "L/M" with purple class for low+medium track', () => {
      const result = getEnergyDisplay(trackLowAndMedium);
      expect(result.levels).toEqual(['low', 'medium']);
      expect(result.label).toBe('L/M');
      expect(result.className).toBe('bg-purple-100 text-purple-800');
      expect(result.isMultiEnergy).toBe(true);
      expect(result.isUndefined).toBe(false);
    });

    it('returns abbreviated label "L/H" with purple class for low+high track', () => {
      const result = getEnergyDisplay(trackLowAndHigh);
      expect(result.levels).toEqual(['low', 'high']);
      expect(result.label).toBe('L/H');
      expect(result.className).toBe('bg-purple-100 text-purple-800');
      expect(result.isMultiEnergy).toBe(true);
      expect(result.isUndefined).toBe(false);
    });

    it('returns abbreviated label "L/M/H" with purple class for all-energy track', () => {
      const result = getEnergyDisplay(trackAllEnergy);
      expect(result.levels).toEqual(['low', 'medium', 'high']);
      expect(result.label).toBe('L/M/H');
      expect(result.className).toBe('bg-purple-100 text-purple-800');
      expect(result.isMultiEnergy).toBe(true);
      expect(result.isUndefined).toBe(false);
    });

    it('returns "not defined" label with slate class for no-energy track', () => {
      const result = getEnergyDisplay(trackNoEnergy);
      expect(result.levels).toEqual([]);
      expect(result.label).toBe('not defined');
      expect(result.className).toBe('bg-slate-100 text-slate-600');
      expect(result.isMultiEnergy).toBe(false);
      expect(result.isUndefined).toBe(true);
    });

    it('returns "N/A" label with slate class for null track', () => {
      const result = getEnergyDisplay(null);
      expect(result.levels).toEqual([]);
      expect(result.label).toBe('N/A');
      expect(result.className).toBe('bg-slate-100 text-slate-800');
      expect(result.isMultiEnergy).toBe(false);
      expect(result.isUndefined).toBe(true);
    });

    it('returns "N/A" label with slate class for undefined track', () => {
      const result = getEnergyDisplay(undefined);
      expect(result.levels).toEqual([]);
      expect(result.label).toBe('N/A');
      expect(result.className).toBe('bg-slate-100 text-slate-800');
      expect(result.isMultiEnergy).toBe(false);
      expect(result.isUndefined).toBe(true);
    });
  });

  describe('getEnergySortScore', () => {
    it('returns 1 for low-only track', () => {
      expect(getEnergySortScore(trackLowOnly)).toBe(1);
    });

    it('returns 2 for medium-only track', () => {
      expect(getEnergySortScore(trackMediumOnly)).toBe(2);
    });

    it('returns 3 for high-only track', () => {
      expect(getEnergySortScore(trackHighOnly)).toBe(3);
    });

    it('returns 2 for low+medium track (highest of the two)', () => {
      expect(getEnergySortScore(trackLowAndMedium)).toBe(2);
    });

    it('returns 3 for low+high track (highest of the two)', () => {
      expect(getEnergySortScore(trackLowAndHigh)).toBe(3);
    });

    it('returns 3 for all-energy track (highest)', () => {
      expect(getEnergySortScore(trackAllEnergy)).toBe(3);
    });

    it('returns 0 for no-energy track', () => {
      expect(getEnergySortScore(trackNoEnergy)).toBe(0);
    });

    it('returns 0 for null track', () => {
      expect(getEnergySortScore(null)).toBe(0);
    });

    it('returns 0 for undefined track', () => {
      expect(getEnergySortScore(undefined)).toBe(0);
    });

    it('correctly sorts tracks by energy level', () => {
      const tracks = [
        trackHighOnly,
        trackNoEnergy,
        trackMediumOnly,
        trackLowOnly,
        trackAllEnergy,
      ];
      const sorted = [...tracks].sort((a, b) => getEnergySortScore(a) - getEnergySortScore(b));
      
      expect(sorted[0]).toBe(trackNoEnergy);     // score 0
      expect(sorted[1]).toBe(trackLowOnly);       // score 1
      expect(sorted[2]).toBe(trackMediumOnly);    // score 2
      // Both high-only and all-energy have score 3
      expect([trackHighOnly, trackAllEnergy]).toContain(sorted[3]);
      expect([trackHighOnly, trackAllEnergy]).toContain(sorted[4]);
    });
  });

  describe('getEnergyExportValue', () => {
    it('returns "low" for low-only track', () => {
      expect(getEnergyExportValue(trackLowOnly)).toBe('low');
    });

    it('returns "medium" for medium-only track', () => {
      expect(getEnergyExportValue(trackMediumOnly)).toBe('medium');
    });

    it('returns "high" for high-only track', () => {
      expect(getEnergyExportValue(trackHighOnly)).toBe('high');
    });

    it('returns "low, medium" for low+medium track', () => {
      expect(getEnergyExportValue(trackLowAndMedium)).toBe('low, medium');
    });

    it('returns "low, high" for low+high track', () => {
      expect(getEnergyExportValue(trackLowAndHigh)).toBe('low, high');
    });

    it('returns "low, medium, high" for all-energy track', () => {
      expect(getEnergyExportValue(trackAllEnergy)).toBe('low, medium, high');
    });

    it('returns empty string for no-energy track', () => {
      expect(getEnergyExportValue(trackNoEnergy)).toBe('');
    });

    it('returns empty string for null track', () => {
      expect(getEnergyExportValue(null)).toBe('');
    });
  });

  describe('getPrimaryEnergyLevel', () => {
    it('returns "low" for low-only track', () => {
      expect(getPrimaryEnergyLevel(trackLowOnly)).toBe('low');
    });

    it('returns "medium" for medium-only track', () => {
      expect(getPrimaryEnergyLevel(trackMediumOnly)).toBe('medium');
    });

    it('returns "high" for high-only track', () => {
      expect(getPrimaryEnergyLevel(trackHighOnly)).toBe('high');
    });

    it('returns "medium" for low+medium track (higher priority)', () => {
      expect(getPrimaryEnergyLevel(trackLowAndMedium)).toBe('medium');
    });

    it('returns "high" for low+high track (higher priority)', () => {
      expect(getPrimaryEnergyLevel(trackLowAndHigh)).toBe('high');
    });

    it('returns "high" for all-energy track (highest priority)', () => {
      expect(getPrimaryEnergyLevel(trackAllEnergy)).toBe('high');
    });

    it('returns null for no-energy track', () => {
      expect(getPrimaryEnergyLevel(trackNoEnergy)).toBeNull();
    });

    it('returns null for null track', () => {
      expect(getPrimaryEnergyLevel(null)).toBeNull();
    });
  });

  describe('energyLevelToBooleans', () => {
    it('converts "low" to correct boolean fields', () => {
      expect(energyLevelToBooleans('low')).toEqual({
        energy_low: true,
        energy_medium: false,
        energy_high: false,
      });
    });

    it('converts "medium" to correct boolean fields', () => {
      expect(energyLevelToBooleans('medium')).toEqual({
        energy_low: false,
        energy_medium: true,
        energy_high: false,
      });
    });

    it('converts "high" to correct boolean fields', () => {
      expect(energyLevelToBooleans('high')).toEqual({
        energy_low: false,
        energy_medium: false,
        energy_high: true,
      });
    });

    it('converts null to all-false boolean fields', () => {
      expect(energyLevelToBooleans(null)).toEqual({
        energy_low: false,
        energy_medium: false,
        energy_high: false,
      });
    });

    it('converts undefined to all-false boolean fields', () => {
      expect(energyLevelToBooleans(undefined)).toEqual({
        energy_low: false,
        energy_medium: false,
        energy_high: false,
      });
    });
  });

  describe('hasEnergyDefined', () => {
    it('returns true for low-only track', () => {
      expect(hasEnergyDefined(trackLowOnly)).toBe(true);
    });

    it('returns true for medium-only track', () => {
      expect(hasEnergyDefined(trackMediumOnly)).toBe(true);
    });

    it('returns true for high-only track', () => {
      expect(hasEnergyDefined(trackHighOnly)).toBe(true);
    });

    it('returns true for multi-energy track', () => {
      expect(hasEnergyDefined(trackAllEnergy)).toBe(true);
    });

    it('returns false for no-energy track', () => {
      expect(hasEnergyDefined(trackNoEnergy)).toBe(false);
    });

    it('returns false for null track', () => {
      expect(hasEnergyDefined(null)).toBe(false);
    });

    it('returns false for undefined track', () => {
      expect(hasEnergyDefined(undefined)).toBe(false);
    });
  });

  describe('matchesEnergyLevel', () => {
    describe('matching "low" energy', () => {
      it('returns true for track with low energy', () => {
        expect(matchesEnergyLevel(trackLowOnly, 'low')).toBe(true);
      });

      it('returns true for multi-energy track with low', () => {
        expect(matchesEnergyLevel(trackAllEnergy, 'low')).toBe(true);
      });

      it('returns false for track without low energy', () => {
        expect(matchesEnergyLevel(trackHighOnly, 'low')).toBe(false);
      });
    });

    describe('matching "medium" energy', () => {
      it('returns true for track with medium energy', () => {
        expect(matchesEnergyLevel(trackMediumOnly, 'medium')).toBe(true);
      });

      it('returns true for multi-energy track with medium', () => {
        expect(matchesEnergyLevel(trackMediumAndHigh, 'medium')).toBe(true);
      });

      it('returns false for track without medium energy', () => {
        expect(matchesEnergyLevel(trackLowOnly, 'medium')).toBe(false);
      });
    });

    describe('matching "high" energy', () => {
      it('returns true for track with high energy', () => {
        expect(matchesEnergyLevel(trackHighOnly, 'high')).toBe(true);
      });

      it('returns true for multi-energy track with high', () => {
        expect(matchesEnergyLevel(trackLowAndHigh, 'high')).toBe(true);
      });

      it('returns false for track without high energy', () => {
        expect(matchesEnergyLevel(trackMediumOnly, 'high')).toBe(false);
      });
    });

    it('returns false for null track', () => {
      expect(matchesEnergyLevel(null, 'low')).toBe(false);
      expect(matchesEnergyLevel(null, 'medium')).toBe(false);
      expect(matchesEnergyLevel(null, 'high')).toBe(false);
    });
  });
});

describe('Energy Field Integration Tests', () => {
  // Simulate real track data scenarios from the database
  
  describe('Track Upload Scenario', () => {
    it('correctly converts user selection to database fields', () => {
      // User selects "high" in the upload modal
      const userSelection = 'high' as const;
      const dbFields = energyLevelToBooleans(userSelection);
      
      // Verify database fields are correct
      expect(dbFields.energy_high).toBe(true);
      expect(dbFields.energy_medium).toBe(false);
      expect(dbFields.energy_low).toBe(false);
      
      // Verify display would be correct after save
      const display = getEnergyDisplay(dbFields);
      expect(display.label).toBe('high');
      expect(display.className).toBe('bg-red-100 text-red-800');
    });
  });

  describe('Music Library Display Scenario', () => {
    it('correctly displays single energy level track', () => {
      // Track from database with only medium energy
      const trackFromDb = {
        energy_low: false,
        energy_medium: true,
        energy_high: false,
      };
      
      const display = getEnergyDisplay(trackFromDb);
      expect(display.label).toBe('medium');
      expect(display.className).toContain('yellow');
      expect(display.isMultiEnergy).toBe(false);
    });

    it('correctly displays multi-energy track', () => {
      // Track from database with low and high energy (e.g., versatile ambient track)
      const trackFromDb = {
        energy_low: true,
        energy_medium: false,
        energy_high: true,
      };
      
      const display = getEnergyDisplay(trackFromDb);
      expect(display.label).toBe('L/H');
      expect(display.className).toContain('purple');
      expect(display.isMultiEnergy).toBe(true);
      expect(display.levels).toEqual(['low', 'high']);
    });
  });

  describe('CSV Export Scenario', () => {
    it('exports single energy level correctly', () => {
      const track = { energy_low: true, energy_medium: false, energy_high: false };
      expect(getEnergyExportValue(track)).toBe('low');
    });

    it('exports multi-energy levels as comma-separated', () => {
      const track = { energy_low: true, energy_medium: true, energy_high: false };
      expect(getEnergyExportValue(track)).toBe('low, medium');
    });

    it('exports empty string for undefined energy', () => {
      const track = { energy_low: false, energy_medium: false, energy_high: false };
      expect(getEnergyExportValue(track)).toBe('');
    });
  });

  describe('Track Sorting Scenario', () => {
    it('sorts tracks correctly by energy level ascending', () => {
      const tracks = [
        { id: 1, energy_low: false, energy_medium: false, energy_high: true },  // high (3)
        { id: 2, energy_low: true, energy_medium: false, energy_high: false },  // low (1)
        { id: 3, energy_low: false, energy_medium: true, energy_high: false },  // medium (2)
        { id: 4, energy_low: false, energy_medium: false, energy_high: false }, // none (0)
      ];
      
      const sortedAsc = [...tracks].sort((a, b) => 
        getEnergySortScore(a) - getEnergySortScore(b)
      );
      
      expect(sortedAsc.map(t => t.id)).toEqual([4, 2, 3, 1]);
    });

    it('sorts tracks correctly by energy level descending', () => {
      const tracks = [
        { id: 1, energy_low: true, energy_medium: false, energy_high: false },  // low (1)
        { id: 2, energy_low: false, energy_medium: false, energy_high: true },  // high (3)
        { id: 3, energy_low: false, energy_medium: true, energy_high: false },  // medium (2)
      ];
      
      const sortedDesc = [...tracks].sort((a, b) => 
        getEnergySortScore(b) - getEnergySortScore(a)
      );
      
      expect(sortedDesc.map(t => t.id)).toEqual([2, 3, 1]);
    });
  });

  describe('Channel Playlist Filtering Scenario', () => {
    it('filters tracks that match low energy playlist', () => {
      const tracks = [
        { id: 1, energy_low: true, energy_medium: false, energy_high: false },
        { id: 2, energy_low: true, energy_medium: true, energy_high: false }, // multi-energy
        { id: 3, energy_low: false, energy_medium: true, energy_high: false },
        { id: 4, energy_low: false, energy_medium: false, energy_high: true },
      ];
      
      const lowEnergyTracks = tracks.filter(t => matchesEnergyLevel(t, 'low'));
      expect(lowEnergyTracks.map(t => t.id)).toEqual([1, 2]); // Both match "low"
    });

    it('filters tracks that match multiple energy levels', () => {
      const tracks = [
        { id: 1, energy_low: true, energy_medium: false, energy_high: false },
        { id: 2, energy_low: true, energy_medium: true, energy_high: true }, // all energies
        { id: 3, energy_low: false, energy_medium: true, energy_high: true },
      ];
      
      // Track 2 should appear in all three playlists
      expect(matchesEnergyLevel(tracks[1], 'low')).toBe(true);
      expect(matchesEnergyLevel(tracks[1], 'medium')).toBe(true);
      expect(matchesEnergyLevel(tracks[1], 'high')).toBe(true);
    });
  });
});

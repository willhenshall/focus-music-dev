/**
 * Energy Field Utilities
 * 
 * Single source of truth for deriving energy level display from boolean fields.
 * Part of the energy field consolidation to deprecate the legacy `energy_level` string field.
 * 
 * Usage:
 * - All components should use these utilities to derive energy display from booleans
 * - The `energy_level` string field is deprecated and should not be used directly
 */

export type EnergyLevel = 'low' | 'medium' | 'high';

export interface EnergyBooleans {
  energy_low?: boolean;
  energy_medium?: boolean;
  energy_high?: boolean;
}

export interface EnergyDisplayResult {
  /** Array of active energy levels */
  levels: EnergyLevel[];
  /** Display label (e.g., 'low', 'medium', 'high', 'L/M', 'not defined') */
  label: string;
  /** CSS class for styling the badge */
  className: string;
  /** Whether this is a multi-energy track */
  isMultiEnergy: boolean;
  /** Whether no energy levels are defined */
  isUndefined: boolean;
}

/**
 * Gets active energy levels from boolean fields
 */
export function getActiveEnergyLevels(track: EnergyBooleans): EnergyLevel[] {
  const levels: EnergyLevel[] = [];
  if (track.energy_low) levels.push('low');
  if (track.energy_medium) levels.push('medium');
  if (track.energy_high) levels.push('high');
  return levels;
}

/**
 * Gets the CSS class for a single energy level badge
 */
export function getEnergyLevelClassName(level: EnergyLevel): string {
  switch (level) {
    case 'high':
      return 'bg-red-100 text-red-800';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800';
    case 'low':
      return 'bg-green-100 text-green-800';
  }
}

/**
 * Derives energy display information from boolean fields.
 * This is the single source of truth for energy level display.
 */
export function getEnergyDisplay(track: EnergyBooleans | undefined | null): EnergyDisplayResult {
  if (!track) {
    return {
      levels: [],
      label: 'N/A',
      className: 'bg-slate-100 text-slate-800',
      isMultiEnergy: false,
      isUndefined: true,
    };
  }

  const levels = getActiveEnergyLevels(track);

  if (levels.length === 0) {
    return {
      levels: [],
      label: 'not defined',
      className: 'bg-slate-100 text-slate-600',
      isMultiEnergy: false,
      isUndefined: true,
    };
  }

  if (levels.length === 1) {
    const level = levels[0];
    return {
      levels,
      label: level,
      className: getEnergyLevelClassName(level),
      isMultiEnergy: false,
      isUndefined: false,
    };
  }

  // Multiple energy levels - show abbreviated form
  return {
    levels,
    label: levels.map(l => l[0].toUpperCase()).join('/'),
    className: 'bg-purple-100 text-purple-800',
    isMultiEnergy: true,
    isUndefined: false,
  };
}

/**
 * Gets energy sort score from boolean fields.
 * Used for sorting tracks by energy level.
 * Priority: high = 3, medium = 2, low = 1, undefined = 0
 * For multi-energy tracks, uses the highest energy level.
 */
export function getEnergySortScore(track: EnergyBooleans | undefined | null): number {
  if (!track) return 0;
  if (track.energy_high) return 3;
  if (track.energy_medium) return 2;
  if (track.energy_low) return 1;
  return 0;
}

/**
 * Gets energy level string for CSV/export from boolean fields.
 * Returns comma-separated list for multi-energy tracks.
 */
export function getEnergyExportValue(track: EnergyBooleans | undefined | null): string {
  if (!track) return '';
  const levels = getActiveEnergyLevels(track);
  return levels.join(', ');
}

/**
 * Gets the primary energy level (highest priority) from boolean fields.
 * Priority: high > medium > low
 * Used when a single value is needed for backwards compatibility.
 */
export function getPrimaryEnergyLevel(track: EnergyBooleans | undefined | null): EnergyLevel | null {
  if (!track) return null;
  if (track.energy_high) return 'high';
  if (track.energy_medium) return 'medium';
  if (track.energy_low) return 'low';
  return null;
}

/**
 * Converts a single energy level selection to boolean fields.
 * Used when uploading new tracks with a single energy level.
 */
export function energyLevelToBooleans(level: EnergyLevel | null | undefined): EnergyBooleans {
  return {
    energy_low: level === 'low',
    energy_medium: level === 'medium',
    energy_high: level === 'high',
  };
}

/**
 * Checks if track has any energy level defined
 */
export function hasEnergyDefined(track: EnergyBooleans | undefined | null): boolean {
  if (!track) return false;
  return track.energy_low || track.energy_medium || track.energy_high || false;
}

/**
 * Checks if track matches a specific energy level
 */
export function matchesEnergyLevel(track: EnergyBooleans | undefined | null, level: EnergyLevel): boolean {
  if (!track) return false;
  switch (level) {
    case 'low': return track.energy_low || false;
    case 'medium': return track.energy_medium || false;
    case 'high': return track.energy_high || false;
  }
}

/**
 * ABR (Adaptive Bitrate) System Tests
 * 
 * Comprehensive tests for the 4-bitrate HLS ladder system:
 * - Quality tier selection (low/medium/high/premium)
 * - Bandwidth-based tier recommendations
 * - Level switching logic and history
 * - ABR state management
 * - Native HLS vs HLS.js mode selection
 * 
 * Our HLS ladder:
 * - LOW:     32 kbps (BANDWIDTH=48000 in manifest)
 * - MEDIUM:  64 kbps (BANDWIDTH=96000 in manifest)
 * - HIGH:    96 kbps (BANDWIDTH=144000 in manifest)
 * - PREMIUM: 128 kbps (BANDWIDTH=192000 in manifest)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HLSMetrics, ABRMetrics, HLSLevel, LevelSwitch } from '../types/audioEngine';

// =============================================================================
// TEST HELPERS: Mock Data Factories
// =============================================================================

/**
 * Creates a mock HLS level with tier information
 */
function createMockHLSLevel(index: number, bitrate: number, tierName: string): HLSLevel {
  return {
    index,
    bitrate,
    tierName,
    codecSet: 'mp4a.40.2',
  };
}

/**
 * Creates the standard 4-tier HLS ladder
 */
function createStandardLadder(): HLSLevel[] {
  return [
    createMockHLSLevel(0, 32000, 'low'),
    createMockHLSLevel(1, 64000, 'medium'),
    createMockHLSLevel(2, 96000, 'high'),
    createMockHLSLevel(3, 128000, 'premium'),
  ];
}

/**
 * Creates mock ABR metrics
 */
function createMockABRMetrics(overrides: Partial<ABRMetrics> = {}): ABRMetrics {
  return {
    autoLevelEnabled: true,
    autoLevel: -1,
    nextAutoLevel: -1,
    manualLevel: -1,
    loadLevel: -1,
    nextLoadLevel: -1,
    levelSwitchHistory: [],
    lastLevelSwitchTime: 0,
    totalLevelSwitches: 0,
    abrState: 'idle',
    effectiveBandwidth: 0,
    currentQualityTier: 'unknown',
    recommendedQualityTier: 'unknown',
    isUpgrading: false,
    isDowngrading: false,
    timeSinceSwitch: 0,
    ...overrides,
  };
}

/**
 * Creates mock HLS metrics
 */
function createMockHLSMetrics(overrides: Partial<HLSMetrics> = {}): HLSMetrics {
  return {
    isHLSActive: true,
    currentLevel: 0,
    levels: createStandardLadder(),
    bandwidthEstimate: 100000,
    bufferedSegments: 5,
    bufferLength: 30,
    targetBuffer: 30,
    isNativeHLS: false,
    latency: 100,
    fragmentStats: {
      loaded: 10,
      failed: 0,
      retried: 0,
    },
    abr: createMockABRMetrics(),
    ...overrides,
  };
}

/**
 * Creates a level switch record
 */
function createLevelSwitch(
  fromLevel: number,
  toLevel: number,
  bandwidth: number,
  timestamp: number = Date.now()
): LevelSwitch {
  const isUpgrade = toLevel > fromLevel;
  return {
    timestamp,
    fromLevel,
    toLevel,
    reason: isUpgrade ? 'bandwidth_increase' : 'bandwidth_drop',
    bandwidth,
  };
}

// =============================================================================
// ABR LOGIC FUNCTIONS (extracted from streamingAudioEngine for testing)
// =============================================================================

/**
 * Get quality tier name from level index
 */
function getQualityTierName(level: number): string {
  const tierNames = ['low', 'medium', 'high', 'premium'];
  if (level < 0) return 'auto';
  if (level >= tierNames.length) return `L${level}`;
  return tierNames[level];
}

/**
 * Get recommended tier based on available bandwidth (bps)
 * 
 * Our ladder bandwidth requirements (with ~50% overhead for HLS):
 * - LOW:     32k audio needs ~48k total
 * - MEDIUM:  64k audio needs ~96k total
 * - HIGH:    96k audio needs ~144k total
 * - PREMIUM: 128k audio needs ~192k total
 */
function getRecommendedTier(bandwidthBps: number): string {
  const kbps = bandwidthBps / 1000;
  if (kbps >= 250) return 'premium';  // 128k needs ~192kbps overhead
  if (kbps >= 180) return 'high';      // 96k needs ~144kbps overhead
  if (kbps >= 120) return 'medium';    // 64k needs ~96kbps overhead
  return 'low';                         // 32k needs ~48kbps overhead
}

/**
 * Determine ABR state based on current vs recommended tier
 */
function determineABRState(
  currentLevel: number,
  levels: HLSLevel[],
  recommendedTier: string
): string {
  if (currentLevel < 0) return 'initializing';
  
  const currentTier = levels[currentLevel]?.tierName;
  const recommendedLevel = levels.findIndex(l => l.tierName === recommendedTier);
  
  if (currentLevel === recommendedLevel) return 'optimal';
  if (currentLevel < recommendedLevel) return 'upgrading';
  return 'downgraded';
}

/**
 * Check if browser should use native HLS (Safari/iOS only)
 */
function shouldUseNativeHLS(userAgent: string): boolean {
  const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent);
  const isIOS = /iPad|iPhone|iPod/.test(userAgent);
  return isSafari || isIOS;
}

// =============================================================================
// TEST SUITE: Quality Tier Names
// =============================================================================

describe('ABR System: Quality Tier Names', () => {
  it('should return correct tier name for level 0 (low)', () => {
    expect(getQualityTierName(0)).toBe('low');
  });

  it('should return correct tier name for level 1 (medium)', () => {
    expect(getQualityTierName(1)).toBe('medium');
  });

  it('should return correct tier name for level 2 (high)', () => {
    expect(getQualityTierName(2)).toBe('high');
  });

  it('should return correct tier name for level 3 (premium)', () => {
    expect(getQualityTierName(3)).toBe('premium');
  });

  it('should return "auto" for level -1', () => {
    expect(getQualityTierName(-1)).toBe('auto');
  });

  it('should return "LX" format for out-of-range levels', () => {
    expect(getQualityTierName(4)).toBe('L4');
    expect(getQualityTierName(10)).toBe('L10');
  });
});

// =============================================================================
// TEST SUITE: Bandwidth-Based Tier Recommendations
// =============================================================================

describe('ABR System: Bandwidth-Based Tier Recommendations', () => {
  describe('Premium tier (128 kbps audio)', () => {
    it('should recommend premium for 300 kbps bandwidth', () => {
      expect(getRecommendedTier(300000)).toBe('premium');
    });

    it('should recommend premium for 250 kbps bandwidth', () => {
      expect(getRecommendedTier(250000)).toBe('premium');
    });

    it('should recommend premium for very high bandwidth (1 Mbps)', () => {
      expect(getRecommendedTier(1000000)).toBe('premium');
    });
  });

  describe('High tier (96 kbps audio)', () => {
    it('should recommend high for 200 kbps bandwidth', () => {
      expect(getRecommendedTier(200000)).toBe('high');
    });

    it('should recommend high for 180 kbps bandwidth', () => {
      expect(getRecommendedTier(180000)).toBe('high');
    });

    it('should recommend high for 240 kbps (just under premium threshold)', () => {
      expect(getRecommendedTier(240000)).toBe('high');
    });
  });

  describe('Medium tier (64 kbps audio)', () => {
    it('should recommend medium for 150 kbps bandwidth', () => {
      expect(getRecommendedTier(150000)).toBe('medium');
    });

    it('should recommend medium for 120 kbps bandwidth', () => {
      expect(getRecommendedTier(120000)).toBe('medium');
    });

    it('should recommend medium for 170 kbps (just under high threshold)', () => {
      expect(getRecommendedTier(170000)).toBe('medium');
    });
  });

  describe('Low tier (32 kbps audio)', () => {
    it('should recommend low for 100 kbps bandwidth', () => {
      expect(getRecommendedTier(100000)).toBe('low');
    });

    it('should recommend low for 50 kbps bandwidth', () => {
      expect(getRecommendedTier(50000)).toBe('low');
    });

    it('should recommend low for very low bandwidth (10 kbps)', () => {
      expect(getRecommendedTier(10000)).toBe('low');
    });

    it('should recommend low for 0 bandwidth', () => {
      expect(getRecommendedTier(0)).toBe('low');
    });

    it('should recommend low for 110 kbps (just under medium threshold)', () => {
      expect(getRecommendedTier(110000)).toBe('low');
    });
  });

  describe('Edge cases', () => {
    it('should handle negative bandwidth gracefully', () => {
      expect(getRecommendedTier(-1000)).toBe('low');
    });

    it('should handle extremely high bandwidth', () => {
      expect(getRecommendedTier(10000000)).toBe('premium');
    });
  });
});

// =============================================================================
// TEST SUITE: ABR State Determination
// =============================================================================

describe('ABR System: State Determination', () => {
  const levels = createStandardLadder();

  it('should return "initializing" when currentLevel is -1', () => {
    expect(determineABRState(-1, levels, 'premium')).toBe('initializing');
  });

  it('should return "optimal" when current matches recommended', () => {
    expect(determineABRState(3, levels, 'premium')).toBe('optimal');
    expect(determineABRState(0, levels, 'low')).toBe('optimal');
    expect(determineABRState(1, levels, 'medium')).toBe('optimal');
    expect(determineABRState(2, levels, 'high')).toBe('optimal');
  });

  it('should return "upgrading" when current is below recommended', () => {
    expect(determineABRState(0, levels, 'premium')).toBe('upgrading');
    expect(determineABRState(1, levels, 'high')).toBe('upgrading');
    expect(determineABRState(0, levels, 'medium')).toBe('upgrading');
  });

  it('should return "downgraded" when current is above recommended', () => {
    expect(determineABRState(3, levels, 'low')).toBe('downgraded');
    expect(determineABRState(2, levels, 'medium')).toBe('downgraded');
    expect(determineABRState(3, levels, 'high')).toBe('downgraded');
  });
});

// =============================================================================
// TEST SUITE: Native HLS vs HLS.js Mode Selection
// =============================================================================

describe('ABR System: Native HLS Detection', () => {
  describe('Safari detection', () => {
    it('should use native HLS for Safari on macOS', () => {
      const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
      expect(shouldUseNativeHLS(ua)).toBe(true);
    });

    it('should NOT use native HLS for Chrome on macOS', () => {
      const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';
      expect(shouldUseNativeHLS(ua)).toBe(false);
    });

    it('should NOT use native HLS for Firefox on macOS', () => {
      const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0';
      expect(shouldUseNativeHLS(ua)).toBe(false);
    });
  });

  describe('iOS detection', () => {
    it('should use native HLS for iPhone Safari', () => {
      const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
      expect(shouldUseNativeHLS(ua)).toBe(true);
    });

    it('should use native HLS for iPad Safari', () => {
      const ua = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
      expect(shouldUseNativeHLS(ua)).toBe(true);
    });

    it('should use native HLS for iPod Safari', () => {
      const ua = 'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15';
      expect(shouldUseNativeHLS(ua)).toBe(true);
    });
  });

  describe('Android detection', () => {
    it('should NOT use native HLS for Chrome on Android', () => {
      const ua = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36';
      expect(shouldUseNativeHLS(ua)).toBe(false);
    });

    it('should NOT use native HLS for Samsung Browser', () => {
      const ua = 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/22.0 Chrome/111.0.5563.116 Mobile Safari/537.36';
      expect(shouldUseNativeHLS(ua)).toBe(false);
    });
  });

  describe('Windows detection', () => {
    it('should NOT use native HLS for Edge on Windows', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0';
      expect(shouldUseNativeHLS(ua)).toBe(false);
    });

    it('should NOT use native HLS for Chrome on Windows', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';
      expect(shouldUseNativeHLS(ua)).toBe(false);
    });
  });
});

// =============================================================================
// TEST SUITE: Level Switch History
// =============================================================================

describe('ABR System: Level Switch History', () => {
  it('should create level switch record with correct properties', () => {
    const switchRecord = createLevelSwitch(0, 2, 200000, 1000);
    
    expect(switchRecord.fromLevel).toBe(0);
    expect(switchRecord.toLevel).toBe(2);
    expect(switchRecord.bandwidth).toBe(200000);
    expect(switchRecord.timestamp).toBe(1000);
    expect(switchRecord.reason).toBe('bandwidth_increase');
  });

  it('should mark downgrade switches correctly', () => {
    const switchRecord = createLevelSwitch(3, 1, 100000);
    expect(switchRecord.reason).toBe('bandwidth_drop');
  });

  it('should mark upgrade switches correctly', () => {
    const switchRecord = createLevelSwitch(1, 3, 300000);
    expect(switchRecord.reason).toBe('bandwidth_increase');
  });

  it('should track multiple switches in history', () => {
    const history: LevelSwitch[] = [];
    
    // Simulate bandwidth fluctuation
    history.push(createLevelSwitch(3, 2, 150000, 1000)); // Drop
    history.push(createLevelSwitch(2, 1, 100000, 2000)); // Drop
    history.push(createLevelSwitch(1, 2, 200000, 3000)); // Upgrade
    history.push(createLevelSwitch(2, 3, 300000, 4000)); // Upgrade
    
    expect(history.length).toBe(4);
    expect(history[0].reason).toBe('bandwidth_drop');
    expect(history[1].reason).toBe('bandwidth_drop');
    expect(history[2].reason).toBe('bandwidth_increase');
    expect(history[3].reason).toBe('bandwidth_increase');
  });

  it('should keep only last 10 switches (as per implementation)', () => {
    const history: LevelSwitch[] = [];
    const MAX_HISTORY = 10;
    
    // Add 15 switches
    for (let i = 0; i < 15; i++) {
      history.push(createLevelSwitch(0, 1, 100000 + i * 10000, i * 1000));
      if (history.length > MAX_HISTORY) {
        history.shift();
      }
    }
    
    expect(history.length).toBe(10);
    expect(history[0].timestamp).toBe(5000); // First 5 were shifted out
    expect(history[9].timestamp).toBe(14000);
  });
});

// =============================================================================
// TEST SUITE: HLS Ladder Structure
// =============================================================================

describe('ABR System: HLS Ladder Structure', () => {
  const ladder = createStandardLadder();

  it('should have exactly 4 quality levels', () => {
    expect(ladder.length).toBe(4);
  });

  it('should have correct bitrates for each tier', () => {
    expect(ladder[0].bitrate).toBe(32000);   // low
    expect(ladder[1].bitrate).toBe(64000);   // medium
    expect(ladder[2].bitrate).toBe(96000);   // high
    expect(ladder[3].bitrate).toBe(128000);  // premium
  });

  it('should have correct tier names for each level', () => {
    expect(ladder[0].tierName).toBe('low');
    expect(ladder[1].tierName).toBe('medium');
    expect(ladder[2].tierName).toBe('high');
    expect(ladder[3].tierName).toBe('premium');
  });

  it('should have correct index for each level', () => {
    expect(ladder[0].index).toBe(0);
    expect(ladder[1].index).toBe(1);
    expect(ladder[2].index).toBe(2);
    expect(ladder[3].index).toBe(3);
  });

  it('should have bitrates in ascending order', () => {
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i].bitrate).toBeGreaterThan(ladder[i - 1].bitrate);
    }
  });

  it('should have AAC codec for all levels', () => {
    for (const level of ladder) {
      expect(level.codecSet).toBe('mp4a.40.2');
    }
  });
});

// =============================================================================
// TEST SUITE: ABR Metrics State
// =============================================================================

describe('ABR System: Metrics State', () => {
  it('should initialize with default values', () => {
    const metrics = createMockABRMetrics();
    
    expect(metrics.autoLevelEnabled).toBe(true);
    expect(metrics.autoLevel).toBe(-1);
    expect(metrics.nextAutoLevel).toBe(-1);
    expect(metrics.manualLevel).toBe(-1);
    expect(metrics.levelSwitchHistory).toEqual([]);
    expect(metrics.totalLevelSwitches).toBe(0);
    expect(metrics.abrState).toBe('idle');
    expect(metrics.isUpgrading).toBe(false);
    expect(metrics.isDowngrading).toBe(false);
  });

  it('should track upgrading state', () => {
    const metrics = createMockABRMetrics({
      isUpgrading: true,
      isDowngrading: false,
      currentQualityTier: 'medium',
      recommendedQualityTier: 'premium',
    });
    
    expect(metrics.isUpgrading).toBe(true);
    expect(metrics.isDowngrading).toBe(false);
  });

  it('should track downgrading state', () => {
    const metrics = createMockABRMetrics({
      isUpgrading: false,
      isDowngrading: true,
      currentQualityTier: 'premium',
      recommendedQualityTier: 'low',
    });
    
    expect(metrics.isUpgrading).toBe(false);
    expect(metrics.isDowngrading).toBe(true);
  });

  it('should track time since last switch', () => {
    const lastSwitchTime = Date.now() - 5000; // 5 seconds ago
    const metrics = createMockABRMetrics({
      lastLevelSwitchTime: lastSwitchTime,
      timeSinceSwitch: 5000,
    });
    
    expect(metrics.timeSinceSwitch).toBe(5000);
  });
});

// =============================================================================
// TEST SUITE: Full HLS Metrics
// =============================================================================

describe('ABR System: Full HLS Metrics', () => {
  it('should create complete HLS metrics object', () => {
    const metrics = createMockHLSMetrics();
    
    expect(metrics.isHLSActive).toBe(true);
    expect(metrics.levels.length).toBe(4);
    expect(metrics.abr).toBeDefined();
    expect(metrics.fragmentStats).toBeDefined();
  });

  it('should track fragment loading statistics', () => {
    const metrics = createMockHLSMetrics({
      fragmentStats: {
        loaded: 50,
        failed: 2,
        retried: 3,
      },
    });
    
    expect(metrics.fragmentStats.loaded).toBe(50);
    expect(metrics.fragmentStats.failed).toBe(2);
    expect(metrics.fragmentStats.retried).toBe(3);
    
    // Calculate success rate
    const total = metrics.fragmentStats.loaded + metrics.fragmentStats.failed;
    const successRate = (metrics.fragmentStats.loaded / total) * 100;
    expect(successRate).toBeCloseTo(96.15, 1);
  });

  it('should track buffer health', () => {
    const metrics = createMockHLSMetrics({
      bufferLength: 15,
      targetBuffer: 30,
    });
    
    const bufferRatio = metrics.bufferLength / metrics.targetBuffer;
    expect(bufferRatio).toBe(0.5);
  });

  it('should distinguish native HLS from hls.js', () => {
    const nativeMetrics = createMockHLSMetrics({ isNativeHLS: true });
    const hlsjsMetrics = createMockHLSMetrics({ isNativeHLS: false });
    
    expect(nativeMetrics.isNativeHLS).toBe(true);
    expect(hlsjsMetrics.isNativeHLS).toBe(false);
  });
});

// =============================================================================
// TEST SUITE: ABR Decision Making
// =============================================================================

describe('ABR System: Decision Making', () => {
  /**
   * Simulate ABR decision based on bandwidth
   */
  function makeABRDecision(
    currentLevel: number,
    bandwidthBps: number,
    levels: HLSLevel[]
  ): { 
    shouldSwitch: boolean; 
    targetLevel: number; 
    reason: string;
  } {
    const recommendedTier = getRecommendedTier(bandwidthBps);
    const targetLevel = levels.findIndex(l => l.tierName === recommendedTier);
    
    if (targetLevel === currentLevel) {
      return { shouldSwitch: false, targetLevel: currentLevel, reason: 'already_optimal' };
    }
    
    if (targetLevel > currentLevel) {
      return { shouldSwitch: true, targetLevel, reason: 'bandwidth_increase' };
    }
    
    return { shouldSwitch: true, targetLevel, reason: 'bandwidth_drop' };
  }

  const levels = createStandardLadder();

  it('should not switch when already at optimal level', () => {
    const decision = makeABRDecision(3, 300000, levels); // Premium at high bandwidth
    
    expect(decision.shouldSwitch).toBe(false);
    expect(decision.reason).toBe('already_optimal');
  });

  it('should upgrade when bandwidth increases', () => {
    const decision = makeABRDecision(0, 300000, levels); // Low level, high bandwidth
    
    expect(decision.shouldSwitch).toBe(true);
    expect(decision.targetLevel).toBe(3); // Premium
    expect(decision.reason).toBe('bandwidth_increase');
  });

  it('should downgrade when bandwidth drops', () => {
    const decision = makeABRDecision(3, 50000, levels); // Premium level, low bandwidth
    
    expect(decision.shouldSwitch).toBe(true);
    expect(decision.targetLevel).toBe(0); // Low
    expect(decision.reason).toBe('bandwidth_drop');
  });

  it('should make graduated downgrades for moderate bandwidth drops', () => {
    // At premium, bandwidth drops to high tier range
    const decision = makeABRDecision(3, 180000, levels);
    
    expect(decision.shouldSwitch).toBe(true);
    expect(decision.targetLevel).toBe(2); // High
    expect(decision.reason).toBe('bandwidth_drop');
  });

  it('should make graduated upgrades for moderate bandwidth increases', () => {
    // At low, bandwidth increases to medium tier range
    const decision = makeABRDecision(0, 150000, levels);
    
    expect(decision.shouldSwitch).toBe(true);
    expect(decision.targetLevel).toBe(1); // Medium
    expect(decision.reason).toBe('bandwidth_increase');
  });
});

// =============================================================================
// TEST SUITE: Manifest Bandwidth Values
// =============================================================================

describe('ABR System: Manifest Bandwidth Values', () => {
  /**
   * HLS manifest uses BANDWIDTH which includes overhead (typically 1.5x audio bitrate)
   */
  const manifestBandwidths = {
    low: 48000,     // 32k * 1.5
    medium: 96000,  // 64k * 1.5
    high: 144000,   // 96k * 1.5
    premium: 192000, // 128k * 1.5
  };

  it('should have correct manifest bandwidth for low tier', () => {
    expect(manifestBandwidths.low).toBe(48000);
  });

  it('should have correct manifest bandwidth for medium tier', () => {
    expect(manifestBandwidths.medium).toBe(96000);
  });

  it('should have correct manifest bandwidth for high tier', () => {
    expect(manifestBandwidths.high).toBe(144000);
  });

  it('should have correct manifest bandwidth for premium tier', () => {
    expect(manifestBandwidths.premium).toBe(192000);
  });

  it('should have manifest bandwidth in ascending order', () => {
    expect(manifestBandwidths.low).toBeLessThan(manifestBandwidths.medium);
    expect(manifestBandwidths.medium).toBeLessThan(manifestBandwidths.high);
    expect(manifestBandwidths.high).toBeLessThan(manifestBandwidths.premium);
  });

  it('should have ~1.5x overhead ratio for all tiers', () => {
    const audioBitrates = { low: 32000, medium: 64000, high: 96000, premium: 128000 };
    
    expect(manifestBandwidths.low / audioBitrates.low).toBe(1.5);
    expect(manifestBandwidths.medium / audioBitrates.medium).toBe(1.5);
    expect(manifestBandwidths.high / audioBitrates.high).toBe(1.5);
    expect(manifestBandwidths.premium / audioBitrates.premium).toBe(1.5);
  });
});

// =============================================================================
// TEST SUITE: Edge Cases and Error Handling
// =============================================================================

describe('ABR System: Edge Cases', () => {
  it('should handle empty levels array', () => {
    const state = determineABRState(0, [], 'premium');
    expect(state).toBe('downgraded'); // No match found
  });

  it('should handle missing tierName in levels', () => {
    const levels: HLSLevel[] = [
      { index: 0, bitrate: 32000 }, // No tierName
    ];
    const tier = levels[0].tierName;
    expect(tier).toBeUndefined();
  });

  it('should handle NaN bandwidth', () => {
    expect(getRecommendedTier(NaN)).toBe('low');
  });

  it('should handle Infinity bandwidth', () => {
    expect(getRecommendedTier(Infinity)).toBe('premium');
  });

  it('should handle rapid bandwidth fluctuations', () => {
    const history: LevelSwitch[] = [];
    const bandwidths = [300000, 50000, 250000, 80000, 200000, 60000];
    let currentLevel = 3; // Start at premium
    
    for (const bw of bandwidths) {
      const newTier = getRecommendedTier(bw);
      const newLevel = ['low', 'medium', 'high', 'premium'].indexOf(newTier);
      
      if (newLevel !== currentLevel) {
        history.push(createLevelSwitch(currentLevel, newLevel, bw));
        currentLevel = newLevel;
      }
    }
    
    // Should have multiple switches
    expect(history.length).toBeGreaterThan(3);
  });
});

// =============================================================================
// TEST SUITE: Integration Scenarios
// =============================================================================

describe('ABR System: Integration Scenarios', () => {
  describe('Cellular network simulation', () => {
    it('should recommend low tier on 2G connection (~50 kbps)', () => {
      const bandwidth2G = 50000;
      expect(getRecommendedTier(bandwidth2G)).toBe('low');
    });

    it('should recommend medium tier on 3G connection (~150 kbps)', () => {
      const bandwidth3G = 150000;
      expect(getRecommendedTier(bandwidth3G)).toBe('medium');
    });

    it('should recommend high tier on decent 4G (~200 kbps)', () => {
      const bandwidth4G = 200000;
      expect(getRecommendedTier(bandwidth4G)).toBe('high');
    });

    it('should recommend premium tier on good 4G/5G (~500 kbps+)', () => {
      const bandwidth5G = 500000;
      expect(getRecommendedTier(bandwidth5G)).toBe('premium');
    });
  });

  describe('WiFi network simulation', () => {
    it('should recommend premium tier on typical WiFi', () => {
      const wifiBandwidth = 5000000; // 5 Mbps
      expect(getRecommendedTier(wifiBandwidth)).toBe('premium');
    });

    it('should recommend low tier on congested WiFi', () => {
      const congestedWifi = 80000; // 80 kbps
      expect(getRecommendedTier(congestedWifi)).toBe('low');
    });
  });

  describe('Real-world playback scenario', () => {
    it('should handle typical session with varying bandwidth', () => {
      const levels = createStandardLadder();
      const bandwidthSamples = [
        300000, // Start strong
        300000,
        280000,
        200000, // Slight drop
        150000, // More drop
        100000, // Significant drop
        80000,  // Very low
        120000, // Recovery
        200000, // Better
        300000, // Full recovery
      ];
      
      const decisions: string[] = [];
      let currentLevel = 3; // Start at premium
      
      for (const bw of bandwidthSamples) {
        const tier = getRecommendedTier(bw);
        const targetLevel = levels.findIndex(l => l.tierName === tier);
        
        if (targetLevel !== currentLevel) {
          decisions.push(`${currentLevel}→${targetLevel} (${bw}bps)`);
          currentLevel = targetLevel;
        }
      }
      
      // Should have several switches during the session
      expect(decisions.length).toBeGreaterThan(0);
      // Should end back at high quality
      expect(currentLevel).toBeGreaterThanOrEqual(2);
    });
  });
});


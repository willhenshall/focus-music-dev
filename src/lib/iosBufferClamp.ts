/**
 * iOS WebKit Buffer Clamp
 * 
 * A simple, minimal module to prevent iOS WebKit from buffering too much data
 * for long MP3 tracks. WebKit on iOS has an internal buffer limit around 22-23MB
 * that causes playback to crash when exceeded.
 * 
 * This module:
 * 1. Detects iOS WebKit browsers (Safari, Chrome on iOS, etc.)
 * 2. Monitors buffer size during playback
 * 3. Provides simple decisions: should we clamp? should we disable prefetch?
 * 
 * It does NOT:
 * - Implement complex state machines
 * - Attempt recovery logic
 * - Modify the audio element directly (that's the engine's job)
 */

import { IosWebkitInfo } from './iosWebkitDetection';

// ============================================================================
// CONFIGURATION - Simple, tunable constants
// ============================================================================

export const IOS_BUFFER_CLAMP_CONFIG = {
  // Buffer limits (in MB) - well below the ~22MB crash point
  WIFI_LIMIT_MB: 12,        // Safe limit for WiFi
  CELLULAR_LIMIT_MB: 10,    // More conservative for cellular (5G can buffer fast)
  
  // Thresholds for triggering clamp (percentage of limit)
  CLAMP_THRESHOLD: 0.85,    // Start clamping at 85% of limit
  
  // Estimated bitrate for byte calculations (256kbps is common for MP3s)
  ESTIMATED_BITRATE_KBPS: 256,
} as const;

// ============================================================================
// TYPES
// ============================================================================

export interface ClampDecision {
  /** Whether we should clamp (stop prefetching, etc.) */
  shouldClamp: boolean;
  
  /** Current estimated buffer size in MB */
  currentBufferMB: number;
  
  /** The limit we're comparing against */
  limitMB: number;
  
  /** Reason for the decision */
  reason: 'under_limit' | 'approaching_limit' | 'over_limit' | 'not_ios';
}

export interface IOSClampState {
  /** Whether this is an iOS WebKit browser */
  isIOSWebKit: boolean;
  
  /** Whether clamp is currently active (prefetch disabled) */
  isClampActive: boolean;
  
  /** Current buffer limit in MB */
  bufferLimitMB: number;
  
  /** Current estimated buffer in MB */
  currentBufferMB: number;
  
  /** Whether prefetch is disabled */
  prefetchDisabled: boolean;
  
  /** Browser name */
  browserName: string;
  
  /** Whether on cellular */
  isCellular: boolean;
}

// ============================================================================
// CORE FUNCTIONS - Simple, stateless helpers
// ============================================================================

/**
 * Check if we're running on iOS WebKit.
 * This is a simple re-export for convenience.
 */
export function isIOSWebKit(info: IosWebkitInfo): boolean {
  return info.isIOSWebKit;
}

/**
 * Get the buffer limit in MB based on network type.
 */
export function getBufferLimitMB(info: IosWebkitInfo): number {
  if (!info.isIOSWebKit) {
    return Infinity; // No limit for non-iOS
  }
  
  return info.isCellular 
    ? IOS_BUFFER_CLAMP_CONFIG.CELLULAR_LIMIT_MB 
    : IOS_BUFFER_CLAMP_CONFIG.WIFI_LIMIT_MB;
}

/**
 * Estimate the current buffer size in MB from an audio element.
 * Uses buffered time ranges and estimated bitrate.
 */
export function estimateBufferSizeMB(audio: HTMLAudioElement): number {
  if (!audio || audio.buffered.length === 0) {
    return 0;
  }
  
  // Get the end of the last buffered range
  const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
  
  // Estimate bytes: bufferedSeconds * (bitrate / 8)
  const bitrateBytes = (IOS_BUFFER_CLAMP_CONFIG.ESTIMATED_BITRATE_KBPS * 1000) / 8;
  const estimatedBytes = bufferedEnd * bitrateBytes;
  
  // Convert to MB
  return estimatedBytes / (1024 * 1024);
}

/**
 * Main decision function: should we clamp the buffer?
 * Returns a simple decision object.
 */
export function shouldClampBuffer(
  audio: HTMLAudioElement,
  iosInfo: IosWebkitInfo
): ClampDecision {
  // Not iOS - no clamping needed
  if (!iosInfo.isIOSWebKit) {
    return {
      shouldClamp: false,
      currentBufferMB: 0,
      limitMB: Infinity,
      reason: 'not_ios',
    };
  }
  
  const limitMB = getBufferLimitMB(iosInfo);
  const currentBufferMB = estimateBufferSizeMB(audio);
  const thresholdMB = limitMB * IOS_BUFFER_CLAMP_CONFIG.CLAMP_THRESHOLD;
  
  if (currentBufferMB >= limitMB) {
    return {
      shouldClamp: true,
      currentBufferMB,
      limitMB,
      reason: 'over_limit',
    };
  }
  
  if (currentBufferMB >= thresholdMB) {
    return {
      shouldClamp: true,
      currentBufferMB,
      limitMB,
      reason: 'approaching_limit',
    };
  }
  
  return {
    shouldClamp: false,
    currentBufferMB,
    limitMB,
    reason: 'under_limit',
  };
}

/**
 * Get the current clamp state for diagnostics.
 */
export function getClampState(
  audio: HTMLAudioElement | null,
  iosInfo: IosWebkitInfo,
  prefetchDisabled: boolean
): IOSClampState {
  const currentBufferMB = audio ? estimateBufferSizeMB(audio) : 0;
  const limitMB = getBufferLimitMB(iosInfo);
  
  return {
    isIOSWebKit: iosInfo.isIOSWebKit,
    isClampActive: prefetchDisabled,
    bufferLimitMB: limitMB,
    currentBufferMB,
    prefetchDisabled,
    browserName: iosInfo.browserName,
    isCellular: iosInfo.isCellular,
  };
}

/**
 * Reset clamp state for a new track.
 * This is just a helper that returns a fresh state object.
 */
export function resetClampState(): { prefetchDisabled: boolean } {
  return { prefetchDisabled: false };
}

// ============================================================================
// DEBUG HELPERS - For console inspection
// ============================================================================

/**
 * Get the clamp configuration (for debugging).
 */
export function getIOSClampConfig(): typeof IOS_BUFFER_CLAMP_CONFIG {
  return { ...IOS_BUFFER_CLAMP_CONFIG };
}

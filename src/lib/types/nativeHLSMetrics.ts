/**
 * Type definitions for Native HLS Monitoring
 * 
 * iOS Safari uses native HLS playback which doesn't expose ABR internals.
 * These types define the metrics we can infer from network activity and webkit APIs.
 */

/**
 * Quality tier inferred from segment URL paths
 */
export type QualityTier = 'low' | 'medium' | 'high' | 'premium' | 'unknown';

/**
 * Bandwidth values for each tier (from master.m3u8)
 */
export const TIER_BANDWIDTHS: Record<Exclude<QualityTier, 'unknown'>, number> = {
  low: 48000,      // 32 kbps audio + overhead
  medium: 96000,   // 64 kbps audio + overhead
  high: 144000,    // 96 kbps audio + overhead
  premium: 192000, // 128 kbps audio + overhead
};

/**
 * A single HLS segment request observation
 */
export interface SegmentRequest {
  /** URL of the segment */
  url: string;
  /** Quality tier inferred from URL path */
  tier: QualityTier;
  /** Timestamp when request started */
  startTime: number;
  /** Time taken to download (ms) */
  downloadTime: number;
  /** Size in bytes (if available) */
  transferSize: number;
  /** Estimated bandwidth from this segment (bps) */
  estimatedBandwidth: number;
}

/**
 * A tier switch event
 */
export interface TierSwitch {
  /** Previous tier */
  fromTier: QualityTier;
  /** New tier */
  toTier: QualityTier;
  /** When the switch occurred */
  timestamp: number;
  /** Whether this was an upgrade or downgrade */
  direction: 'upgrade' | 'downgrade' | 'same';
}

/**
 * A playback stall event
 */
export interface StallEvent {
  /** When the stall started */
  timestamp: number;
  /** Duration of the stall (ms), null if ongoing */
  duration: number | null;
  /** Buffer length at time of stall */
  bufferLength: number;
}

/**
 * Network connection info (from Navigator.connection)
 */
export interface ConnectionInfo {
  /** Effective connection type: 'slow-2g', '2g', '3g', '4g' */
  effectiveType: string;
  /** Estimated downlink bandwidth (Mbps) */
  downlink: number;
  /** Round-trip time (ms) */
  rtt: number;
  /** Whether data saver is enabled */
  saveData: boolean;
}

/**
 * Complete native HLS diagnostics snapshot
 */
export interface NativeHLSMetrics {
  // === Current State ===
  /** Currently detected quality tier */
  currentTier: QualityTier;
  /** URL of the last segment requested */
  lastSegmentUrl: string | null;
  /** Download time of last segment (ms) */
  lastSegmentDownloadTime: number | null;
  /** Rolling average bandwidth estimate (bps) */
  estimatedBandwidth: number;
  /** Human-readable bandwidth string */
  bandwidthDisplay: string;
  
  // === Playback Health ===
  /** Current buffer length (seconds) */
  bufferLength: number;
  /** Number of stall events since monitoring started */
  stallCount: number;
  /** Last stall event details */
  lastStall: StallEvent | null;
  /** Whether playback is currently stalled */
  isStalled: boolean;
  
  // === Decoded Data (webkit APIs) ===
  /** Total audio bytes decoded */
  audioDecodedBytes: number;
  /** Decoded bytes per second (rolling average) */
  decodedBytesPerSecond: number;
  /** Inferred playback bitrate from decoded bytes */
  inferredPlaybackBitrate: number;
  
  // === Network Context ===
  /** Connection info from Navigator.connection */
  connection: ConnectionInfo | null;
  
  // === History ===
  /** Recent segment requests (last 20) */
  segmentHistory: SegmentRequest[];
  /** Tier switch history (last 20) */
  tierSwitchHistory: TierSwitch[];
  
  // === Monitoring State ===
  /** When monitoring started */
  monitoringStartTime: number;
  /** Total monitoring duration (ms) */
  monitoringDuration: number;
  /** Whether the monitor is active */
  isMonitoring: boolean;
}

/**
 * Configuration options for the native HLS monitor
 */
export interface NativeHLSMonitorConfig {
  /** How many segment requests to keep in history */
  maxSegmentHistory: number;
  /** How many tier switches to keep in history */
  maxTierSwitchHistory: number;
  /** Interval for calculating rolling averages (ms) */
  rollingAverageInterval: number;
  /** Whether to log to console */
  debug: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_MONITOR_CONFIG: NativeHLSMonitorConfig = {
  maxSegmentHistory: 20,
  maxTierSwitchHistory: 20,
  rollingAverageInterval: 5000,
  debug: false,
};


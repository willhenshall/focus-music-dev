/**
 * Track Size Probe
 * 
 * Probes CDN to get actual track file size from HTTP headers.
 * Used by the iOS WebKit buffer governor to determine if a track is "large"
 * and to calculate accurate buffer estimates.
 * 
 * On iOS WebKit, this is critical because:
 * - Large tracks (~50MB) can cause WebKit buffer overflow issues
 * - We need actual file size to calculate bytesPerSecond accurately
 * - Bitrate estimation alone is not reliable for variable bitrate MP3s
 */

import { getIosWebkitInfo } from './iosWebkitDetection';

export interface TrackSizeInfo {
  /** Track ID */
  trackId: string;
  
  /** URL that was probed */
  url: string;
  
  /** Total file size in bytes, or 0 if unknown */
  sizeBytes: number;
  
  /** Size in MB for display */
  sizeMB: number;
  
  /** Whether the probe succeeded */
  probeSuccess: boolean;
  
  /** Error message if probe failed */
  error?: string;
  
  /** Content-Type from headers */
  contentType?: string;
  
  /** Timestamp of probe */
  timestamp: number;
}

// Cache for track sizes to avoid repeated HEAD requests
const trackSizeCache = new Map<string, TrackSizeInfo>();

// Cache expiry (1 hour)
const CACHE_EXPIRY_MS = 60 * 60 * 1000;

/**
 * Probe a CDN URL to get the track file size.
 * Uses HEAD request to get Content-Length without downloading the file.
 * 
 * @param url - The CDN URL for the track
 * @param trackId - Track identifier for logging/caching
 * @returns Track size information
 */
export async function probeTrackSize(url: string, trackId: string): Promise<TrackSizeInfo> {
  // Check cache first
  const cached = trackSizeCache.get(trackId);
  if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY_MS) {
    console.log('[IOS_BUFFER] Track size from cache:', {
      trackId,
      sizeMB: cached.sizeMB.toFixed(2),
    });
    return cached;
  }

  const result: TrackSizeInfo = {
    trackId,
    url,
    sizeBytes: 0,
    sizeMB: 0,
    probeSuccess: false,
    timestamp: Date.now(),
  };

  try {
    // Use HEAD request to get headers without downloading the file
    const response = await fetch(url, {
      method: 'HEAD',
      // Important: Include credentials if needed for CDN auth
      credentials: 'same-origin',
    });

    if (!response.ok) {
      result.error = `HTTP ${response.status}: ${response.statusText}`;
      console.warn('[IOS_BUFFER] Track size probe failed:', result.error);
      return result;
    }

    // Try to get size from Content-Length
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      result.sizeBytes = parseInt(contentLength, 10);
      result.sizeMB = result.sizeBytes / (1024 * 1024);
      result.probeSuccess = true;
    }

    // Also capture Content-Type
    result.contentType = response.headers.get('content-type') || undefined;

    // If no Content-Length, try Content-Range
    const contentRange = response.headers.get('content-range');
    if (!result.sizeBytes && contentRange) {
      // Content-Range format: "bytes 0-1/48038400" or "bytes */48038400"
      const match = contentRange.match(/\/(\d+)$/);
      if (match) {
        result.sizeBytes = parseInt(match[1], 10);
        result.sizeMB = result.sizeBytes / (1024 * 1024);
        result.probeSuccess = true;
      }
    }

    console.log('[IOS_BUFFER] Track size probed:', {
      trackId,
      sizeBytes: result.sizeBytes,
      sizeMB: result.sizeMB.toFixed(2),
      contentType: result.contentType,
    });

    // Cache the result
    trackSizeCache.set(trackId, result);

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    console.warn('[IOS_BUFFER] Track size probe error:', result.error);
    return result;
  }
}

/**
 * Check if we should probe for track size.
 * Only probes on iOS WebKit to avoid unnecessary network requests on other platforms.
 */
export function shouldProbeTrackSize(): boolean {
  const iosInfo = getIosWebkitInfo();
  return iosInfo.isIOSWebKit;
}

/**
 * Clear the track size cache.
 * Useful for testing or when CDN content changes.
 */
export function clearTrackSizeCache(): void {
  trackSizeCache.clear();
}

/**
 * Get cached track size if available.
 */
export function getCachedTrackSize(trackId: string): TrackSizeInfo | undefined {
  const cached = trackSizeCache.get(trackId);
  if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY_MS) {
    return cached;
  }
  return undefined;
}

/**
 * Extract track ID from a CDN URL.
 * Handles various URL formats from different storage adapters.
 */
export function extractTrackIdFromUrl(url: string): string | null {
  try {
    // Try to extract track ID from various URL patterns
    // Pattern 1: /audio/147284.mp3 or /147284.mp3
    const pathMatch = url.match(/\/(\d+)\.mp3$/i);
    if (pathMatch) {
      return pathMatch[1];
    }

    // Pattern 2: Full Supabase URL with track ID
    const supabaseMatch = url.match(/audio-files\/(\d+)\.mp3/i);
    if (supabaseMatch) {
      return supabaseMatch[1];
    }

    // Pattern 3: Any numeric ID before .mp3
    const genericMatch = url.match(/(\d+)\.mp3/i);
    if (genericMatch) {
      return genericMatch[1];
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Alternative approach: Use a Range request to get file size.
 * This is more reliable when HEAD requests don't return Content-Length.
 */
export async function probeTrackSizeWithRange(url: string, trackId: string): Promise<TrackSizeInfo> {
  // Check cache first
  const cached = trackSizeCache.get(trackId);
  if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY_MS) {
    return cached;
  }

  const result: TrackSizeInfo = {
    trackId,
    url,
    sizeBytes: 0,
    sizeMB: 0,
    probeSuccess: false,
    timestamp: Date.now(),
  };

  try {
    // Request just the first byte to get Content-Range header
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Range': 'bytes=0-1',
      },
      credentials: 'same-origin',
    });

    if (response.status === 206) {
      // Partial content - get size from Content-Range
      const contentRange = response.headers.get('content-range');
      if (contentRange) {
        // Content-Range format: "bytes 0-1/48038400"
        const match = contentRange.match(/\/(\d+)$/);
        if (match) {
          result.sizeBytes = parseInt(match[1], 10);
          result.sizeMB = result.sizeBytes / (1024 * 1024);
          result.probeSuccess = true;
        }
      }
    } else if (response.status === 200) {
      // Server doesn't support range requests, try Content-Length
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        result.sizeBytes = parseInt(contentLength, 10);
        result.sizeMB = result.sizeBytes / (1024 * 1024);
        result.probeSuccess = true;
      }
    }

    result.contentType = response.headers.get('content-type') || undefined;

    console.log('[IOS_BUFFER] Track size (range probe):', {
      trackId,
      sizeBytes: result.sizeBytes,
      sizeMB: result.sizeMB.toFixed(2),
    });

    // Cache the result
    if (result.probeSuccess) {
      trackSizeCache.set(trackId, result);
    }

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    console.warn('[IOS_BUFFER] Track size range probe error:', result.error);
    return result;
  }
}

import { supabase } from './supabase';

let currentPlayEvent: {
  eventId: string;
  trackId: string;
  startTime: number;
  duration: number;
} | null = null;

export async function trackPlayStart(
  trackId: string,
  duration: number,
  userId?: string,
  channelId?: string,
  sessionId?: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('track_play_events')
      .insert({
        track_id: trackId,
        user_id: userId || null,
        channel_id: channelId || null,
        started_at: new Date().toISOString(),
        total_duration: Math.round(duration),
        session_id: sessionId || null,
        device_type: getDeviceType(),
      })
      .select('id')
      .single();

    if (error) {
      return null;
    }

    currentPlayEvent = {
      eventId: data.id,
      trackId,
      startTime: Date.now(),
      duration: Math.round(duration),
    };

    return data.id;
  } catch (error) {
    return null;
  }
}

export async function trackPlayEnd(
  eventId: string,
  actualDuration: number,
  wasSkipped: boolean,
  skipPosition?: number
): Promise<void> {
  if (!currentPlayEvent || currentPlayEvent.eventId !== eventId) {
    return;
  }

  try {
    const completionPercentage = Math.min(
      100,
      (actualDuration / currentPlayEvent.duration) * 100
    );

    await supabase
      .from('track_play_events')
      .update({
        completed_at: new Date().toISOString(),
        duration_played: Math.round(actualDuration),
        completion_percentage: Math.round(completionPercentage * 100) / 100,
        was_skipped: wasSkipped,
        skip_position: skipPosition ? Math.round(skipPosition) : null,
      })
      .eq('id', eventId);

    await supabase.rpc('update_track_analytics_summary', {
      p_track_id: currentPlayEvent.trackId,
    });

    currentPlayEvent = null;
  } catch (error) {
  }
}

export function getCurrentPlayEvent() {
  return currentPlayEvent;
}

export function getDeviceType(): string {
  const ua = navigator.userAgent;
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return 'tablet';
  }
  if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

export async function getTopTracks(limit: number = 10, days?: number) {
  try {
    const { data, error } = await supabase.rpc('get_top_tracks', {
      p_limit: limit,
      p_days: days || null,
    });

    if (error) throw error;
    return data || [];
  } catch (error) {
    return [];
  }
}

export async function getTopSkippedTracks(limit: number = 10, days?: number) {
  try {
    const { data, error } = await supabase.rpc('get_top_skipped_tracks', {
      p_limit: limit,
      p_days: days || null,
    });

    if (error) throw error;
    return data || [];
  } catch (error) {
    return [];
  }
}

export async function getTrackAnalytics(trackId: string) {
  try {
    const { data, error } = await supabase
      .from('track_analytics_summary')
      .select('*')
      .eq('track_id', trackId)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    return null;
  }
}

/**
 * TTFA (Time To First Audio) analytics event.
 * Tracks how long it takes from user action to first audible audio.
 */
export interface TTFAEvent {
  requestId: string;
  ttfaMs: number;
  channelId: string;
  channelName: string;
  energyLevel: 'low' | 'medium' | 'high';
  trackId?: string;
  trackName?: string;
  artistName?: string;
  engineType: 'legacy' | 'streaming' | 'auto';
  browser: string;
  platform: string;
  isMobile: boolean;
  triggerType: 'channel_switch' | 'energy_change' | 'initial_play';
  timestamp?: string;
  userId?: string;
}

// Local storage for TTFA events (for debugging and E2E testing)
const ttfaEventsStore: TTFAEvent[] = [];

/**
 * Get all recorded TTFA events (for debugging/E2E).
 */
export function getTTFAEvents(): TTFAEvent[] {
  return [...ttfaEventsStore];
}

/**
 * Clear all recorded TTFA events (for testing).
 */
export function clearTTFAEvents(): void {
  ttfaEventsStore.length = 0;
}

/**
 * Track TTFA (Time To First Audio) event.
 * Records how long it took from user action to first audible audio.
 * 
 * NOTE: This is currently LOCAL-ONLY. Events are stored in memory and
 * exposed via window.__playerDebug.ttfaEvents for debugging/E2E.
 * Backend storage will be added later once the ttfa_events table exists.
 */
export function trackTTFA(event: TTFAEvent, userId?: string): void {
  try {
    // Add timestamp and userId to the event
    const fullEvent: TTFAEvent = {
      ...event,
      timestamp: new Date().toISOString(),
      userId,
    };

    // Store locally
    ttfaEventsStore.push(fullEvent);

    // Expose via window.__playerDebug for debugging/E2E
    if (typeof window !== 'undefined') {
      const debug = (window as any).__playerDebug;
      if (debug) {
        if (!debug.ttfaEvents) {
          debug.ttfaEvents = [];
        }
        debug.ttfaEvents.push(fullEvent);
      }
    }

    // Log in dev mode only
    if (import.meta.env.DEV) {
      console.log('[TTFA] Recorded event (local-only):', {
        requestId: event.requestId,
        ttfaMs: event.ttfaMs,
        channelName: event.channelName,
        energyLevel: event.energyLevel,
        trackName: event.trackName,
        engineType: event.engineType,
        triggerType: event.triggerType,
      });
    }
  } catch {
    // Never throw - analytics should never break playback
  }
}

/**
 * HLS to MP3 Fallback event.
 * Tracks when HLS loading fails and engine falls back to direct MP3.
 */
export interface HLSFallbackEvent {
  trackId: string;
  channelId?: string;
  errorType: string;
  errorDetails: string;
  browser: string;
  platform: string;
  isMobile: boolean;
  timestamp?: string;
  userId?: string;
}

// Local storage for fallback events (for debugging and E2E testing)
const hlsFallbackEventsStore: HLSFallbackEvent[] = [];

/**
 * Get all recorded HLS fallback events (for debugging/E2E).
 */
export function getHLSFallbackEvents(): HLSFallbackEvent[] {
  return [...hlsFallbackEventsStore];
}

/**
 * Clear all recorded HLS fallback events (for testing).
 */
export function clearHLSFallbackEvents(): void {
  hlsFallbackEventsStore.length = 0;
}

/**
 * Track HLS to MP3 fallback event.
 * Records when HLS loading fails and engine falls back to direct MP3.
 * 
 * NOTE: This is currently LOCAL-ONLY. Events are stored in memory and
 * exposed via window.__playerDebug.hlsFallbackEvents for debugging/E2E.
 */
export function trackHLSFallback(event: HLSFallbackEvent, userId?: string): void {
  try {
    // Add timestamp and userId to the event
    const fullEvent: HLSFallbackEvent = {
      ...event,
      timestamp: new Date().toISOString(),
      userId,
    };

    // Store locally
    hlsFallbackEventsStore.push(fullEvent);

    // Expose via window.__playerDebug for debugging/E2E
    if (typeof window !== 'undefined') {
      const debug = (window as any).__playerDebug;
      if (debug) {
        if (!debug.hlsFallbackEvents) {
          debug.hlsFallbackEvents = [];
        }
        debug.hlsFallbackEvents.push(fullEvent);
      }
    }

    // Log in dev mode only (single warning as specified)
    if (import.meta.env.DEV) {
      console.warn('[HLS FALLBACK] Falling back to MP3:', {
        trackId: event.trackId,
        errorType: event.errorType,
        errorDetails: event.errorDetails,
      });
    }
  } catch {
    // Never throw - analytics should never break playback
  }
}

/**
 * Get browser and platform info for TTFA tracking.
 */
export function getBrowserInfo(): { browser: string; platform: string; isMobile: boolean } {
  const ua = navigator.userAgent;
  
  let browser = 'unknown';
  if (ua.includes('Chrome') && !ua.includes('Edg')) {
    browser = 'Chrome';
  } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
    browser = 'Safari';
  } else if (ua.includes('Firefox')) {
    browser = 'Firefox';
  } else if (ua.includes('Edg')) {
    browser = 'Edge';
  }
  
  let platform = 'unknown';
  if (ua.includes('Mac')) {
    platform = 'macOS';
  } else if (ua.includes('Windows')) {
    platform = 'Windows';
  } else if (ua.includes('Android')) {
    platform = 'Android';
  } else if (ua.includes('iPhone') || ua.includes('iPad')) {
    platform = 'iOS';
  } else if (ua.includes('Linux')) {
    platform = 'Linux';
  }
  
  const isMobile = getDeviceType() === 'mobile' || getDeviceType() === 'tablet';
  
  return { browser, platform, isMobile };
}

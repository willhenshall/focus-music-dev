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

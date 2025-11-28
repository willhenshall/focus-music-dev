import { supabase, AudioTrack } from './supabase';

export async function getPreviewTrack(
  channelId: string
): Promise<AudioTrack | null> {
  try {
    const { data, error } = await supabase
      .from('audio_tracks')
      .select('*')
      .eq('preview_channel_id', channelId)
      .eq('is_preview', true)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      return null;
    }

    return data;
  } catch (error) {
    return null;
  }
}

export async function getPreviewTracks(
  channelIds: string[]
): Promise<Record<string, AudioTrack>> {
  try {

    const { data, error } = await supabase
      .from('audio_tracks')
      .select('*')
      .in('preview_channel_id', channelIds)
      .eq('is_preview', true)
      .is('deleted_at', null);

    if (error) {
      return {};
    }


    const previewMap: Record<string, AudioTrack> = {};
    data?.forEach(track => {
      if (track.preview_channel_id) {
        previewMap[track.preview_channel_id] = track;
      }
    });

    return previewMap;
  } catch (error) {
    return {};
  }
}

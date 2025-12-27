import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type UserProfile = {
  id: string;
  brain_type: string | null;
  ocean_openness: number;
  ocean_conscientiousness: number;
  ocean_extraversion: number;
  ocean_agreeableness: number;
  ocean_neuroticism: number;
  adhd_indicator: number;
  asd_indicator: number;
  prefers_music: boolean;
  energy_preference: string;
  onboarding_completed: boolean;
  is_admin: boolean;
  display_name: string;
  created_at: string;
  updated_at: string;
};

export type PlaylistStrategy = 'track_id_order' | 'weighted' | 'filename' | 'upload_date' | 'random' | 'custom' | 'slot_based';

export type AudioChannel = {
  id: string;
  channel_number: number;
  channel_name: string;
  description: string | null;
  brain_type_affinity: string[];
  neuroscience_tags: string[];
  playlist_data: {
    low: string[];
    medium: string[];
    high: string[];
  };
  playlist_strategy?: {
    low: { strategy: PlaylistStrategy; noRepeatWindow?: number };
    medium: { strategy: PlaylistStrategy; noRepeatWindow?: number };
    high: { strategy: PlaylistStrategy; noRepeatWindow?: number };
  };
  image_url: string | null;
  about_channel?: string | null;
  about_image_url?: string | null;
  about_external_link?: string | null;
  collection?: 'electronic' | 'acoustic' | 'rhythm' | 'textures' | null;
  hide_skip_button?: boolean;
  created_at: string;
};

export type AudioTrack = {
  id: string;
  channel_id: string | null;
  energy_level: 'low' | 'medium' | 'high' | null;
  file_path: string;
  duration_seconds: number;
  energy_low: boolean;
  energy_medium: boolean;
  energy_high: boolean;
  track_id?: number | null;
  metadata: Record<string, any>;
  skip_rate: number;
  is_preview: boolean;
  preview_channel_id?: string | null;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  // Basic track information
  track_name?: string | null;
  artist_name?: string | null;
  genre?: string | null;
  // Top-level metadata columns from backfill
  tempo?: number | null;
  speed?: number | null;
  intensity?: number | null;
  arousal?: number | null;
  valence?: number | null;
  brightness?: number | null;
  complexity?: number | null;
  music_key_value?: string | null;
  energy_set?: string | null;
  catalog?: string | null;
  track_user_genre_id?: number | null;
  locked?: boolean | null;
  // CDN columns
  cdn_synced_at?: string | null;
  cdn_url?: string | null;
};

export type ListeningSession = {
  id: string;
  user_id: string;
  channel_id: string | null;
  energy_level: string | null;
  started_at: string;
  ended_at: string | null;
  total_duration_seconds: number;
  tracks_played: string[];
  tracks_skipped: string[];
  productivity_rating: number | null;
};

export type ChannelRecommendation = {
  id: string;
  user_id: string;
  channel_id: string;
  confidence_score: number;
  reasoning: string | null;
  is_active: boolean;
  created_at: string;
};

export type SystemPreferences = {
  id: number;
  show_audio_diagnostics: boolean;
  show_queue: boolean;
  // Continuous playback code removed here
  recommendation_visibility_sessions: number;
  timer_bell_url: string | null;
  // Loading modal duration in milliseconds (min: 500, max: 10000, default: 4000)
  playback_loading_modal_duration_ms: number;
  updated_at: string;
  updated_by: string | null;
};

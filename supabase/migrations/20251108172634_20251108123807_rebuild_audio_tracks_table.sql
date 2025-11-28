/*
  # Rebuild Audio Tracks Table
  
  Complete rebuild with all metadata columns and proper security.
*/

-- Drop existing policies and table
DROP POLICY IF EXISTS "Anyone can view tracks" ON audio_tracks;
DROP TABLE IF EXISTS audio_tracks CASCADE;

-- Create fresh audio_tracks table
CREATE TABLE audio_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES audio_channels(id) ON DELETE SET NULL,
  file_path text UNIQUE NOT NULL,
  duration_seconds integer NOT NULL DEFAULT 0,
  energy_level text CHECK (energy_level IN ('low', 'medium', 'high')),
  
  energy_low boolean DEFAULT false,
  energy_medium boolean DEFAULT false,
  energy_high boolean DEFAULT false,
  
  track_id integer,
  tempo numeric,
  catalog text,
  locked boolean DEFAULT false,
  track_user_genre_id integer,
  
  speed numeric(4,2),
  intensity numeric(4,2),
  arousal numeric(5,2),
  valence numeric(5,2),
  brightness numeric(4,2),
  complexity numeric(4,2),
  music_key_value text,
  energy_set text,
  
  metadata jsonb DEFAULT '{}',
  skip_rate numeric DEFAULT 0.0,
  
  is_preview boolean DEFAULT false NOT NULL,
  preview_channel_id uuid REFERENCES audio_channels(id) ON DELETE SET NULL,
  
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Create indexes
CREATE INDEX idx_audio_tracks_channel ON audio_tracks(channel_id);
CREATE INDEX idx_audio_tracks_track_id ON audio_tracks(track_id);
CREATE INDEX idx_audio_tracks_energy ON audio_tracks(energy_level);
CREATE INDEX idx_audio_tracks_energy_low ON audio_tracks(energy_low) WHERE energy_low = true;
CREATE INDEX idx_audio_tracks_energy_medium ON audio_tracks(energy_medium) WHERE energy_medium = true;
CREATE INDEX idx_audio_tracks_energy_high ON audio_tracks(energy_high) WHERE energy_high = true;
CREATE INDEX idx_audio_tracks_deleted_at ON audio_tracks(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_audio_tracks_channel_energy ON audio_tracks(channel_id, energy_level);
CREATE INDEX idx_audio_tracks_preview_channel ON audio_tracks(preview_channel_id, is_preview) WHERE is_preview = true AND deleted_at IS NULL;

-- Enable RLS
ALTER TABLE audio_tracks ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Anonymous can view non-deleted tracks"
  ON audio_tracks FOR SELECT TO anon
  USING (deleted_at IS NULL);

CREATE POLICY "Users can view non-deleted tracks"
  ON audio_tracks FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

CREATE POLICY "Admins can view all tracks"
  ON audio_tracks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can insert tracks"
  ON audio_tracks FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can update tracks"
  ON audio_tracks FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can delete old soft-deleted tracks"
  ON audio_tracks FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
    AND deleted_at IS NOT NULL
    AND deleted_at < NOW() - INTERVAL '28 days'
  );
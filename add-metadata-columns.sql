-- Add track metadata columns to audio_tracks table

ALTER TABLE audio_tracks
ADD COLUMN IF NOT EXISTS track_name TEXT,
ADD COLUMN IF NOT EXISTS artist_name TEXT,
ADD COLUMN IF NOT EXISTS genre TEXT,
ADD COLUMN IF NOT EXISTS track_id TEXT;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_audio_tracks_track_name ON audio_tracks(track_name);
CREATE INDEX IF NOT EXISTS idx_audio_tracks_artist_name ON audio_tracks(artist_name);
CREATE INDEX IF NOT EXISTS idx_audio_tracks_genre ON audio_tracks(genre);
CREATE INDEX IF NOT EXISTS idx_audio_tracks_track_id ON audio_tracks(track_id);

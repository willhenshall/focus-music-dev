-- Add HLS streaming support columns to audio_tracks
-- These columns track HLS transcoding status for progressive streaming

-- Add HLS path column (stores path to master.m3u8 in audio-hls bucket)
ALTER TABLE audio_tracks
ADD COLUMN IF NOT EXISTS hls_path TEXT;

-- Add segment count for metrics
ALTER TABLE audio_tracks
ADD COLUMN IF NOT EXISTS hls_segment_count INTEGER;

-- Add transcoding timestamp
ALTER TABLE audio_tracks
ADD COLUMN IF NOT EXISTS hls_transcoded_at TIMESTAMPTZ;

-- Create index for quick lookup of HLS-enabled tracks
CREATE INDEX IF NOT EXISTS idx_audio_tracks_hls_path 
ON audio_tracks(hls_path) 
WHERE hls_path IS NOT NULL;

-- Comment on columns
COMMENT ON COLUMN audio_tracks.hls_path IS 'Path to HLS master.m3u8 playlist in audio-hls bucket';
COMMENT ON COLUMN audio_tracks.hls_segment_count IS 'Number of HLS segments for this track';
COMMENT ON COLUMN audio_tracks.hls_transcoded_at IS 'When the track was transcoded to HLS format';

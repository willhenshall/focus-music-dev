-- Add HLS CDN URL column to audio_tracks table
-- This tracks which HLS files have been synced to Cloudflare R2 CDN

ALTER TABLE audio_tracks 
ADD COLUMN IF NOT EXISTS hls_cdn_url text;

-- Add index for efficient queries on synced tracks
CREATE INDEX IF NOT EXISTS idx_audio_tracks_hls_cdn_url 
ON audio_tracks(hls_cdn_url) 
WHERE hls_cdn_url IS NOT NULL;

-- Comment
COMMENT ON COLUMN audio_tracks.hls_cdn_url IS 'CDN URL for HLS streaming (Cloudflare R2), e.g. https://pub-xxx.r2.dev/hls/{trackId}/master.m3u8';

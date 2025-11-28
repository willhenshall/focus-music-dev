/*
  # Add CDN Tracking Columns

  1. Changes
    - Add `cdn_url` column to store Cloudflare R2 CDN URL
    - Add `cdn_uploaded_at` column to track when CDN upload completed
    - Add `storage_locations` JSONB column to track which storage systems have the file
    - Add index on cdn_url for faster lookups

  2. Purpose
    - Enable dual-storage tracking (Supabase + Cloudflare R2 CDN)
    - Track upload timestamps for each storage system
    - Allow querying which files are available on which storage systems
    - Facilitate redundancy and failover strategies

  3. Example storage_locations structure:
    {
      "supabase": true,
      "r2_cdn": true,
      "upload_timestamps": {
        "supabase": "2024-01-15T10:30:00Z",
        "r2_cdn": "2024-01-15T10:30:02Z"
      }
    }
*/

-- Add CDN tracking columns to audio_tracks table
ALTER TABLE audio_tracks
ADD COLUMN IF NOT EXISTS cdn_url text,
ADD COLUMN IF NOT EXISTS cdn_uploaded_at timestamptz,
ADD COLUMN IF NOT EXISTS storage_locations jsonb DEFAULT '{
  "supabase": false,
  "r2_cdn": false,
  "upload_timestamps": {}
}'::jsonb;

-- Add index on cdn_url for faster lookups
CREATE INDEX IF NOT EXISTS idx_audio_tracks_cdn_url ON audio_tracks(cdn_url);

-- Add index on storage_locations for JSONB queries
CREATE INDEX IF NOT EXISTS idx_audio_tracks_storage_locations ON audio_tracks USING gin(storage_locations);

-- Add comment to explain the storage_locations structure
COMMENT ON COLUMN audio_tracks.storage_locations IS 'Tracks which storage systems have this file. Structure: {"supabase": bool, "r2_cdn": bool, "upload_timestamps": {"supabase": timestamp, "r2_cdn": timestamp}}';

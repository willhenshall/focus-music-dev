/*
  # Add Playlist Strategy Configuration

  1. Changes
    - Add `playlist_strategy` jsonb column to `audio_channels` table
    - This stores the playback strategy for each energy level (low, medium, high)
    - Default strategy is 'track_id_order' which plays tracks in order by their track_id
  
  2. Structure
    - Each energy level has its own strategy configuration:
      {
        "low": { "strategy": "track_id_order" },
        "medium": { "strategy": "track_id_order" },
        "high": { "strategy": "track_id_order" }
      }
    - Available strategies: 'track_id_order', 'weighted', 'filename', 'upload_date', 'random'
*/

-- Add playlist_strategy column with default configuration
ALTER TABLE audio_channels 
ADD COLUMN IF NOT EXISTS playlist_strategy jsonb DEFAULT '{"low": {"strategy": "track_id_order"}, "medium": {"strategy": "track_id_order"}, "high": {"strategy": "track_id_order"}}'::jsonb;

-- Update existing channels to have the default strategy
UPDATE audio_channels 
SET playlist_strategy = '{"low": {"strategy": "track_id_order"}, "medium": {"strategy": "track_id_order"}, "high": {"strategy": "track_id_order"}}'::jsonb
WHERE playlist_strategy IS NULL;

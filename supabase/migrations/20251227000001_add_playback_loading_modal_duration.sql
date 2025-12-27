-- Add playback_loading_modal_duration_ms column to system_preferences
-- This controls how long the loading modal remains visible before auto-dismiss
-- Default: 4000ms (4 seconds) - the calm "ritual" transition for focus

ALTER TABLE system_preferences
ADD COLUMN IF NOT EXISTS playback_loading_modal_duration_ms INTEGER NOT NULL DEFAULT 4000;

-- Add a comment explaining the column
COMMENT ON COLUMN system_preferences.playback_loading_modal_duration_ms IS 
  'Minimum time (ms) the loading modal remains visible before auto-dismiss. Range: 500-10000. Default: 4000.';


/*
  # Add Channel Energy Level Preferences

  ## Summary
  Adds the ability to save and restore each user's preferred energy level per channel.
  This ensures that when users select "Low", "Medium", or "High" energy for a channel,
  that preference persists across sessions.

  ## Changes
  
  ### Modified Tables
  - `user_preferences`
    - Add `channel_energy_levels` (jsonb) - Stores energy preferences per channel
      Format: { "channel_id": "low"|"medium"|"high" }
    - Add `last_energy_level` (text) - Most recently used energy level globally
  
  ## Example Data
  ```json
  {
    "channel_energy_levels": {
      "d9f3b6df-27e3-4175-89ec-2108153c0bed": "low",
      "a1b2c3d4-5678-90ab-cdef-123456789abc": "high"
    },
    "last_energy_level": "low"
  }
  ```
*/

-- Add energy level preference columns to user_preferences
ALTER TABLE user_preferences 
ADD COLUMN IF NOT EXISTS channel_energy_levels jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS last_energy_level text DEFAULT 'medium' CHECK (last_energy_level IN ('low', 'medium', 'high'));

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_preferences_channel_energy 
ON user_preferences USING gin (channel_energy_levels);

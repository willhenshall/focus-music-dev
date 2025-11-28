/*
  # Add Recommended Energy Level to Channel Recommendations

  1. Changes
    - Add `recommended_energy_level` column to `channel_recommendations` table
      - Type: text with CHECK constraint to ensure only 'low', 'medium', or 'high'
      - Default: 'medium'
      - Allows the system to recommend not just which channels, but at what energy level

  2. Purpose
    - When a user completes the onboarding quiz, we can recommend specific energy levels
    - For example, a user might be recommended "Cappuccino" at "high" energy
    - This provides more personalized recommendations based on their profile
*/

-- Add recommended_energy_level column to channel_recommendations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'channel_recommendations' AND column_name = 'recommended_energy_level'
  ) THEN
    ALTER TABLE channel_recommendations 
    ADD COLUMN recommended_energy_level text DEFAULT 'medium' 
    CHECK (recommended_energy_level IN ('low', 'medium', 'high'));
  END IF;
END $$;
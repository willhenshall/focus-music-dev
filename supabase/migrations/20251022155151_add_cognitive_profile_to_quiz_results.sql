/*
  # Add Cognitive Profile Fields to Quiz Results

  1. Changes
    - Add `adhd_indicator` column to store ADHD tendency score
    - Add `asd_score` column to store auditory sensitivity score
    - Add `preferred_stimulant_level` column to store energy preference
  
  2. Purpose
    - Store cognitive profile data from quiz results
    - Enable display of Attention Profile and Sensory Profile on user dashboard
*/

-- Add cognitive profile columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quiz_results' AND column_name = 'adhd_indicator'
  ) THEN
    ALTER TABLE quiz_results ADD COLUMN adhd_indicator numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quiz_results' AND column_name = 'asd_score'
  ) THEN
    ALTER TABLE quiz_results ADD COLUMN asd_score numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quiz_results' AND column_name = 'preferred_stimulant_level'
  ) THEN
    ALTER TABLE quiz_results ADD COLUMN preferred_stimulant_level text;
  END IF;
END $$;

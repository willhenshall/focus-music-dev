-- ========================================================================
-- FIX QUIZ DATABASE - Run this in Supabase SQL Editor
-- ========================================================================
--
-- PROBLEM: Quiz stuck at "Analyzing your responses..."
-- CAUSE:   Missing columns in quiz_results table
-- FIX:     Add the required columns below
--
-- HOW TO RUN:
-- 1. Go to https://supabase.com/dashboard
-- 2. Select your project
-- 3. Click "SQL Editor" in the left sidebar
-- 4. Click "New query"
-- 5. Copy and paste this ENTIRE file
-- 6. Click "RUN" button
-- 7. Wait for success message
-- 8. Refresh your quiz page and try again
--
-- ========================================================================

-- Add missing columns to quiz_results table
ALTER TABLE quiz_results
  ADD COLUMN IF NOT EXISTS brain_type_primary text,
  ADD COLUMN IF NOT EXISTS brain_type_secondary text,
  ADD COLUMN IF NOT EXISTS brain_type_scores jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS adhd_indicator numeric,
  ADD COLUMN IF NOT EXISTS asd_score numeric,
  ADD COLUMN IF NOT EXISTS preferred_stimulant_level text;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_quiz_results_brain_type
  ON quiz_results(brain_type_primary);

-- Verify the fix worked
DO $$
DECLARE
  missing_cols text[];
BEGIN
  -- Check for any missing columns
  SELECT array_agg(col) INTO missing_cols
  FROM unnest(ARRAY[
    'brain_type_primary',
    'brain_type_secondary',
    'brain_type_scores',
    'adhd_indicator',
    'asd_score',
    'preferred_stimulant_level'
  ]) AS col
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'quiz_results'
      AND column_name = col
      AND table_schema = 'public'
  );

  -- Report results
  IF array_length(missing_cols, 1) > 0 THEN
    RAISE NOTICE 'WARNING: Still missing columns: %',
      array_to_string(missing_cols, ', ');
    RAISE EXCEPTION 'Fix incomplete - please contact support';
  ELSE
    RAISE NOTICE '✅ SUCCESS! All required columns have been added.';
    RAISE NOTICE 'You can now close this window and try the quiz again.';
  END IF;
END $$;

-- ========================================================================
-- If you see "SUCCESS!" above, the fix worked!
-- Now refresh your quiz page and complete the quiz.
-- ========================================================================

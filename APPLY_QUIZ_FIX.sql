-- ========================================================================
-- FIX QUIZ DATABASE - Add Missing Columns
-- ========================================================================
--
-- This fixes the "Analyzing your responses..." stuck issue.
-- Run this AFTER installing INSTALL_DDL_FUNCTION.sql
--
-- HOW TO RUN:
-- 1. Go to: https://supabase.com/dashboard
-- 2. Select your project
-- 3. Click "SQL Editor" (left sidebar)
-- 4. Click "New query"
-- 5. Copy this ENTIRE file and paste it
-- 6. Click "RUN"
-- 7. Look for "Quiz database fixed!" message
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
    RAISE EXCEPTION 'Still missing columns: %', array_to_string(missing_cols, ', ');
  ELSE
    RAISE NOTICE '';
    RAISE NOTICE '╔═════════════════════════════════════════════════════════╗';
    RAISE NOTICE '║  ✅ Quiz database fixed!                                ║';
    RAISE NOTICE '║                                                         ║';
    RAISE NOTICE '║  All required columns have been added.                  ║';
    RAISE NOTICE '║  You can now close this window.                         ║';
    RAISE NOTICE '║                                                         ║';
    RAISE NOTICE '║  Next: Refresh your quiz page and complete the quiz!    ║';
    RAISE NOTICE '╚═════════════════════════════════════════════════════════╝';
    RAISE NOTICE '';
  END IF;
END $$;

-- ========================================================================
-- If you see "Quiz database fixed!" above, you're done!
-- Refresh your quiz page and try completing it again.
-- ========================================================================

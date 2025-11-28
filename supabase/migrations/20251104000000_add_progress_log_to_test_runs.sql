/*
  # Add Progress Log Column to Test Runs

  1. Changes
    - Add `progress_log` text column to `playwright_test_runs` table
      - Stores complete live progress log from test execution
      - Used for soak tests and other long-running tests

  2. Notes
    - Column is nullable as not all tests generate progress logs
    - No RLS changes needed (inherits existing admin policies)
*/

ALTER TABLE playwright_test_runs
  ADD COLUMN IF NOT EXISTS progress_log text;

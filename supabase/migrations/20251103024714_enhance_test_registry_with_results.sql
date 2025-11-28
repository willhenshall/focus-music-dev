/*
  # Enhanced Test Registry with Detailed Results

  Enhances the Playwright test registry to support detailed test execution results,
  including test runs, individual test case results, error logs, and execution metrics.

  1. New Tables
    - `playwright_test_runs`
      - `id` (uuid, primary key)
      - `test_id` (uuid, foreign key to playwright_test_registry)
      - `run_date` (timestamptz) - When the test was executed
      - `status` (text) - passed, failed, skipped, timeout
      - `duration_ms` (integer) - Total execution time
      - `passed_count` (integer) - Number of passed test cases
      - `failed_count` (integer) - Number of failed test cases
      - `skipped_count` (integer) - Number of skipped test cases
      - `error_message` (text) - Error summary if failed
      - `stack_trace` (text) - Full stack trace if available
      - `browser` (text) - Browser used (chromium, firefox, webkit)
      - `viewport` (text) - Viewport size used
      - `created_at` (timestamptz)

    - `playwright_test_cases`
      - `id` (uuid, primary key)
      - `run_id` (uuid, foreign key to playwright_test_runs)
      - `test_name` (text) - Individual test case name
      - `status` (text) - passed, failed, skipped
      - `duration_ms` (integer) - Test case execution time
      - `error_message` (text) - Error message if failed
      - `retry_count` (integer) - Number of retries attempted
      - `created_at` (timestamptz)

  2. Changes to Existing Tables
    - Add fields to `playwright_test_registry`:
      - `total_runs` (integer) - Total number of times test has been run
      - `pass_rate` (numeric) - Percentage of successful runs
      - `avg_duration_ms` (integer) - Average execution time
      - `last_error` (text) - Most recent error message

  3. Security
    - Enable RLS on new tables
    - Add admin-only policies for all operations
*/

-- Add new fields to existing playwright_test_registry table
ALTER TABLE playwright_test_registry
  ADD COLUMN IF NOT EXISTS total_runs integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pass_rate numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_duration_ms integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text;

-- Create test runs table
CREATE TABLE IF NOT EXISTS playwright_test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES playwright_test_registry(id) ON DELETE CASCADE,
  run_date timestamptz DEFAULT now(),
  status text NOT NULL,
  duration_ms integer NOT NULL,
  passed_count integer DEFAULT 0,
  failed_count integer DEFAULT 0,
  skipped_count integer DEFAULT 0,
  error_message text,
  stack_trace text,
  browser text DEFAULT 'chromium',
  viewport text DEFAULT '1280x720',
  created_at timestamptz DEFAULT now()
);

-- Create test cases table
CREATE TABLE IF NOT EXISTS playwright_test_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES playwright_test_runs(id) ON DELETE CASCADE,
  test_name text NOT NULL,
  status text NOT NULL,
  duration_ms integer NOT NULL,
  error_message text,
  retry_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_test_runs_test_id ON playwright_test_runs(test_id);
CREATE INDEX IF NOT EXISTS idx_test_runs_run_date ON playwright_test_runs(run_date DESC);
CREATE INDEX IF NOT EXISTS idx_test_cases_run_id ON playwright_test_cases(run_id);

-- Enable RLS
ALTER TABLE playwright_test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE playwright_test_cases ENABLE ROW LEVEL SECURITY;

-- Admin policies for test_runs
CREATE POLICY "Admins can read test runs"
  ON playwright_test_runs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can insert test runs"
  ON playwright_test_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can update test runs"
  ON playwright_test_runs
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can delete test runs"
  ON playwright_test_runs
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Admin policies for test_cases
CREATE POLICY "Admins can read test cases"
  ON playwright_test_cases
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can insert test cases"
  ON playwright_test_cases
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can update test cases"
  ON playwright_test_cases
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can delete test cases"
  ON playwright_test_cases
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Function to update test registry statistics after a run
CREATE OR REPLACE FUNCTION update_test_registry_stats()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update the test registry with latest stats
  UPDATE playwright_test_registry
  SET
    total_runs = (
      SELECT COUNT(*)
      FROM playwright_test_runs
      WHERE test_id = NEW.test_id
    ),
    pass_rate = (
      SELECT ROUND(
        (COUNT(*) FILTER (WHERE status = 'passed')::numeric /
        NULLIF(COUNT(*), 0) * 100)::numeric, 2
      )
      FROM playwright_test_runs
      WHERE test_id = NEW.test_id
    ),
    avg_duration_ms = (
      SELECT ROUND(AVG(duration_ms))::integer
      FROM playwright_test_runs
      WHERE test_id = NEW.test_id
    ),
    last_run_date = NEW.run_date,
    last_run_status = NEW.status,
    last_error = CASE
      WHEN NEW.status = 'failed' THEN NEW.error_message
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = NEW.test_id;

  RETURN NEW;
END;
$$;

-- Create trigger to auto-update stats
DROP TRIGGER IF EXISTS update_test_registry_stats_trigger ON playwright_test_runs;
CREATE TRIGGER update_test_registry_stats_trigger
  AFTER INSERT ON playwright_test_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_test_registry_stats();

-- Add missing test to registry (channel-energy-validation)
INSERT INTO playwright_test_registry (test_name, test_file, test_command, description, feature_area, status) VALUES
(
  'Channel Energy Validation',
  'channel-energy-validation.spec.ts',
  'npm run test -- channel-energy-validation.spec.ts',
  'Tests energy level validation and filtering in channels. Verifies that channels correctly show and filter tracks by energy level (low, medium, high) and that energy preferences are properly applied.',
  'user',
  'active'
)
ON CONFLICT (test_name) DO NOTHING;

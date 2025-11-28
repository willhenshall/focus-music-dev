/*
  # Add UPDATE policies for playwright_test_runs

  1. Changes
    - Add UPDATE policy for service_role to update test runs
    - Add UPDATE policy for admins to update test runs

  2. Security
    - Service role can update any test run (for test execution)
    - Admins can update any test run (for manual corrections)
*/

-- Allow service role to update test runs
CREATE POLICY "Service role can update test runs"
  ON playwright_test_runs
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow admins to update test runs
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
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );
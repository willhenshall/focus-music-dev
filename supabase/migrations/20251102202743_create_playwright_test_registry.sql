/*
  # Playwright Test Registry System
  
  Creates a system for tracking and managing Playwright test files in the project.
  
  1. New Tables
    - `playwright_test_registry`
      - `id` (uuid, primary key)
      - `test_name` (text, unique) - Human-readable test name
      - `test_file` (text, unique) - Actual filename in tests/ directory
      - `test_command` (text) - NPM command to run this test
      - `description` (text) - What the test covers
      - `feature_area` (text) - Which part of the app (admin, user, auth, etc.)
      - `status` (text) - active, deprecated, wip
      - `last_run_date` (timestamptz) - Last time test was executed
      - `last_run_status` (text) - passed, failed, skipped
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Security
    - Enable RLS on `playwright_test_registry` table
    - Add policies for admin read/write access
*/

-- Create the test registry table
CREATE TABLE IF NOT EXISTS playwright_test_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_name text UNIQUE NOT NULL,
  test_file text UNIQUE NOT NULL,
  test_command text NOT NULL,
  description text NOT NULL,
  feature_area text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  last_run_date timestamptz,
  last_run_status text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE playwright_test_registry ENABLE ROW LEVEL SECURITY;

-- Admin users can read all tests
CREATE POLICY "Admins can read test registry"
  ON playwright_test_registry
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Admin users can insert tests
CREATE POLICY "Admins can insert test registry"
  ON playwright_test_registry
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Admin users can update tests
CREATE POLICY "Admins can update test registry"
  ON playwright_test_registry
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Admin users can delete tests
CREATE POLICY "Admins can delete test registry"
  ON playwright_test_registry
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_test_registry_updated_at()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_test_registry_updated_at_trigger ON playwright_test_registry;
CREATE TRIGGER update_test_registry_updated_at_trigger
  BEFORE UPDATE ON playwright_test_registry
  FOR EACH ROW
  EXECUTE FUNCTION update_test_registry_updated_at();

-- Insert initial test entries
INSERT INTO playwright_test_registry (test_name, test_file, test_command, description, feature_area, status) VALUES
(
  'Complete User Flow - End to End',
  'complete-user-flow.spec.ts',
  'npm run test -- complete-user-flow.spec.ts',
  'Comprehensive end-to-end test covering the complete user journey from landing page through quiz, authentication, preview functionality, and all major features. Tests anonymous quiz, sign up, channel previews, and user dashboard.',
  'end-to-end',
  'active'
),
(
  'Admin Channel Images',
  'admin-channel-images.spec.ts',
  'npm run test -- admin-channel-images.spec.ts',
  'Tests admin ability to upload and manage channel images. Covers image upload, preview, channel assignment, and image management functionality in the admin dashboard.',
  'admin',
  'active'
),
(
  'Admin Bulk Delete Users',
  'admin-bulk-delete-users.spec.ts',
  'npm run test -- admin-bulk-delete-users.spec.ts',
  'Tests bulk user deletion feature in admin dashboard. Covers checkbox selection, select all functionality, bulk delete confirmation modal, type-to-confirm safety mechanism, and successful multi-user deletion with UI updates.',
  'admin',
  'active'
),
(
  'Admin Slot Strategy',
  'admin-slot-strategy.spec.ts',
  'npm run test -- admin-slot-strategy.spec.ts',
  'Tests slot-based playlist strategy configuration in admin dashboard. Tests creating, editing, and managing slot strategies for personalized music sequencing.',
  'admin',
  'active'
),
(
  'Energy Level Changes',
  'energy-level-changes.spec.ts',
  'npm run test -- energy-level-changes.spec.ts',
  'Tests dynamic energy level switching during playback. Verifies that users can change between low, medium, and high energy levels and that the playlist adapts accordingly.',
  'user',
  'active'
),
(
  'Slot Sequence Playback',
  'slot-sequence-playback.spec.ts',
  'npm run test -- slot-sequence-playback.spec.ts',
  'Tests slot-based sequence playback functionality. Verifies that saved slot sequences play in correct order with proper track selection per slot configuration.',
  'user',
  'active'
)
ON CONFLICT (test_name) DO NOTHING;

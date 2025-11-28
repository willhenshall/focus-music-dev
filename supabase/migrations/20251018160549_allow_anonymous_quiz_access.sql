/*
  # Allow Anonymous Access to Quiz Data

  1. Changes
    - Drop existing restrictive SELECT policies on quiz_questions and quiz_config
    - Add new SELECT policies that allow anonymous users (anon role) to view quiz data
    - This enables the anonymous quiz flow where users can take the assessment before signing up

  2. Security
    - Only SELECT (read) access is granted to anonymous users
    - INSERT, UPDATE, DELETE remain restricted to admin users only
    - Maintains data integrity while allowing public quiz access
*/

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "All authenticated users can view quiz questions" ON quiz_questions;
DROP POLICY IF EXISTS "All authenticated users can view active quiz config" ON quiz_config;

-- Allow anyone (including anonymous users) to view quiz questions
CREATE POLICY "Anyone can view quiz questions"
  ON quiz_questions
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow anyone (including anonymous users) to view active quiz config
CREATE POLICY "Anyone can view active quiz config"
  ON quiz_config
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

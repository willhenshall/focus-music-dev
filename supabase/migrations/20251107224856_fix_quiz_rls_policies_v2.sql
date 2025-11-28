/*
  # Fix Quiz RLS Policies for Anonymous Access

  ## Problem
  - Quiz tables have RLS enabled but missing critical policies
  - This blocks anonymous access to quiz data
  - Quiz cannot load in the app
  
  ## Solution
  - Drop any existing policies first to avoid conflicts
  - Create policies allowing anonymous read access to quiz data
  - Allow authenticated users to save quiz results
  
  ## Tables Fixed
  1. quiz_config - Read access for active config
  2. quiz_questions - Read access for all questions
  3. quiz_results - Authenticated users can insert/read own results
  4. quiz_responses - Authenticated users can insert/read own responses
*/

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Public can view active quiz config" ON quiz_config;
DROP POLICY IF EXISTS "Public can view quiz questions" ON quiz_questions;
DROP POLICY IF EXISTS "Users can insert own quiz results" ON quiz_results;
DROP POLICY IF EXISTS "Users can view own quiz results" ON quiz_results;
DROP POLICY IF EXISTS "Users can insert own quiz responses" ON quiz_responses;
DROP POLICY IF EXISTS "Users can view own quiz responses" ON quiz_responses;

-- quiz_config: Anyone can view active config
CREATE POLICY "Public can view active quiz config"
  ON quiz_config FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- quiz_questions: Anyone can view questions
CREATE POLICY "Public can view quiz questions"
  ON quiz_questions FOR SELECT
  TO anon, authenticated
  USING (true);

-- quiz_results: Users can insert and view their own results
CREATE POLICY "Users can insert own quiz results"
  ON quiz_results FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own quiz results"
  ON quiz_results FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- quiz_responses: Users can insert and view their own responses
CREATE POLICY "Users can insert own quiz responses"
  ON quiz_responses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own quiz responses"
  ON quiz_responses FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

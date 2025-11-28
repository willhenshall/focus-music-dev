/*
  # Quiz Management System

  1. New Tables
    - `quiz_questions`
      - Stores all quiz questions with their configuration
      - Includes question text, type, options, and scoring rules
    
    - `quiz_results`
      - Stores user quiz responses and calculated results
      - Links to user_profiles
      - Contains OCEAN scores and recommended channels
    
    - `quiz_config`
      - Stores the current quiz configuration (scoring logic, channel mappings)
      - Versioned for tracking changes over time

  2. Security
    - Enable RLS on all tables
    - Admin users can manage quiz questions and config
    - All authenticated users can view quiz questions
    - Users can only view their own quiz results
    - Admin users can view all quiz results
*/

-- Quiz questions table
CREATE TABLE IF NOT EXISTS quiz_questions (
  id text PRIMARY KEY,
  question_order integer NOT NULL,
  question_type text NOT NULL CHECK (question_type IN ('single_select', 'likert_1_5', 'likert_1_7')),
  question_text text NOT NULL,
  options jsonb DEFAULT '[]'::jsonb,
  reverse_scored boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Quiz configuration table
CREATE TABLE IF NOT EXISTS quiz_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  scoring_logic jsonb NOT NULL,
  channel_mapping jsonb NOT NULL,
  energy_levels jsonb DEFAULT '["Low", "Medium", "High"]'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Quiz results table
CREATE TABLE IF NOT EXISTS quiz_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_version text NOT NULL,
  responses jsonb NOT NULL,
  ocean_scores jsonb NOT NULL,
  recommended_channels jsonb NOT NULL,
  completed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_results ENABLE ROW LEVEL SECURITY;

-- Quiz questions policies
CREATE POLICY "All authenticated users can view quiz questions"
  ON quiz_questions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin users can insert quiz questions"
  ON quiz_questions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admin users can update quiz questions"
  ON quiz_questions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admin users can delete quiz questions"
  ON quiz_questions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Quiz config policies
CREATE POLICY "All authenticated users can view active quiz config"
  ON quiz_config FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admin users can insert quiz config"
  ON quiz_config FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Admin users can update quiz config"
  ON quiz_config FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Quiz results policies
CREATE POLICY "Users can view their own quiz results"
  ON quiz_results FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admin users can view all quiz results"
  ON quiz_results FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Users can insert their own quiz results"
  ON quiz_results FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_quiz_questions_order ON quiz_questions(question_order);
CREATE INDEX IF NOT EXISTS idx_quiz_config_active ON quiz_config(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_quiz_results_user_id ON quiz_results(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_results_completed_at ON quiz_results(completed_at DESC);
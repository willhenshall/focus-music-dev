/*
  # Add Brain Type Profile to Quiz Results

  1. Changes
    - Add `brain_type_primary` column to store primary brain type (explorer, systematic_executor, etc.)
    - Add `brain_type_secondary` column for secondary brain type (optional)
    - Add `brain_type_scores` jsonb column to store calculated scores for all 6 brain types
  
  2. Brain Types
    - explorer: High Openness - Creative but easily distracted
    - systematic_executor: Low Openness + High Conscientiousness - Reliable but noise-sensitive
    - focused_builder: High Conscientiousness + High Openness - Ambitious but overloaded
    - collaborator: High Extraversion - Social but overstimulated
    - worrier: High Neuroticism - Sensitive but resilient with support
    - dabbler: Low Conscientiousness - Spontaneous but easily distracted
  
  3. Security
    - No RLS changes needed - existing policies cover new columns
*/

-- Add brain type columns to quiz_results
ALTER TABLE quiz_results
  ADD COLUMN IF NOT EXISTS brain_type_primary text CHECK (brain_type_primary IN ('explorer', 'systematic_executor', 'focused_builder', 'collaborator', 'worrier', 'dabbler')),
  ADD COLUMN IF NOT EXISTS brain_type_secondary text CHECK (brain_type_secondary IN ('explorer', 'systematic_executor', 'focused_builder', 'collaborator', 'worrier', 'dabbler')),
  ADD COLUMN IF NOT EXISTS brain_type_scores jsonb DEFAULT '{}'::jsonb;

-- Add index for brain type queries
CREATE INDEX IF NOT EXISTS idx_quiz_results_brain_type ON quiz_results(brain_type_primary);

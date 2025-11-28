/*
  # Enable Realtime for Quiz Results

  1. Changes
    - Enable realtime for quiz_results table to allow UI to update when quiz is retaken
    - This ensures that brain type and cognitive profile data refreshes automatically

  2. Security
    - Realtime subscriptions respect existing RLS policies
*/

-- Enable realtime for quiz_results table
alter publication supabase_realtime add table quiz_results;
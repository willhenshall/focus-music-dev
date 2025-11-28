/*
  # Add saved sequence reference to slot strategies

  1. Changes
    - Add `saved_sequence_id` column to `slot_strategies` table to track which saved sequence was loaded
    - Add `saved_sequence_name` column to store a snapshot of the name (in case sequence is deleted)
    - Add foreign key constraint with ON DELETE SET NULL

  2. Purpose
    - When a saved sequence is loaded and then saved as the active strategy, track this relationship
    - Display the sequence name in the UI when revisiting the slot sequencer
*/

-- Add columns to track loaded sequence
ALTER TABLE slot_strategies 
ADD COLUMN IF NOT EXISTS saved_sequence_id uuid REFERENCES saved_slot_sequences(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS saved_sequence_name text;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_slot_strategies_saved_sequence 
ON slot_strategies(saved_sequence_id);
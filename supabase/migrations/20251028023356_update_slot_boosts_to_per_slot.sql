/*
  # Update Slot Boosts to Per-Slot Configuration

  1. Changes
    - Modify `slot_boosts` table to link to `slot_definitions` instead of `slot_strategies`
    - Update foreign key relationship
    - Update RLS policies
    - Migrate existing data if any exists

  2. Security
    - Maintain admin-only write access
    - Users can read boosts for their strategies
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage slot boosts" ON slot_boosts;
DROP POLICY IF EXISTS "Users can view slot boosts" ON slot_boosts;

-- Add slot_definition_id column and remove strategy_id
ALTER TABLE slot_boosts DROP CONSTRAINT IF EXISTS slot_boosts_strategy_id_fkey;
ALTER TABLE slot_boosts DROP CONSTRAINT IF EXISTS slot_boosts_strategy_id_field_key;

-- Temporarily allow nulls for migration
ALTER TABLE slot_boosts ALTER COLUMN strategy_id DROP NOT NULL;

-- Add new column
ALTER TABLE slot_boosts ADD COLUMN IF NOT EXISTS slot_definition_id uuid REFERENCES slot_definitions(id) ON DELETE CASCADE;

-- Clean up old data (if any exists, it's now invalid)
DELETE FROM slot_boosts;

-- Remove old column and constraint
ALTER TABLE slot_boosts DROP COLUMN IF EXISTS strategy_id;

-- Make new column required
ALTER TABLE slot_boosts ALTER COLUMN slot_definition_id SET NOT NULL;

-- Add unique constraint per slot definition
ALTER TABLE slot_boosts ADD CONSTRAINT slot_boosts_slot_definition_id_field_key 
  UNIQUE(slot_definition_id, field);

-- Update index
DROP INDEX IF EXISTS idx_slot_boosts_strategy;
CREATE INDEX IF NOT EXISTS idx_slot_boosts_slot_definition ON slot_boosts(slot_definition_id);

-- Recreate RLS policies
CREATE POLICY "Admins can manage slot boosts"
  ON slot_boosts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM slot_definitions
      JOIN slot_strategies ON slot_strategies.id = slot_definitions.strategy_id
      WHERE slot_definitions.id = slot_boosts.slot_definition_id
      AND public.is_admin()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM slot_definitions
      JOIN slot_strategies ON slot_strategies.id = slot_definitions.strategy_id
      WHERE slot_definitions.id = slot_boosts.slot_definition_id
      AND public.is_admin()
    )
  );

CREATE POLICY "Users can view slot boosts"
  ON slot_boosts FOR SELECT
  TO authenticated
  USING (true);

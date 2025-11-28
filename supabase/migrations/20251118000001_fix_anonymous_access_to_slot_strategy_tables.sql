/*
  # Fix Anonymous Access to Slot Strategy Tables

  ## Problem
  After database migration, slot sequencer strategy channels stopped working.

  Root Cause Analysis:
  - The app allows anonymous users to play music (no login required)
  - Audio tracks and channels have RLS policies for anonymous access (anon role)
  - Slot strategy tables ONLY allow authenticated users (authenticated role)
  - When anonymous users try to play slot-based channels, queries return 0 rows
  - System cannot find strategy configuration → no music plays

  ## Evidence
  - Migration 20251107224520 added anonymous access to audio_tracks and audio_channels
  - Migration 20251028020923 created slot strategy tables with authenticated-only policies
  - No migration ever granted anonymous access to slot strategy tables

  ## Solution
  Update all slot strategy table policies to allow anonymous (anon) read access.
  Maintain admin-only write access for security.

  ## Changes
  1. Drop existing authenticated-only SELECT policies
  2. Create new policies allowing both anon and authenticated users to read
  3. Keep admin-only policies for INSERT/UPDATE/DELETE unchanged

  ## Tables Updated
  - slot_strategies
  - slot_definitions
  - slot_boosts
  - slot_rule_groups
  - slot_rules
*/

-- Drop old authenticated-only read policies
DROP POLICY IF EXISTS "Users can view slot strategies" ON slot_strategies;
DROP POLICY IF EXISTS "Users can view slot definitions" ON slot_definitions;
DROP POLICY IF EXISTS "Users can view slot boosts" ON slot_boosts;
DROP POLICY IF EXISTS "Users can view slot rule groups" ON slot_rule_groups;
DROP POLICY IF EXISTS "Users can view slot rules" ON slot_rules;

-- Create new policies allowing anonymous AND authenticated users to read
CREATE POLICY "Public can view slot strategies"
  ON slot_strategies FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Public can view slot definitions"
  ON slot_definitions FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Public can view slot boosts"
  ON slot_boosts FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Public can view slot rule groups"
  ON slot_rule_groups FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Public can view slot rules"
  ON slot_rules FOR SELECT
  TO anon, authenticated
  USING (true);

-- Verification comment:
-- After applying this migration, anonymous users will be able to:
-- 1. Query slot_strategies to find strategy configuration for a channel
-- 2. Query slot_definitions to get target values for each slot
-- 3. Query slot_boosts to get field weights for scoring
-- 4. Query slot_rule_groups and slot_rules for filtering logic
-- This restores full functionality to slot sequencer strategy channels.

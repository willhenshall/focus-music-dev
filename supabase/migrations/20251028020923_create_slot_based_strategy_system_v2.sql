/*
  # Create Slot-Based Playlist Strategy System

  1. New Tables
    - `slot_strategies`
      - `id` (uuid, primary key)
      - `channel_id` (uuid, FK to audio_channels)
      - `energy_tier` (text: 'low', 'medium', 'high')
      - `name` (text, default 'Slot-Based Sequencer')
      - `num_slots` (integer, 1-60, default 20)
      - `recent_repeat_window` (integer, default 5)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - Unique constraint on (channel_id, energy_tier)
    
    - `slot_definitions`
      - `id` (uuid, primary key)
      - `strategy_id` (uuid, FK to slot_strategies)
      - `index` (integer, 1-60)
      - `targets` (jsonb: speed, intensity, brightness, complexity, valence, arousal, bpm, key, proximity)
      - Unique constraint on (strategy_id, index)
    
    - `slot_boosts`
      - `id` (uuid, primary key)
      - `strategy_id` (uuid, FK to slot_strategies)
      - `field` (text: speed|intensity|brightness|complexity|valence|arousal|bpm|key|proximity)
      - `mode` (text: 'near' | 'exact')
      - `weight` (integer, 1-5)
      - Unique constraint on (strategy_id, field)
    
    - `slot_rule_groups`
      - `id` (uuid, primary key)
      - `strategy_id` (uuid, FK to slot_strategies)
      - `logic` (text: 'AND' | 'OR')
      - `order` (integer)
    
    - `slot_rules`
      - `id` (uuid, primary key)
      - `group_id` (uuid, FK to slot_rule_groups)
      - `field` (text: genre, artist, label, etc.)
      - `operator` (text: eq, neq, in, nin, gte, lte, between, exists)
      - `value` (jsonb)

  2. Security
    - Enable RLS on all tables
    - Admin-only write access
    - Authenticated users can read their channel strategies
*/

-- Create update trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Create slot_strategies table
CREATE TABLE IF NOT EXISTS slot_strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES audio_channels(id) ON DELETE CASCADE,
  energy_tier text NOT NULL CHECK (energy_tier IN ('low', 'medium', 'high')),
  name text NOT NULL DEFAULT 'Slot-Based Sequencer',
  num_slots integer NOT NULL DEFAULT 20 CHECK (num_slots BETWEEN 1 AND 60),
  recent_repeat_window integer NOT NULL DEFAULT 5 CHECK (recent_repeat_window >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(channel_id, energy_tier)
);

-- Create slot_definitions table
CREATE TABLE IF NOT EXISTS slot_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id uuid NOT NULL REFERENCES slot_strategies(id) ON DELETE CASCADE,
  index integer NOT NULL CHECK (index BETWEEN 1 AND 60),
  targets jsonb NOT NULL DEFAULT '{}',
  UNIQUE(strategy_id, index)
);

-- Create slot_boosts table
CREATE TABLE IF NOT EXISTS slot_boosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id uuid NOT NULL REFERENCES slot_strategies(id) ON DELETE CASCADE,
  field text NOT NULL CHECK (field IN ('speed', 'intensity', 'brightness', 'complexity', 'valence', 'arousal', 'bpm', 'key', 'proximity')),
  mode text NOT NULL DEFAULT 'near' CHECK (mode IN ('near', 'exact')),
  weight integer NOT NULL DEFAULT 1 CHECK (weight BETWEEN 1 AND 5),
  UNIQUE(strategy_id, field)
);

-- Create slot_rule_groups table
CREATE TABLE IF NOT EXISTS slot_rule_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id uuid NOT NULL REFERENCES slot_strategies(id) ON DELETE CASCADE,
  logic text NOT NULL DEFAULT 'AND' CHECK (logic IN ('AND', 'OR')),
  "order" integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create slot_rules table
CREATE TABLE IF NOT EXISTS slot_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES slot_rule_groups(id) ON DELETE CASCADE,
  field text NOT NULL,
  operator text NOT NULL CHECK (operator IN ('eq', 'neq', 'in', 'nin', 'gte', 'lte', 'between', 'exists')),
  value jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE slot_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE slot_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE slot_boosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE slot_rule_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE slot_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies for slot_strategies
CREATE POLICY "Admins can manage slot strategies"
  ON slot_strategies FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Users can view slot strategies"
  ON slot_strategies FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for slot_definitions
CREATE POLICY "Admins can manage slot definitions"
  ON slot_definitions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM slot_strategies
      WHERE slot_strategies.id = slot_definitions.strategy_id
      AND public.is_admin()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM slot_strategies
      WHERE slot_strategies.id = slot_definitions.strategy_id
      AND public.is_admin()
    )
  );

CREATE POLICY "Users can view slot definitions"
  ON slot_definitions FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for slot_boosts
CREATE POLICY "Admins can manage slot boosts"
  ON slot_boosts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM slot_strategies
      WHERE slot_strategies.id = slot_boosts.strategy_id
      AND public.is_admin()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM slot_strategies
      WHERE slot_strategies.id = slot_boosts.strategy_id
      AND public.is_admin()
    )
  );

CREATE POLICY "Users can view slot boosts"
  ON slot_boosts FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for slot_rule_groups
CREATE POLICY "Admins can manage slot rule groups"
  ON slot_rule_groups FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM slot_strategies
      WHERE slot_strategies.id = slot_rule_groups.strategy_id
      AND public.is_admin()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM slot_strategies
      WHERE slot_strategies.id = slot_rule_groups.strategy_id
      AND public.is_admin()
    )
  );

CREATE POLICY "Users can view slot rule groups"
  ON slot_rule_groups FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for slot_rules
CREATE POLICY "Admins can manage slot rules"
  ON slot_rules FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM slot_rule_groups
      JOIN slot_strategies ON slot_strategies.id = slot_rule_groups.strategy_id
      WHERE slot_rule_groups.id = slot_rules.group_id
      AND public.is_admin()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM slot_rule_groups
      JOIN slot_strategies ON slot_strategies.id = slot_rule_groups.strategy_id
      WHERE slot_rule_groups.id = slot_rules.group_id
      AND public.is_admin()
    )
  );

CREATE POLICY "Users can view slot rules"
  ON slot_rules FOR SELECT
  TO authenticated
  USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_slot_strategies_channel_tier ON slot_strategies(channel_id, energy_tier);
CREATE INDEX IF NOT EXISTS idx_slot_definitions_strategy ON slot_definitions(strategy_id, index);
CREATE INDEX IF NOT EXISTS idx_slot_boosts_strategy ON slot_boosts(strategy_id);
CREATE INDEX IF NOT EXISTS idx_slot_rule_groups_strategy ON slot_rule_groups(strategy_id, "order");
CREATE INDEX IF NOT EXISTS idx_slot_rules_group ON slot_rules(group_id);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_slot_strategies_updated_at ON slot_strategies;
CREATE TRIGGER update_slot_strategies_updated_at
  BEFORE UPDATE ON slot_strategies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE slot_strategies;
ALTER PUBLICATION supabase_realtime ADD TABLE slot_definitions;
ALTER PUBLICATION supabase_realtime ADD TABLE slot_boosts;
ALTER PUBLICATION supabase_realtime ADD TABLE slot_rule_groups;
ALTER PUBLICATION supabase_realtime ADD TABLE slot_rules;

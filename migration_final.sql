-- Helper function to get track field value (handles both top-level and metadata fields)
CREATE OR REPLACE FUNCTION get_track_field_value(field_name text, track_row audio_tracks)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result text;
  metadata_field text;
BEGIN
  -- Handle PostgreSQL JSON operator syntax (e.g., "metadata->>'genre'")
  IF field_name ~ '^metadata->>''(.+)''$' THEN
    metadata_field := substring(field_name from '^metadata->>''(.+)''$');
    RETURN track_row.metadata->>metadata_field;
  END IF;

  -- Try top-level columns first
  CASE field_name
    WHEN 'track_id' THEN RETURN track_row.track_id;
    WHEN 'track_name' THEN RETURN track_row.track_name;
    WHEN 'artist_name' THEN RETURN track_row.artist_name;
    WHEN 'tempo' THEN RETURN track_row.tempo::text;
    WHEN 'speed' THEN RETURN track_row.speed::text;
    WHEN 'intensity' THEN RETURN track_row.intensity::text;
    WHEN 'arousal' THEN RETURN track_row.arousal::text;
    WHEN 'valence' THEN RETURN track_row.valence::text;
    WHEN 'brightness' THEN RETURN track_row.brightness::text;
    WHEN 'complexity' THEN RETURN track_row.complexity::text;
    WHEN 'music_key_value' THEN RETURN track_row.music_key_value;
    WHEN 'energy_set' THEN RETURN track_row.energy_set;
    WHEN 'catalog' THEN RETURN track_row.catalog;
    WHEN 'genre' THEN RETURN track_row.genre;
    WHEN 'energy_low' THEN RETURN track_row.energy_low::text;
    WHEN 'energy_medium' THEN RETURN track_row.energy_medium::text;
    WHEN 'energy_high' THEN RETURN track_row.energy_high::text;
    ELSE
      -- Try metadata JSONB field
      RETURN track_row.metadata->>field_name;
  END CASE;
END;
$$;

-- Helper function to evaluate a single slot rule
CREATE OR REPLACE FUNCTION evaluate_slot_rule(
  rule_operator text,
  rule_value jsonb,
  field_value text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  CASE rule_operator
    WHEN 'eq' THEN
      RETURN field_value = (rule_value #>> '{}');

    WHEN 'neq' THEN
      RETURN field_value != (rule_value #>> '{}');

    WHEN 'in' THEN
      -- Check if field_value is in the array
      RETURN rule_value ? field_value;

    WHEN 'nin' THEN
      -- Check if field_value is NOT in the array
      RETURN NOT (rule_value ? field_value);

    WHEN 'gte' THEN
      RETURN (field_value::numeric) >= (rule_value #>> '{}')::numeric;

    WHEN 'lte' THEN
      RETURN (field_value::numeric) <= (rule_value #>> '{}')::numeric;

    WHEN 'between' THEN
      -- Expects rule_value to be [min, max]
      RETURN (field_value::numeric) >= (rule_value->0)::text::numeric
         AND (field_value::numeric) <= (rule_value->1)::text::numeric;

    WHEN 'exists' THEN
      RETURN field_value IS NOT NULL AND field_value != '';

    ELSE
      RETURN false;
  END CASE;
EXCEPTION
  WHEN OTHERS THEN
    -- If any conversion fails, rule doesn't match
    RETURN false;
END;
$$;

-- Helper function to check if track matches all slot strategy filters
CREATE OR REPLACE FUNCTION check_track_matches_slot_strategy(
  strategy_id_param uuid,
  track_row audio_tracks
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rule_group RECORD;
  rule_record RECORD;
  group_matches boolean;
  rule_results boolean[];
  field_val text;
BEGIN
  -- Get all rule groups for this strategy
  FOR rule_group IN
    SELECT id, logic
    FROM slot_rule_groups
    WHERE strategy_id = strategy_id_param
    ORDER BY "order"
  LOOP
    -- Reset for each group
    rule_results := ARRAY[]::boolean[];

    -- Evaluate all rules in this group
    FOR rule_record IN
      SELECT field, operator, value
      FROM slot_rules
      WHERE group_id = rule_group.id
    LOOP
      -- Get the field value from the track
      field_val := get_track_field_value(rule_record.field, track_row);

      -- Evaluate the rule
      rule_results := array_append(
        rule_results,
        evaluate_slot_rule(rule_record.operator, rule_record.value, field_val)
      );
    END LOOP;

    -- No rules in this group means it passes
    IF array_length(rule_results, 1) IS NULL THEN
      CONTINUE;
    END IF;

    -- Apply group logic (AND/OR)
    IF rule_group.logic = 'AND' THEN
      group_matches := NOT (false = ANY(rule_results));
    ELSE
      group_matches := true = ANY(rule_results);
    END IF;

    -- All groups must pass (implicit AND between groups)
    IF NOT group_matches THEN
      RETURN false;
    END IF;
  END LOOP;

  -- If no rule groups exist, all tracks match
  RETURN true;
END;
$$;

-- Main function: Get bulk track assignments
CREATE OR REPLACE FUNCTION get_bulk_track_assignments(track_ids text[])
RETURNS TABLE (
  track_id text,
  channel_id uuid,
  channel_name text,
  energy_level text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY

  -- Part 1: Traditional playlist_data assignments
  SELECT DISTINCT
    t.track_id::text,
    c.id,
    c.channel_name,
    e.energy
  FROM audio_tracks t
  CROSS JOIN audio_channels c
  CROSS JOIN unnest(ARRAY['low', 'medium', 'high']) AS e(energy)
  WHERE
    t.track_id = ANY(track_ids)
    AND t.deleted_at IS NULL
    AND c.playlist_data IS NOT NULL
    AND c.playlist_data->e.energy->'tracks' IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(c.playlist_data->e.energy->'tracks') AS track_item
      WHERE (track_item->>'track_id')::text = t.track_id::text
    )

  UNION

  -- Part 2: Slot-based strategy assignments
  SELECT DISTINCT
    t.track_id::text,
    ss.channel_id,
    c.channel_name,
    ss.energy_tier
  FROM audio_tracks t
  CROSS JOIN slot_strategies ss
  INNER JOIN audio_channels c ON c.id = ss.channel_id
  WHERE
    t.track_id = ANY(track_ids)
    AND t.deleted_at IS NULL
    AND c.playlist_strategy->ss.energy_tier->>'strategy' = 'slot_based'
    AND check_track_matches_slot_strategy(ss.id, t);

END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_bulk_track_assignments(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_bulk_track_assignments(text[]) TO anon;
GRANT EXECUTE ON FUNCTION check_track_matches_slot_strategy(uuid, audio_tracks) TO authenticated;
GRANT EXECUTE ON FUNCTION check_track_matches_slot_strategy(uuid, audio_tracks) TO anon;
GRANT EXECUTE ON FUNCTION evaluate_slot_rule(text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION evaluate_slot_rule(text, jsonb, text) TO anon;
GRANT EXECUTE ON FUNCTION get_track_field_value(text, audio_tracks) TO authenticated;
GRANT EXECUTE ON FUNCTION get_track_field_value(text, audio_tracks) TO anon;

-- Create indexes to speed up lookups
CREATE INDEX IF NOT EXISTS idx_audio_channels_playlist_data ON audio_channels USING gin (playlist_data);
CREATE INDEX IF NOT EXISTS idx_slot_strategies_channel_energy ON slot_strategies (channel_id, energy_tier);
CREATE INDEX IF NOT EXISTS idx_slot_rule_groups_strategy ON slot_rule_groups (strategy_id);
CREATE INDEX IF NOT EXISTS idx_slot_rules_group ON slot_rules (group_id);

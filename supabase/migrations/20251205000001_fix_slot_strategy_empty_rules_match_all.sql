/*
  # Fix: Empty slot strategy rules should not match all tracks

  ## Problem
  When a slot strategy has no rule groups defined, the `check_track_matches_slot_strategy` 
  function was returning `true`, causing ALL tracks to appear as "assigned" to channels 
  using that strategy. This meant newly uploaded tracks would incorrectly show many 
  channel assignments.

  ## Solution
  Change the default behavior: if no rule groups exist, return `false` (no match).
  Tracks should only be considered "assigned" when:
  1. They are explicitly in a channel's playlist_data, OR
  2. They match defined slot strategy filter rules

  ## Impact
  - Channels with empty slot strategy rules will show 0 assigned tracks (correct)
  - New tracks will have no automatic channel assignments (correct)
  - Existing tracks assigned via playlist_data are unaffected
  - Existing tracks matching defined rules are unaffected
*/

-- Recreate the function with the fix
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
  has_rule_groups boolean := false;
BEGIN
  -- Get all rule groups for this strategy
  FOR rule_group IN
    SELECT id, logic
    FROM slot_rule_groups
    WHERE strategy_id = strategy_id_param
    ORDER BY "order"
  LOOP
    has_rule_groups := true;
    
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

  -- FIX: If no rule groups exist, no tracks match by default
  -- Tracks must be explicitly assigned via rules or playlist_data
  IF NOT has_rule_groups THEN
    RETURN false;
  END IF;

  -- All rule groups passed
  RETURN true;
END;
$$;

-- Ensure permissions are maintained
GRANT EXECUTE ON FUNCTION check_track_matches_slot_strategy(uuid, audio_tracks) TO authenticated;
GRANT EXECUTE ON FUNCTION check_track_matches_slot_strategy(uuid, audio_tracks) TO anon;

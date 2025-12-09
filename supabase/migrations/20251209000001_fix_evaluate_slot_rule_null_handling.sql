-- Fix: evaluate_slot_rule NULL value handling
-- Bug: NULL field values caused NULL comparisons which propagated through
-- slot strategy matching logic, incorrectly matching tracks to channels
-- 
-- Solution: Explicitly return false for NULL field values (except 'exists' operator)

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
  -- Handle NULL field values - they should not match any rule except 'exists'
  IF field_value IS NULL AND rule_operator != 'exists' THEN
    RETURN false;
  END IF;

  CASE rule_operator
    WHEN 'eq' THEN
      RETURN field_value = (rule_value #>> '{}');

    WHEN 'neq' THEN
      RETURN field_value IS NULL OR field_value != (rule_value #>> '{}');

    WHEN 'in' THEN
      RETURN rule_value ? field_value;

    WHEN 'nin' THEN
      RETURN field_value IS NULL OR NOT (rule_value ? field_value);

    WHEN 'gte' THEN
      RETURN (field_value::numeric) >= (rule_value #>> '{}')::numeric;

    WHEN 'lte' THEN
      RETURN (field_value::numeric) <= (rule_value #>> '{}')::numeric;

    WHEN 'between' THEN
      RETURN (field_value::numeric) >= (rule_value->0)::text::numeric
         AND (field_value::numeric) <= (rule_value->1)::text::numeric;

    WHEN 'exists' THEN
      RETURN field_value IS NOT NULL AND field_value != '';

    ELSE
      RETURN false;
  END CASE;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$;

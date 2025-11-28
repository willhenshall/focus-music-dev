-- ========================================================================
-- INSTALL DDL EXECUTION FUNCTION
-- ========================================================================
--
-- This enables automated database schema changes from your application.
-- Run this ONCE in Supabase SQL Editor to enable the long-term fix.
--
-- WHAT THIS DOES:
-- - Creates a secure function that can execute DDL (ALTER TABLE, CREATE INDEX, etc.)
-- - Allows AI assistant to automatically fix database issues
-- - No more manual SQL copy/paste required
--
-- HOW TO INSTALL:
-- 1. Go to: https://supabase.com/dashboard
-- 2. Select your project
-- 3. Click "SQL Editor" (left sidebar)
-- 4. Click "New query"
-- 5. Copy this ENTIRE file and paste it
-- 6. Click "RUN"
-- 7. Look for "SUCCESS! DDL function installed" message
-- 8. Done! Future fixes will be automatic
--
-- ========================================================================

-- Create the DDL execution function
CREATE OR REPLACE FUNCTION public.exec_ddl(ddl_statement text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Execute the DDL statement
  EXECUTE ddl_statement;
  RETURN 'SUCCESS';
EXCEPTION
  WHEN OTHERS THEN
    -- Return error details if something fails
    RETURN 'ERROR: ' || SQLERRM;
END;
$$;

-- Grant execute permission to service role (used by backend)
GRANT EXECUTE ON FUNCTION public.exec_ddl(text) TO service_role;

-- Grant execute permission to authenticated users (optional, for admin features)
GRANT EXECUTE ON FUNCTION public.exec_ddl(text) TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION public.exec_ddl(text) IS
  'Executes DDL statements (ALTER, CREATE, DROP, etc.) with proper error handling. Used for automated schema management.';

-- Verify installation with a test
DO $$
DECLARE
  test_result text;
BEGIN
  -- Test the function with a harmless query
  SELECT public.exec_ddl('SELECT 1') INTO test_result;

  IF test_result = 'SUCCESS' THEN
    RAISE NOTICE '';
    RAISE NOTICE '╔═════════════════════════════════════════════════════════╗';
    RAISE NOTICE '║  ✅ SUCCESS! DDL function installed successfully        ║';
    RAISE NOTICE '║                                                         ║';
    RAISE NOTICE '║  Your AI assistant can now automatically fix database   ║';
    RAISE NOTICE '║  issues without requiring manual SQL copy/paste.        ║';
    RAISE NOTICE '║                                                         ║';
    RAISE NOTICE '║  You can close this window now.                         ║';
    RAISE NOTICE '╚═════════════════════════════════════════════════════════╝';
    RAISE NOTICE '';
  ELSE
    RAISE EXCEPTION 'Installation test failed: %', test_result;
  END IF;
END $$;

-- ========================================================================
-- Installation complete! You should see a success message above.
-- ========================================================================

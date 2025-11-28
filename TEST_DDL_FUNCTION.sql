-- ========================================================================
-- TEST DDL FUNCTION - Verify Installation
-- ========================================================================
--
-- Run this to verify the exec_ddl function is working correctly.
-- This is optional - only run if you want to test before using it.
--
-- HOW TO RUN:
-- 1. Go to: https://supabase.com/dashboard
-- 2. Select your project
-- 3. Click "SQL Editor" (left sidebar)
-- 4. Click "New query"
-- 5. Copy this ENTIRE file and paste it
-- 6. Click "RUN"
-- 7. Look for test results
--
-- ========================================================================

-- Test 1: Check if function exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'exec_ddl'
      AND pg_catalog.pg_function_is_visible(oid)
  ) THEN
    RAISE NOTICE '✅ Test 1 PASSED: exec_ddl function exists';
  ELSE
    RAISE EXCEPTION '❌ Test 1 FAILED: exec_ddl function not found. Run INSTALL_DDL_FUNCTION.sql first!';
  END IF;
END $$;

-- Test 2: Execute harmless DDL
DO $$
DECLARE
  result text;
BEGIN
  SELECT public.exec_ddl('SELECT 1') INTO result;

  IF result = 'SUCCESS' THEN
    RAISE NOTICE '✅ Test 2 PASSED: Function executes successfully';
  ELSE
    RAISE EXCEPTION '❌ Test 2 FAILED: Function returned: %', result;
  END IF;
END $$;

-- Test 3: Create and drop a test table
DO $$
DECLARE
  create_result text;
  drop_result text;
BEGIN
  -- Create test table
  SELECT public.exec_ddl('CREATE TABLE IF NOT EXISTS _test_ddl_table (id int)') INTO create_result;

  IF create_result != 'SUCCESS' THEN
    RAISE EXCEPTION '❌ Test 3 FAILED: Could not create table: %', create_result;
  END IF;

  -- Drop test table
  SELECT public.exec_ddl('DROP TABLE IF EXISTS _test_ddl_table') INTO drop_result;

  IF drop_result != 'SUCCESS' THEN
    RAISE EXCEPTION '❌ Test 3 FAILED: Could not drop table: %', drop_result;
  END IF;

  RAISE NOTICE '✅ Test 3 PASSED: Can create and drop tables';
END $$;

-- Test 4: Verify permissions
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_name = 'exec_ddl'
      AND grantee IN ('service_role', 'authenticated')
  ) THEN
    RAISE NOTICE '✅ Test 4 PASSED: Permissions granted correctly';
  ELSE
    RAISE WARNING '⚠️  Test 4 WARNING: Permissions may not be set correctly';
  END IF;
END $$;

-- Final result
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '╔═════════════════════════════════════════════════════════╗';
  RAISE NOTICE '║  🎉 ALL TESTS PASSED!                                   ║';
  RAISE NOTICE '║                                                         ║';
  RAISE NOTICE '║  The exec_ddl function is working correctly.            ║';
  RAISE NOTICE '║  Your AI assistant can now automate database fixes.     ║';
  RAISE NOTICE '╚═════════════════════════════════════════════════════════╝';
  RAISE NOTICE '';
END $$;

-- ========================================================================
-- If all tests passed, the function is ready to use!
-- ========================================================================

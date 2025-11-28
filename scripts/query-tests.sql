-- Query to view all Playwright tests in a readable format

SELECT
  test_name,
  test_file,
  test_command,
  feature_area,
  status,
  last_run_status,
  to_char(last_run_date, 'YYYY-MM-DD HH24:MI') as last_run
FROM playwright_test_registry
ORDER BY
  feature_area,
  test_name;

-- Query to get test statistics
SELECT
  feature_area,
  COUNT(*) as test_count,
  SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_tests,
  SUM(CASE WHEN last_run_status = 'passed' THEN 1 ELSE 0 END) as passed_tests,
  SUM(CASE WHEN last_run_status = 'failed' THEN 1 ELSE 0 END) as failed_tests
FROM playwright_test_registry
GROUP BY feature_area
ORDER BY feature_area;

-- Query to find tests that haven't been run recently
SELECT
  test_name,
  test_file,
  CASE
    WHEN last_run_date IS NULL THEN 'Never run'
    ELSE to_char(last_run_date, 'YYYY-MM-DD HH24:MI')
  END as last_run,
  last_run_status
FROM playwright_test_registry
WHERE last_run_date IS NULL
   OR last_run_date < NOW() - INTERVAL '7 days'
ORDER BY last_run_date NULLS FIRST;

-- Query to add a new test (template)
/*
INSERT INTO playwright_test_registry (
  test_name,
  test_file,
  test_command,
  description,
  feature_area,
  status
) VALUES (
  'Your Test Name',
  'your-test-file.spec.ts',
  'npm run test -- your-test-file.spec.ts',
  'Detailed description of what this test covers',
  'admin', -- or 'user', 'end-to-end', 'auth'
  'active' -- or 'wip', 'deprecated'
);
*/

-- Query to update test status after running
/*
UPDATE playwright_test_registry
SET
  last_run_date = NOW(),
  last_run_status = 'passed' -- or 'failed'
WHERE test_file = 'your-test-file.spec.ts';
*/

# Testing Standards

## Pass Rate Requirements

**CRITICAL: ALL tests must achieve 100% pass rate.**

Any pass rate below 100% is NOT acceptable and indicates:
- Bugs in the application code
- Issues with test data or configuration
- Problems that must be fixed before deployment

## Test Registry

All Playwright tests are tracked in the `playwright_test_registry` table and must:
1. Self-report results to the database after each run
2. Include accurate duration, status, and error information
3. Maintain 100% pass rate in production

## Current Tests

### End-to-End Tests
- **Complete User Flow** - Full user journey from landing to all features
  - Required pass rate: 100%
  - Feature area: end-to-end
  - Status: ✅ Database recording implemented
  - Test file: `complete-user-flow.spec.ts`

### User Tests
- **Channel Energy Level Validation** - Validates correct track playback per energy level
  - Required pass rate: 100%
  - Feature area: user
  - Status: ✅ Database recording implemented
  - Test file: `channel-energy-validation.spec.ts`
  - Note: Test validates all 23 channels with track data across low/medium/high energy levels

- **Energy Level Changes** - Tests dynamic energy level switching
  - Required pass rate: 100%
  - Feature area: user
  - Status: ⚠️ Database recording NOT yet implemented
  - Test file: `energy-level-changes.spec.ts`

- **Slot Sequence Playback** - Tests slot-based sequence functionality
  - Required pass rate: 100%
  - Feature area: user
  - Status: ⚠️ Database recording NOT yet implemented
  - Test file: `slot-sequence-playback.spec.ts`

### Admin Tests
- **Admin Bulk Delete Users** - Tests bulk user deletion
  - Required pass rate: 100%
  - Feature area: admin
  - Status: ⚠️ Database recording NOT yet implemented
  - Test file: `admin-bulk-delete-users.spec.ts`

- **Admin Channel Images** - Tests channel image management
  - Required pass rate: 100%
  - Feature area: admin
  - Status: ⚠️ Database recording NOT yet implemented
  - Test file: `admin-channel-images.spec.ts`

- **Admin Slot Strategy** - Tests slot strategy configuration
  - Required pass rate: 100%
  - Feature area: admin
  - Status: ⚠️ Database recording NOT yet implemented
  - Test file: `admin-slot-strategy.spec.ts`

## Test Implementation Requirements

All tests must:
1. Include database recording teardown (see `complete-user-flow.spec.ts` and `channel-energy-validation.spec.ts` for examples)
2. Record test registry entry with: test_name, test_file, test_command, description, feature_area
3. Record test run with accurate: status, duration_ms, passed_count, failed_count
4. Record test case details with: test_name, status, duration_ms, error_message

## Monitoring

Test results are visible in:
- Admin Dashboard → Tests Tab
- Database tables: `playwright_test_registry`, `playwright_test_runs`, `playwright_test_cases`

**Database Documentation:**
- The `playwright_test_registry` table has a table comment documenting the 100% pass rate requirement
- The `playwright_test_runs` table has a table comment emphasizing that failed runs are not acceptable
- These comments are permanent and visible when inspecting the database schema

## Action on Failures

When a test fails:
1. Investigate immediately - 100% pass rate is required
2. Fix the underlying issue (not the test)
3. Re-run until 100% pass rate is achieved
4. Do not deploy with failing tests

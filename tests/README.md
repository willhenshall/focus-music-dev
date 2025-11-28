# Playwright Testing Guide

## Overview

Tests run against the **production database in READ-ONLY mode** to verify app functionality without risking data corruption. This provides confidence that new changes don't break existing features.

## Setup

1. **Configure test credentials in `.env.test`:**
   - Use your actual production user credentials
   - Update `TEST_ADMIN_EMAIL` and `TEST_USER_EMAIL` with real accounts
   - Tests will NOT create or modify users

2. **Install browser dependencies (first time only):**
   ```bash
   npx playwright install chromium --with-deps
   ```

3. **Verify setup:**
   ```bash
   npm run seed-test-db
   ```
   This checks that the database has required data.

## Running Tests

### Run all tests (headless):
```bash
npm test
```

### Run tests with UI (visual mode):
```bash
npm run test:ui
```

### Run tests with browser visible:
```bash
npm run test:headed
```

### Debug tests step-by-step:
```bash
npm run test:debug
```

### View test report:
```bash
npm run test:report
```

### Run specific test file:
```bash
npx playwright test slot-sequence-playback
```

### Run tests on mobile:
```bash
npx playwright test --project=mobile
```

## Test Structure

### Critical Path Tests
- `slot-sequence-playback.spec.ts` - Tests for slot sequence channel playback continuity
- `energy-level-changes.spec.ts` - Tests for energy level switching without latency

### Admin Tests
- `admin-slot-strategy.spec.ts` - Tests for global filters and slot strategy editor

### Helper Functions
- `tests/helpers/auth.ts` - Login/logout utilities
- `tests/helpers/player.ts` - Music player interaction utilities

## Writing New Tests

1. Create a new `.spec.ts` file in the `tests/` directory
2. Import helpers from `tests/helpers/`
3. Use descriptive test names that explain what's being tested
4. Add assertions to verify expected behavior

Example:
```typescript
import { test, expect } from '@playwright/test';
import { loginAsUser } from './helpers/auth';

test('should do something', async ({ page }) => {
  await loginAsUser(page);
  // Your test code here
});
```

## Test Safety

**Tests are READ-ONLY:**
- No data is created, modified, or deleted during tests
- Tests only verify that existing features work correctly
- Safe to run against production database
- Multiple developers can run tests simultaneously

**Test Data Requirements:**
- Tests assume channels exist: "The Deep", "The Duke", "The Grid", "Tranquility"
- Tests assume admin user has admin flag set in `user_profiles` table
- Tests assume tracks are available in the database

## CI/CD Integration

To run tests in CI:
```bash
CI=true npm test
```

This will:
- Enable automatic retries (2 retries)
- Run tests with 1 worker (sequential)
- Fail if `.only` is used in tests

## Common Issues

### Browser dependencies missing
Run: `npx playwright install-deps`

### Test users don't exist
Create them manually in Supabase auth, then set admin flag for admin user

### Timeouts
Increase timeout in test if needed:
```typescript
test('slow test', async ({ page }) => {
  test.setTimeout(60000); // 60 seconds
  // test code
});
```

### Selectors not found
Update selectors in helper functions or use `--debug` to inspect page

## Adding Test Data Attributes

For more reliable tests, add `data-testid` attributes to key elements:

```tsx
<button data-testid="play-button">Play</button>
<div data-testid="music-player-footer">...</div>
<button data-testid="energy-high">High</button>
```

This makes tests more resilient to UI changes.

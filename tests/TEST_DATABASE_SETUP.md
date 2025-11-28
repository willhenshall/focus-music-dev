# Test Database Setup Guide

This project uses a **separate Supabase database** for testing to ensure complete isolation from development and production data.

## Why Separate Test Database?

- ✅ **Zero risk** to development data
- ✅ **Parallel testing** - run tests while developing
- ✅ **Reproducible state** - each test run starts fresh
- ✅ **Destructive testing** - safely test delete operations
- ✅ **CI/CD ready** - automated pipelines won't affect dev

## Setup Instructions

### 1. Create a New Supabase Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Click **"New Project"**
3. Name it: `focus-music-test` (or similar)
4. Choose a region and strong database password
5. Wait for project creation (2-3 minutes)

### 2. Get Test Database Credentials

1. In your new test project, go to **Settings → API**
2. Copy the following values:
   - **Project URL** (e.g., `https://xyz.supabase.co`)
   - **anon public** key
   - **service_role** key (click "Reveal" and copy)

### 3. Update .env.test

Edit `.env.test` and replace the placeholder values:

```bash
# Test Supabase Database (separate project from dev/prod)
SUPABASE_URL=https://your-test-project.supabase.co
SUPABASE_ANON_KEY=your-test-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-test-service-role-key-here

VITE_SUPABASE_URL=https://your-test-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-test-anon-key-here
VITE_SUPABASE_SERVICE_ROLE_KEY=your-test-service-role-key-here
```

### 4. Apply Database Migrations

The test database needs the same schema as your dev database:

```bash
# Apply all migrations to test database
# (This will be automated in the future)
```

For now, you can:
- Use Supabase CLI: `supabase db push` (if configured)
- Or manually run migrations from `supabase/migrations/` folder in SQL Editor

### 5. Seed Test Data

Run the seeding script to populate test channels, tracks, and users:

```bash
npm run seed-test-db
```

This will:
- Create test admin user (`admin@test.com`)
- Create test regular user (`user@test.com`)
- Seed 3 test channels (The Deep, Tranquility, Bongo Turbo)
- Seed 9 test tracks (3 per channel at different energy levels)

### 6. Run Tests

Now your tests will use the isolated test database:

```bash
npm run test          # Run all tests
npm run test:single   # Run single test
npm run test:headed   # Run with visible browser
npm run test:debug    # Debug mode
```

## How It Works

1. **Playwright config** loads `.env.test` before tests run
2. **Global setup** (`tests/global-setup.ts`) seeds the database
3. **Tests** connect to test database via environment variables
4. **Complete isolation** - dev database is never touched

## Test Data

### Users
- **Admin**: `admin@test.com` / `testpass123`
- **User**: `user@test.com` / `testpass123`

### Channels
- The Deep (medium intensity)
- Tranquility (low intensity)
- Bongo Turbo (high intensity)

### Tracks
Each channel has 3 tracks (low/medium/high energy)

## Maintenance

### Reset Test Database

To wipe and reseed the test database:

```bash
npm run seed-test-db
```

### Check Test Database

You can view your test database in Supabase Dashboard:
1. Switch to your test project
2. Go to **Table Editor**
3. View `audio_channels`, `audio_tracks`, `user_profiles`

## Troubleshooting

### Tests fail with "Missing Supabase credentials"

- Check that `.env.test` has valid credentials
- Ensure you're using the test project URL, not dev

### Tests fail with "relation does not exist"

- Migrations haven't been applied to test database
- Run migrations on test project

### Want to use dev database for tests?

Not recommended, but you can copy `.env` values to `.env.test` as a temporary workaround.

## Best Practices

1. **Never commit** `.env.test` with real credentials
2. **Always use** test users for authentication tests
3. **Clean up** test data if you manually add any
4. **Reseed regularly** to ensure consistent test state
5. **Monitor** test database size and reset if needed

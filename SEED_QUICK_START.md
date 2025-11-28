# Database Seed System - Quick Start

## Before Exporting to StackBlitz

Run one command to export your database:

```bash
npm run export-seed-quick
```

This creates `database-seed-quick.json` with all essential configuration data.

## After Importing Back to Bolt

Run one command to rebuild your database:

```bash
npm run import-seed-quick
```

Then verify it worked:

```bash
npm run verify-seed
```

## That's It!

Your database is now fully reconstructed with all channels, quiz data, and configurations.

---

## Available Commands

| Command | Purpose |
|---------|---------|
| `npm run export-seed-quick` | Export essential config (recommended) |
| `npm run export-seed` | Export everything including user data |
| `npm run import-seed-quick` | Import essential config |
| `npm run import-seed` | Import everything |
| `npm run verify-seed` | Check what data is in database |

## Files Created

After export, you'll have:
- `database-seed-quick.json` - Essential config only (~100 KB)
- `database-seed-complete.json` - All data (~5-50 MB)

Include these in your StackBlitz export!

## What Gets Saved

Essential tables:
- **audio_channels** - All your music channels
- **quiz_questions** - Quiz setup
- **quiz_answers** - Quiz options
- **system_preferences** - App settings

Optional tables (also saved with quick export):
- audio_tracks
- user_profiles
- image_sets
- slot_strategies
- And more...

## Troubleshooting

**"Invalid API key" error?**
- Database might be paused
- Try again when Supabase is active

**Import failed?**
- Make sure migrations ran first
- Check `.env` has correct credentials

**Need more help?**
- See `DATABASE_SEED_INSTRUCTIONS.md`
- See `DATABASE_SEED_README.md`
- See `SEED_SYSTEM_SUMMARY.md`

---

## Complete Workflow

### 1. Export (Current Environment)
```bash
npm run export-seed-quick
```

### 2. Transfer
- Export project to StackBlitz
- Fork in StackBlitz
- Import back to Bolt

### 3. Import (New Environment)
```bash
# Wait for migrations to complete
npm run import-seed-quick
```

### 4. Verify
```bash
npm run verify-seed
```

### 5. Done!
Your database is fully restored.

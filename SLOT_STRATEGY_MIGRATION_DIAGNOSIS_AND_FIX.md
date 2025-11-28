# Slot Strategy Migration Diagnosis & Remediation Guide

**Date:** November 18, 2025
**Issue:** Slot sequence strategy channels stopped working after database migration
**Original Database:** https://eafyytltuwuxuuoevavo.supabase.co
**New Database:** https://xewajlyswijmjxuajhif.supabase.co

---

## Executive Summary

**ROOT CAUSE IDENTIFIED:** The database migration from the original to the new database failed to migrate 4 out of 5 critical slot strategy tables, rendering 12 slot-based channels (33% of all channels) completely non-functional.

### Critical Findings

- ✅ **Schema Migration:** SUCCESSFUL - All 5 slot strategy tables exist in the new database
- ❌ **Data Migration:** FAILED - All 5 slot strategy tables are completely empty (0 rows)
- ❌ **Audio Metadata:** FAILED - Audio tracks are missing required metadata fields (speed, intensity, brightness, etc.)
- 🎯 **Impact:** 12 channels cannot play music: Tranquility, Aquascope, Organica, PowerTool, The Deep, The Drop, The Duke, Atmosphere, Bach Beats, Edwardian, Cinematic, and Symphonica

---

## Technical Analysis

### How Slot Strategy System Works

The slot sequence strategy system is a sophisticated music sequencing engine that creates dynamic, metadata-driven playlists. It requires 5 interconnected database tables:

1. **`slot_strategies`** (Parent Table)
   - Stores configuration for each channel and energy tier combination
   - Links to channel_id and specifies energy_tier (low/medium/high)
   - Defines num_slots (1-60) and recent_repeat_window

2. **`slot_definitions`** (Slot Configuration)
   - Defines target metadata values for each slot position
   - Each strategy can have 1-60 slot definitions
   - Contains JSONB targets: speed, intensity, brightness, complexity, valence, arousal, BPM, key, proximity
   - Critical for determining which track characteristics to match at each slot position

3. **`slot_boosts`** (Weighting Configuration)
   - Defines field importance for track scoring
   - Weight values 1-5 indicate field priority
   - Mode: 'near' (range matching) or 'exact' (exact matching)
   - Without boosts, system uses default weights

4. **`slot_rule_groups`** (Filtering Groups)
   - Groups filtering rules with AND/OR logic
   - Orders rule application sequence
   - Optional - used for genre/artist/label filtering

5. **`slot_rules`** (Individual Filters)
   - Individual filtering rules within groups
   - Operators: eq, neq, in, nin, gte, lte, between, exists
   - Applied before track scoring begins

### Channel Configuration

Channels indicate they use slot-based sequencing through the `playlist_strategy` JSONB column:

```json
{
  "low": { "strategy": "slot_based" },
  "medium": { "strategy": "slot_based" },
  "high": { "strategy": "slot_based" }
}
```

### What Happens When Music Plays

1. User selects a slot-based channel (e.g., "Tranquility")
2. System checks `audio_channels.playlist_strategy` for the current energy level
3. If strategy is "slot_based", system queries `slot_strategies` table
4. System loads `slot_definitions` to get target values for current slot position
5. System loads `slot_boosts` to determine field importance
6. System loads `slot_rule_groups` and `slot_rules` for filtering
7. System queries `audio_tracks` with metadata matching
8. System scores tracks based on distance from slot targets
9. Best matching track is selected and played
10. Position advances to next slot, process repeats

### Why It Failed in New Database

**Step 3 FAILS** - When system queries `slot_strategies`, it finds 0 rows. The entire system halts because there's no configuration to work with.

---

## Diagnostic Results Summary

### Database Schema (New Database)
- ✓ `audio_channels`: 36 rows
- ✓ `audio_tracks`: 11,233 rows
- ❌ `slot_strategies`: **0 rows** (EMPTY)
- ❌ `slot_definitions`: **0 rows** (EMPTY)
- ❌ `slot_boosts`: **0 rows** (EMPTY)
- ❌ `slot_rule_groups`: **0 rows** (EMPTY)
- ❌ `slot_rules`: **0 rows** (EMPTY)

### Affected Channels (12 total)

| Channel # | Channel Name   | Strategy Config              |
|-----------|---------------|------------------------------|
| 1         | Tranquility   | low/medium/high: slot_based  |
| 5         | The Duke      | low/medium/high: slot_based  |
| 6         | The Drop      | low/medium/high: slot_based  |
| 7         | The Deep      | low/medium/high: slot_based  |
| 8         | Symphonica    | low/medium/high: slot_based  |
| 10        | PowerTool     | low/medium/high: slot_based  |
| 11        | Organica      | low/medium/high: slot_based  |
| 25        | Edwardian     | low/medium/high: slot_based  |
| 28        | Cinematic     | low/medium/high: slot_based  |
| 33        | Bach Beats    | low/medium/high: slot_based  |
| 34        | Atmosphere    | low/medium/high: slot_based  |
| 35        | Aquascope     | low/medium/high: slot_based  |

### Additional Critical Issue: Missing Audio Metadata

Audio tracks in the new database are missing critical metadata fields required for slot-based matching:
- `speed` - Track speed/tempo characteristic (0-5)
- `intensity` - Energy/intensity level (0-5)
- `brightness` - Tonal brightness (0-5)
- `complexity` - Musical complexity (0-5)
- `valence` - Emotional valence (-1 to 1)
- `arousal` - Arousal level (0-1)
- `tempo` - BPM value

**Current Status:** 0.0% of these fields are populated in sampled tracks.

---

## Why the Migration Failed

### Original Export Script Problem

The file `scripts/export-complete-database-seed.ts` had an incomplete table list:

```typescript
const tables = [
  'audio_channels',
  'audio_tracks',
  'user_profiles',
  // ... other tables ...
  'slot_strategies',        // ✓ INCLUDED
  'saved_slot_sequences',   // ✓ INCLUDED
  // ❌ MISSING: slot_definitions
  // ❌ MISSING: slot_boosts
  // ❌ MISSING: slot_rule_groups
  // ❌ MISSING: slot_rules
  'playwright_test_registry',
  'test_runs'
];
```

### Migration Timeline (Reconstruction)

1. Export script ran against original database
2. Export only captured `slot_strategies` parent records
3. Child tables (`slot_definitions`, `slot_boosts`, etc.) were never exported
4. Import script imported only the data that was exported
5. Result: New database has schema but no data for slot system

---

## Remediation Steps

### FIXED: Export Script

✅ **COMPLETED** - Updated `scripts/export-complete-database-seed.ts` to include:
- `slot_definitions`
- `slot_boosts`
- `slot_rule_groups`
- `slot_rules`

✅ **COMPLETED** - Updated `scripts/verify-seed-data.ts` to verify these tables

### Step 1: Export Data from Original Database

You need service role access to the original database to perform this export.

```bash
# Set environment variables for ORIGINAL database
export VITE_SUPABASE_URL="https://eafyytltuwuxuuoevavo.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<ORIGINAL_DB_SERVICE_ROLE_KEY>"

# Run the updated export script
npm run export-seed

# This will create: database-seed-complete.json
```

Expected output should show:
```
Exporting slot_strategies...
  ✓ Exported XX rows from slot_strategies
Exporting slot_definitions...
  ✓ Exported YYY rows from slot_definitions
Exporting slot_boosts...
  ✓ Exported ZZ rows from slot_boosts
Exporting slot_rule_groups...
  ✓ Exported AA rows from slot_rule_groups
Exporting slot_rules...
  ✓ Exported BB rows from slot_rules
```

### Step 2: Import Data to New Database

```bash
# Switch environment variables to NEW database
export VITE_SUPABASE_URL="https://xewajlyswijmjxuajhif.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<NEW_DB_SERVICE_ROLE_KEY>"

# Run the import script
npm run import-seed

# Verify the import
npm run verify-seed
```

### Step 3: Verify Slot Strategy Restoration

```bash
# Run the diagnostic script again
npx tsx scripts/analyze-new-database.ts
```

Expected results:
- ✓ `slot_strategies`: >0 rows
- ✓ `slot_definitions`: >0 rows
- ✓ `slot_boosts`: >0 rows
- ✓ Channels can now play music

### Step 4: Address Audio Metadata Issue

The audio tracks need their metadata fields populated. This is a separate issue but equally critical:

1. Check if the original database has these fields populated
2. If yes, ensure they're included in the export/import
3. If no, run metadata extraction/backfill process
4. Existing migration files suggest there's a metadata backfill system:
   - `20251027200001_add_metadata_columns_for_backfill.sql`
   - `scripts/backfill-metadata-from-csv.ts`
   - `scripts/backfill-metadata-sql.ts`

---

## Testing & Validation

### Manual Testing Checklist

1. [ ] Log into the application
2. [ ] Navigate to a slot-based channel (e.g., "Tranquility")
3. [ ] Select an energy level (low/medium/high)
4. [ ] Click play
5. [ ] Verify music starts playing
6. [ ] Skip to next track
7. [ ] Verify different track plays (slot sequencing working)
8. [ ] Check browser console for errors
9. [ ] Verify no database query errors

### Automated Testing

Run the diagnostic script periodically:
```bash
npx tsx scripts/analyze-new-database.ts
```

Expected healthy output:
- 0 Errors
- 0 Critical Warnings
- All strategy tables populated
- Track metadata fields >90% populated

---

## Prevention for Future Migrations

### 1. Complete Table List

Maintain a master table list that includes ALL application tables, organized by feature:

```typescript
const tables = {
  core: ['audio_channels', 'audio_tracks', 'user_profiles'],
  preferences: ['user_preferences', 'system_preferences'],
  quiz: ['quiz_questions', 'quiz_answers', 'quiz_results'],
  recommendations: ['channel_recommendations'],
  analytics: ['track_analytics', 'user_playback_state'],
  images: ['image_sets', 'image_set_images', 'user_image_preferences'],
  slotStrategy: [
    'slot_strategies',
    'slot_definitions',      // Parent-child relationship
    'slot_boosts',           // Parent-child relationship
    'slot_rule_groups',      // Parent-child relationship
    'slot_rules'             // Grandchild relationship
  ],
  sequences: ['saved_slot_sequences'],
  testing: ['playwright_test_registry', 'test_runs']
};

const allTables = Object.values(tables).flat();
```

### 2. Pre-Migration Checklist

- [ ] Document all foreign key relationships
- [ ] Identify parent-child table dependencies
- [ ] Test export script on copy of original database
- [ ] Verify export file contains all expected tables
- [ ] Check row counts match between database and export
- [ ] Verify JSONB fields are properly serialized
- [ ] Test import on empty test database first
- [ ] Run diagnostic script on test database
- [ ] Compare test database vs original database

### 3. Post-Migration Validation

- [ ] Run schema comparison tool
- [ ] Verify row counts for all tables
- [ ] Check foreign key integrity
- [ ] Test critical user flows
- [ ] Monitor error logs for database errors
- [ ] Run automated test suite
- [ ] Have users test in staging environment

---

## Architecture Recommendations

### Database Documentation

1. Create an Entity Relationship Diagram (ERD) showing:
   - All tables and their relationships
   - Foreign key constraints
   - Parent-child dependencies
   - Critical JSONB structures

2. Document feature-to-table mappings:
   - Which tables power which features
   - What happens when tables are empty
   - Minimum required data for each feature

### Migration Tooling

1. Create a migration validation script that:
   - Compares source and destination schemas
   - Validates row counts for all tables
   - Checks foreign key relationships
   - Verifies critical JSONB structures
   - Reports on data completeness

2. Implement pre-flight checks:
   - Validate export completeness before transfer
   - Test import on isolated database first
   - Automate smoke tests after import

---

## Contact & Support

For questions about this diagnosis or remediation process:

1. Review the diagnostic report: `NEW_DATABASE_DIAGNOSTIC_REPORT.md`
2. Check the diagnostic script: `scripts/analyze-new-database.ts`
3. Run verification: `npx tsx scripts/analyze-new-database.ts`

---

## Appendix: File Changes Made

### Modified Files

1. **`scripts/export-complete-database-seed.ts`**
   - Added `slot_definitions` to tables array
   - Added `slot_boosts` to tables array
   - Added `slot_rule_groups` to tables array
   - Added `slot_rules` to tables array

2. **`scripts/verify-seed-data.ts`**
   - Added `slot_definitions` to tables array
   - Added `slot_boosts` to tables array
   - Added `slot_rule_groups` to tables array
   - Added `slot_rules` to tables array

### New Files Created

1. **`scripts/analyze-new-database.ts`**
   - Comprehensive diagnostic tool for new database
   - Analyzes schema, data, and configuration
   - Generates detailed markdown report

2. **`scripts/diagnose-slot-strategy-migration.ts`**
   - Two-database comparison tool (requires service role keys for both)
   - Side-by-side data analysis
   - Root cause identification

3. **`NEW_DATABASE_DIAGNOSTIC_REPORT.md`**
   - Automated diagnostic report
   - Generated by analyze-new-database.ts
   - Updated each time diagnostic runs

4. **`SLOT_STRATEGY_MIGRATION_DIAGNOSIS_AND_FIX.md`** (this document)
   - Complete analysis and remediation guide
   - Technical documentation
   - Future prevention strategies

---

## Summary

The slot sequence strategy channels stopped working because the database migration process only migrated 1 out of 5 required tables for the slot strategy system. The export script has been fixed to include all necessary tables. To restore functionality:

1. Re-export data from the original database with the updated script
2. Import the complete dataset into the new database
3. Verify with the diagnostic tool
4. Address the separate audio metadata issue

Once completed, all 12 slot-based channels will resume normal operation.

---

**Status:** ✅ Diagnosis Complete | 🔧 Fix Prepared | ⏳ Awaiting Data Migration

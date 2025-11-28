# Track ID Duplicate Fix - Quick Deployment Guide

## ⚠️ Critical Bug Fixed
Multiple tracks receiving duplicate track_ids during batch uploads.

## 🚀 Quick Fix (5 minutes)

### Step 1: Install Database Sequence (2 minutes)
```bash
# Open: Supabase Dashboard → SQL Editor
# Run: APPLY_TRACK_ID_SEQUENCE.sql
```

✅ **Expected output**: "Sequence created starting at: 99994"

### Step 2: Clean Up Duplicates (2 minutes)
```bash
# In Supabase SQL Editor
# Run: CLEANUP_DUPLICATE_TRACK_IDS.sql
```

✅ **Expected output**: "No duplicate track_ids found"

### Step 3: Deploy Code (1 minute)
```bash
npm run build
# Deploy to production
```

✅ **Build version**: 1508

## ✅ Verification

Test single upload:
```
1. Upload one track
2. Check console: "Assigned track_id [number]"
3. Verify sequential ID
```

Test bulk upload:
```
1. Upload 10 tracks
2. Check Music Library
3. Verify all have unique sequential track_ids
```

## 📊 What Was Fixed

**Before**: Race condition in ID generation
- Time-based offsets
- Retry loops
- Fallback IDs

**After**: Atomic database sequence
- PostgreSQL `nextval()` guarantees uniqueness
- No race conditions possible
- Clean sequential allocation

## 🔧 Files

**Apply these in Supabase**:
- `APPLY_TRACK_ID_SEQUENCE.sql`
- `CLEANUP_DUPLICATE_TRACK_IDS.sql`

**Already updated in code**:
- `src/components/TrackUploadModal.tsx`

## 💡 How It Works

```typescript
// Old (racy)
const maxId = await getMaxId();
const nextId = maxId + 1 + randomOffset;
// Multiple requests can get same ID here!

// New (atomic)
const nextId = await supabase.rpc('get_next_track_id');
// Database guarantees unique ID
```

## 🎯 Current State

- Max track_id: **99993**
- Next available: **99994**
- Duplicates: **Will be fixed by cleanup script**
- Build: **Version 1508** ✅

## ❓ Troubleshooting

**Sequence not found?**
```sql
SELECT * FROM audio_tracks_track_id_seq;
```

**Function not working?**
```sql
SELECT get_next_track_id();
```

**Still seeing duplicates?**
```sql
-- Check for duplicates
SELECT track_id, COUNT(*)
FROM audio_tracks
WHERE deleted_at IS NULL
GROUP BY track_id
HAVING COUNT(*) > 1;
```

## 📞 Support

Issue: Track ID still duplicating after fix
Check: Console logs during upload
Verify: Sequence installed in database

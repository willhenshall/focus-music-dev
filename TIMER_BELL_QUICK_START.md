# Timer Bell Feature - Quick Start Guide

## 🎯 Overview

The multiple timer bell management system is **code-complete** and ready to use. You just need to apply one database migration.

## ⚡ 5-Minute Setup

### Step 1: Apply Database Migration

**Via Supabase Dashboard** (Recommended):

1. Open your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Click **SQL Editor** in the left sidebar
4. Open the file: `/tmp/cc-agent/60373310/project/supabase/migrations/20251117000000_create_multi_bell_sound_system.sql`
5. Copy **all** the contents (252 lines)
6. Paste into the SQL Editor
7. Click **Run** (green button)
8. Wait for success message

### Step 2: Verify Setup

Run this in the SQL Editor to verify:

```sql
-- Should return 1 row (the Built-in Bell)
SELECT count(*) FROM timer_bell_sounds;

-- Should return true
SELECT EXISTS (
  SELECT 1 FROM storage.buckets WHERE id = 'timer-bell'
) as bucket_exists;
```

### Step 3: Test in App

1. **Login as Admin**
2. Go to **Admin Dashboard** → **Settings** tab
3. Scroll to **"Timer Bell Sound Library"**
4. Upload a bell sound (MP3, WAV, OGG, or WebM file)
5. Verify it appears in the list

6. **Login as User** (or switch to user view)
7. Go to **User Dashboard** → **Settings**
8. Find **"Timer Bell Settings"**
9. Select your uploaded bell
10. Test by starting a focus session

## ✅ What You Get

### Admin Features:
- Upload multiple bell sounds
- Preview each bell before publishing
- Drag to reorder bell list
- Show/hide bells from users
- Edit bell names
- Delete unused bells
- Set default bell

### User Features:
- Browse available bells
- Preview before selecting
- Customize volume (0-100%)
- Saves automatically
- Works across all sessions

## 📋 Quick Reference

### Files Created:
- **Database Tables**: `timer_bell_sounds`, `user_bell_preferences`
- **Storage Bucket**: `timer-bell` (public)
- **Migration**: `supabase/migrations/20251117000000_create_multi_bell_sound_system.sql`

### UI Components:
- **Admin**: `BellSoundLibrary.tsx`, `TimerBellSettings.tsx`
- **User**: `UserBellSettings.tsx`
- **Timer**: `SessionTimer.tsx` (integrates bell playback)

### File Limits:
- Max size: 5MB per file
- Formats: MP3, WAV, OGG, WebM
- Recommended: 1-3 second audio clips

## 🐛 Troubleshooting

### "Table doesn't exist" error
→ Migration wasn't applied. Go back to Step 1.

### "Access denied" when uploading
→ Your user needs `is_admin = true` in `user_profiles` table

### Bell doesn't play
→ Check browser console for errors. Verify public_url is accessible.

### Can't see uploaded bells as user
→ Check `is_visible = true` in admin library

## 📚 Full Documentation

For complete details, see:
- **TIMER_BELL_IMPLEMENTATION_COMPLETE.md** - Full technical documentation
- **APPLY_TIMER_BELL_MIGRATION.md** - Detailed migration guide

## 🎉 That's It!

Once the migration is applied, the feature is fully functional and ready for production use.

Need help? Check the troubleshooting section above or review the full documentation files.

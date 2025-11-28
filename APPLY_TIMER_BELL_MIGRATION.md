# How to Apply Timer Bell Migration

The multiple timer bell management feature has been fully implemented in code but requires database schema setup.

## Migration Status

- ✅ **Code Implementation**: Complete (BellSoundLibrary, TimerBellSettings, UserBellSettings components)
- ✅ **Migration File**: Created at `supabase/migrations/20251117000000_create_multi_bell_sound_system.sql`
- ❌ **Database Schema**: Not yet applied
- ❌ **Storage Bucket**: Not yet created

## Quick Apply (Recommended)

### Option 1: Via Supabase Dashboard SQL Editor

1. Log in to your Supabase Dashboard
2. Go to the SQL Editor
3. Open the migration file: `supabase/migrations/20251117000000_create_multi_bell_sound_system.sql`
4. Copy the entire contents
5. Paste into the SQL Editor
6. Click "Run" to execute

### Option 2: Via Supabase CLI (if installed)

```bash
cd /tmp/cc-agent/60373310/project
supabase db push
```

Or apply specific migration:

```bash
supabase migration up --local
```

## What This Migration Creates

### 1. Database Tables

#### `timer_bell_sounds` Table
Stores all available bell sounds that admins can upload:
- `id` - Unique identifier
- `name` - Display name (e.g., "Gentle Chime")
- `storage_path` - File path in storage bucket
- `public_url` - Public URL for playback
- `file_size` - File size in bytes
- `format` - Audio format (mp3, wav, ogg, webm)
- `duration` - Audio duration in seconds
- `is_visible` - Whether users can see/select this bell
- `sort_order` - Display order in selection UI
- `is_default` - Whether this is the default bell
- `uploaded_by` - Admin who uploaded it
- Timestamps: `created_at`, `updated_at`

#### `user_bell_preferences` Table
Stores individual user preferences:
- `id` - Unique identifier
- `user_id` - References the user
- `bell_sound_id` - Selected bell (NULL = use default)
- `volume` - Volume level 0-100
- Timestamps: `created_at`, `updated_at`
- Constraint: One preference per user

### 2. Storage Bucket

Creates `timer-bell` bucket with:
- **Public read access** - Users can play audio files
- **Admin-only write** - Only admins can upload/delete files
- Supports: MP3, WAV, OGG, WebM audio files
- Max file size: 5MB (enforced in UI)

### 3. Security (RLS Policies)

**timer_bell_sounds**:
- Admins: Full CRUD access
- Users: Can view visible bells only

**user_bell_preferences**:
- Users: Full CRUD on their own preferences
- Admins: Can view all user preferences

**Storage (timer-bell bucket)**:
- Anyone: Can read/download files (for playback)
- Admins: Can upload, update, delete files

### 4. Initial Data

- Migrates existing `timer_bell_url` from `system_preferences` if it exists
- Creates a default "Built-in Bell (Default)" entry representing the programmatic fallback bell

## Verification

After applying the migration, verify it worked:

```typescript
// Check tables exist
SELECT count(*) FROM timer_bell_sounds;
SELECT count(*) FROM user_bell_preferences;

// Check storage bucket
SELECT * FROM storage.buckets WHERE id = 'timer-bell';

// Verify default bell was created
SELECT * FROM timer_bell_sounds WHERE is_default = true;
```

Expected results:
- `timer_bell_sounds`: Should have at least 1 row (Built-in Bell)
- `user_bell_preferences`: Can be empty initially
- Storage bucket: Should exist with public = true

## Testing the Feature

Once migration is applied:

1. **Admin View**:
   - Go to Admin Dashboard > Settings tab
   - Scroll to "Timer Bell Sound Library"
   - Upload a bell sound file (MP3, WAV, OGG, WebM)
   - Toggle visibility, reorder bells, edit names

2. **User View**:
   - Go to User Dashboard > Settings
   - Find "Timer Bell Settings"
   - Select from available bell sounds
   - Adjust volume slider
   - Test the bell sound

3. **Session Timer**:
   - Start a focus session
   - When timer completes, the selected bell plays at set volume

## Troubleshooting

### Tables don't exist after migration
- Check Supabase logs for errors
- Ensure you're connected to the correct project
- Try running migration statements individually

### Storage bucket not created
Manually create via Supabase Dashboard:
1. Go to Storage section
2. Create new bucket named `timer-bell`
3. Set as public
4. Add the RLS policies from the migration file

### RLS policies blocking access
- Verify `user_profiles.is_admin` column exists
- Check that your user account has `is_admin = true`
- Review policy definitions in migration file

## Migration File Contents

The complete migration is located at:
```
supabase/migrations/20251117000000_create_multi_bell_sound_system.sql
```

It includes:
- Table creation statements
- Index creation for performance
- RLS policy definitions
- Storage bucket creation
- Storage RLS policies
- Data migration logic
- Default data insertion
- Helpful SQL comments

## Integration Points

The feature is fully integrated with existing code:

1. **Components**:
   - `BellSoundLibrary.tsx` - Admin management UI
   - `TimerBellSettings.tsx` - Admin settings wrapper
   - `UserBellSettings.tsx` - User selection UI
   - `SessionTimer.tsx` - Plays selected bell

2. **Database Tables Used**:
   - `timer_bell_sounds` - Bell sound library
   - `user_bell_preferences` - User preferences
   - `system_preferences` - System-wide settings
   - `user_profiles` - Admin authorization

3. **Storage**:
   - Bucket: `timer-bell`
   - Files: Audio files uploaded by admins

## Next Steps

After migration is applied:

1. ✅ Verify tables and bucket exist
2. ✅ Test admin upload functionality
3. ✅ Test user selection interface
4. ✅ Test bell playback in timer
5. ✅ Upload a few bell sound options for users

## Support

If you encounter issues:
1. Check Supabase logs in dashboard
2. Verify service role key has proper permissions
3. Ensure PostgREST is up to date
4. Review RLS policies are not blocking legitimate access

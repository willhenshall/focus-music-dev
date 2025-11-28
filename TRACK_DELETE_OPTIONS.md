# Track Deletion System

## Overview

The music library now provides two distinct options when deleting tracks, giving administrators full control over data management.

## Deletion Options

### 1. Move to Deleted Tracks (Soft Delete)

**What it does:**
- Marks tracks as deleted by setting `deleted_at` timestamp
- Tracks remain in database and can be restored
- Audio files and metadata stay in storage
- Tracks are hidden from active library but visible in "Deleted Tracks" view

**Use when:**
- You might want to restore tracks later
- You want to keep a backup/archive
- You're not sure about permanent deletion

### 2. Permanently Delete (Hard Delete)

**What it does:**
- **Deletes audio file** (.mp3, .wav, etc.) from storage
- **Deletes JSON metadata** sidecar file from storage
- **Removes track** from database completely
- **Removes all playlist references** from channels (low/medium/high energy levels)
- **Deletes analytics data** (play events, skip events)
- **Cannot be undone**

**Use when:**
- You're certain you don't need the track anymore
- You want to free up storage space
- You need to remove tracks from all playlists
- You want to clean up orphaned or duplicate data

## Implementation Details

### Components

1. **DeleteConfirmationModal** (`src/components/DeleteConfirmationModal.tsx`)
   - Modal dialog presenting both deletion options
   - Clear visual distinction between soft and permanent delete
   - Warning indicators for irreversible actions

2. **MusicLibrary** (`src/components/MusicLibrary.tsx`)
   - Updated to show modal instead of browser confirm
   - Handles both soft and permanent delete actions
   - Shows detailed feedback after permanent deletion

### Edge Function

**Function:** `permanently-delete-tracks`

**Features:**
- Admin-only access (checks user profile)
- Batch deletion support (multiple tracks at once)
- Comprehensive cleanup:
  - Storage files (audio + JSON)
  - Database records
  - Channel playlist references
  - Analytics data
- Detailed result reporting with counts

**Security:**
- Requires valid JWT token
- Verifies admin status
- Uses service role for storage operations

## User Flow

1. Admin selects one or more tracks in Music Library
2. Clicks "Delete Selected" button
3. Modal appears with two options:
   - **Move to Deleted Tracks** (blue, archive icon)
   - **Permanently Delete** (red, trash icon with "Irreversible" badge)
4. Admin chooses deletion method
5. System performs action and shows confirmation with details

## Feedback

After permanent deletion, the system displays:
- Number of tracks deleted
- Files removed count
- Channel references cleaned
- Playlists affected
- Analytics entries deleted
- Any errors encountered

## Notes

- Soft delete is reversible via "Deleted Tracks" section
- Permanent delete affects all related data across the system
- Permanent delete removes tracks from ALL channels and playlists
- Both operations support bulk actions (multiple tracks)

# System Rules

This document contains critical rules and conventions that must be followed throughout the application.

## Music Metadata Rules

### Energy Level Field

**CRITICAL RULE**: Only use the 'energy' field from metadata for energy level information.

- **Source Field**: `metadata.energy` (values: "low", "medium", "high")
- **DO NOT USE**: `metadata.intensity` field - this contains incorrect data from a previous application
- **Display Value**: If no energy field exists, display "not defined"
- **Applies To**:
  - Database imports (edge functions)
  - Frontend displays
  - All scripts and utilities
  - Sorting and filtering logic

**Implementation Locations**:
- Edge function: `supabase/functions/import-audio-files/index.ts`
- Components: `EnergyPlaylistModal.tsx`, `TrackDetailModal.tsx`, `MusicLibrary.tsx`, `UserDetailModal.tsx`

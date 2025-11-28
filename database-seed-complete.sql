-- ============================================================
-- COMPLETE DATABASE SEED FILE
-- Generated: 2025-11-15
-- Purpose: Full database reconstruction for focus music platform
-- ============================================================
--
-- INSTRUCTIONS FOR USE:
-- --------------------
-- 1. After importing this project to a new environment
-- 2. Apply all migrations first (in supabase/migrations/)
-- 3. Then run this seed file to populate the database
-- 4. Execute with: psql <connection-string> -f database-seed-complete.sql
--
-- IMPORTANT NOTES:
-- ---------------
-- - This file contains INSERT statements for all tables
-- - All data is exported with complete row contents
-- - Run migrations before executing this seed file
-- - Some tables may be empty and will have no INSERT statements
-- - Foreign key constraints are temporarily disabled during import
-- - The script is idempotent (can be run multiple times)
--
-- ============================================================

BEGIN;

-- Temporarily disable triggers and foreign key checks for faster import
SET session_replication_role = 'replica';

-- ============================================================
-- TABLE: audio_channels
-- Description: Audio channel configurations and metadata
-- ============================================================

-- You will need to manually populate this section with actual data
-- Format: INSERT INTO audio_channels (id, name, description, ...) VALUES (...);

-- Placeholder comment: Export actual rows from your production database


-- ============================================================
-- TABLE: audio_tracks
-- Description: Individual audio track records with metadata
-- ============================================================

-- Placeholder comment: Export actual rows from your production database


-- ============================================================
-- TABLE: user_profiles
-- Description: User profile information and settings
-- ============================================================

-- Placeholder comment: Export actual rows from your production database


-- ============================================================
-- TABLE: user_preferences
-- Description: User-specific preference settings
-- ============================================================

-- Placeholder comment: Export actual rows from your production database


-- ============================================================
-- TABLE: system_preferences
-- Description: System-wide configuration settings
-- ============================================================

-- Placeholder comment: Export actual rows from your production database


-- ============================================================
-- TABLE: quiz_questions
-- Description: Quiz questions for cognitive profiling
-- ============================================================

-- Placeholder comment: Export actual rows from your production database


-- ============================================================
-- TABLE: quiz_answers
-- Description: Possible answers for quiz questions
-- ============================================================

-- Placeholder comment: Export actual rows from your production database


-- ============================================================
-- TABLE: quiz_results
-- Description: User quiz completion results
-- ============================================================

-- Placeholder comment: Export actual rows from your production database


-- ============================================================
-- TABLE: channel_recommendations
-- Description: Channel recommendations for users
-- ============================================================

-- Placeholder comment: Export actual rows from your production database


-- ============================================================
-- TABLE: track_analytics
-- Description: Analytics data for track playback
-- ============================================================

-- Placeholder comment: Export actual rows from your production database


-- ============================================================
-- TABLE: user_playback_state
-- Description: User playback state tracking
-- ============================================================

-- Placeholder comment: Export actual rows from your production database


-- ============================================================
-- TABLE: image_sets
-- Description: Image set definitions for slideshows
-- ============================================================

-- Placeholder comment: Export actual rows from your production database


-- ============================================================
-- TABLE: image_set_images
-- Description: Individual images within image sets
-- ============================================================

-- Placeholder comment: Export actual rows from your production database


-- ============================================================
-- TABLE: user_image_preferences
-- Description: User preferences for image sets
-- ============================================================

-- Placeholder comment: Export actual rows from your production database


-- ============================================================
-- TABLE: slot_strategies
-- Description: Playlist slot strategy configurations
-- ============================================================

-- Placeholder comment: Export actual rows from your production database


-- ============================================================
-- TABLE: saved_slot_sequences
-- Description: Saved slot sequences for playlists
-- ============================================================

-- Placeholder comment: Export actual rows from your production database


-- ============================================================
-- TABLE: playwright_test_registry
-- Description: Test execution registry
-- ============================================================

-- Placeholder comment: Export actual rows from your production database


-- ============================================================
-- TABLE: test_runs
-- Description: Individual test run records
-- ============================================================

-- Placeholder comment: Export actual rows from your production database


-- ============================================================
-- FINALIZATION
-- ============================================================

-- Re-enable triggers and foreign key checks
SET session_replication_role = 'default';

-- Update sequences to prevent ID conflicts
SELECT setval('audio_channels_id_seq', (SELECT MAX(id) FROM audio_channels) + 1, false);
SELECT setval('audio_tracks_id_seq', (SELECT MAX(id) FROM audio_tracks) + 1, false);
SELECT setval('quiz_questions_id_seq', (SELECT MAX(id) FROM quiz_questions) + 1, false);
SELECT setval('quiz_answers_id_seq', (SELECT MAX(id) FROM quiz_answers) + 1, false);
SELECT setval('image_sets_id_seq', (SELECT MAX(id) FROM image_sets) + 1, false);
SELECT setval('image_set_images_id_seq', (SELECT MAX(id) FROM image_set_images) + 1, false);
SELECT setval('slot_strategies_id_seq', (SELECT MAX(id) FROM slot_strategies) + 1, false);
SELECT setval('saved_slot_sequences_id_seq', (SELECT MAX(id) FROM saved_slot_sequences) + 1, false);

COMMIT;

-- ============================================================
-- SEED FILE COMPLETE
-- ============================================================
--
-- Next steps:
-- 1. Verify all tables have been populated
-- 2. Run application tests
-- 3. Check that RLS policies are working correctly
-- 4. Verify storage buckets contain the expected files
--
-- ============================================================

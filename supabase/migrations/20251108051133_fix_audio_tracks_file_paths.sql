/*
  # Fix Audio Tracks File Paths

  1. Changes
    - Update all audio_tracks.file_path to use numeric track_id from storage
    - Format: "{track_id}.mp3" matching actual storage files
    - Ensures file_path points to real files in audio-files bucket

  2. Notes
    - Storage has files named like "2877.mp3", "156144.mp3" etc
    - Current file_path has wrong format "demo/UUID.mp3"
    - This aligns database with actual storage structure
*/

-- Update file_path to match storage structure using track_id
UPDATE audio_tracks
SET file_path = track_id || '.mp3'
WHERE track_id IS NOT NULL;
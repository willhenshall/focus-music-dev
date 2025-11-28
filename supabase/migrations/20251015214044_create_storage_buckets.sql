/*
  # Create Storage Buckets for Audio Files

  1. New Buckets
    - `audio-files` - Stores MP3 audio files
    - `audio-sidecars` - Stores JSON metadata files
  
  2. Configuration
    - Public access enabled for streaming
    - 100MB file size limit per file
    - No file type restrictions
  
  3. Security
    - Public read access for all files (needed for audio playback)
    - Authenticated write access with service role
*/

-- Create audio-files bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'audio-files',
  'audio-files', 
  true,
  104857600, -- 100MB
  NULL -- Allow all file types
)
ON CONFLICT (id) DO NOTHING;

-- Create audio-sidecars bucket  
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'audio-sidecars',
  'audio-sidecars',
  true, 
  10485760, -- 10MB
  ARRAY['application/json']
)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to audio files
CREATE POLICY "Public read access for audio files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'audio-files');

-- Allow public read access to sidecar files
CREATE POLICY "Public read access for audio sidecars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'audio-sidecars');

-- Allow service role to upload audio files
CREATE POLICY "Service role can upload audio files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'audio-files');

-- Allow service role to upload sidecar files
CREATE POLICY "Service role can upload audio sidecars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'audio-sidecars');

-- Allow service role to update audio files
CREATE POLICY "Service role can update audio files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'audio-files');

-- Allow service role to update sidecar files
CREATE POLICY "Service role can update audio sidecars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'audio-sidecars');

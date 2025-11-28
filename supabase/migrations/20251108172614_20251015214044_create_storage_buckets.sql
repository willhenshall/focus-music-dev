/*
  # Create Storage Buckets for Audio Files

  1. New Buckets
    - `audio-files` - Stores MP3 audio files
    - `audio-sidecars` - Stores JSON metadata files
  
  2. Configuration
    - Public access enabled for streaming
    - 100MB file size limit per file
  
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
  104857600,
  NULL
)
ON CONFLICT (id) DO NOTHING;

-- Create audio-sidecars bucket  
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'audio-sidecars',
  'audio-sidecars',
  true, 
  10485760,
  ARRAY['application/json']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public read access for audio files') THEN
    CREATE POLICY "Public read access for audio files"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'audio-files');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public read access for audio sidecars') THEN
    CREATE POLICY "Public read access for audio sidecars"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'audio-sidecars');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Service role can upload audio files') THEN
    CREATE POLICY "Service role can upload audio files"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'audio-files');
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Service role can upload audio sidecars') THEN
    CREATE POLICY "Service role can upload audio sidecars"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'audio-sidecars');
  END IF;
END $$;
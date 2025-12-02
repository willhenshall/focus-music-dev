-- Create HLS storage bucket for streaming audio segments
-- This bucket stores the transcoded HLS files (m3u8 playlists and ts segments)

-- Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'audio-hls',
  'audio-hls',
  true,  -- Public bucket for streaming
  104857600,  -- 100MB limit per file
  ARRAY[
    'application/vnd.apple.mpegurl',  -- .m3u8 playlists
    'application/x-mpegurl',          -- Alternative m3u8 mime type
    'video/mp2t',                     -- .ts segments
    'audio/mp4',                      -- .m4s segments (alternative)
    'application/octet-stream'        -- Fallback
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 104857600,
  allowed_mime_types = ARRAY[
    'application/vnd.apple.mpegurl',
    'application/x-mpegurl',
    'video/mp2t',
    'audio/mp4',
    'application/octet-stream'
  ];

-- Allow public read access to HLS files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Public HLS read access'
  ) THEN
    CREATE POLICY "Public HLS read access"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'audio-hls');
  END IF;
END $$;

-- Allow authenticated users to upload HLS files (for admin transcoding)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Authenticated HLS upload'
  ) THEN
    CREATE POLICY "Authenticated HLS upload"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'audio-hls');
  END IF;
END $$;

-- Allow service role full access for transcoding pipeline
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Service role HLS full access'
  ) THEN
    CREATE POLICY "Service role HLS full access"
    ON storage.objects FOR ALL
    TO service_role
    USING (bucket_id = 'audio-hls')
    WITH CHECK (bucket_id = 'audio-hls');
  END IF;
END $$;

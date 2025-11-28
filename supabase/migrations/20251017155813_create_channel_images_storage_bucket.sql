/*
  # Create channel images storage bucket

  1. New Storage Bucket
    - `channel-images` - Stores background images for audio channels
    
  2. Security
    - Public read access for displaying images
    - Admin-only write access for uploading images
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('channel-images', 'channel-images', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Public can view channel images'
  ) THEN
    CREATE POLICY "Public can view channel images"
      ON storage.objects FOR SELECT
      TO public
      USING (bucket_id = 'channel-images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Authenticated users can upload channel images'
  ) THEN
    CREATE POLICY "Authenticated users can upload channel images"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'channel-images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Authenticated users can update channel images'
  ) THEN
    CREATE POLICY "Authenticated users can update channel images"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'channel-images')
      WITH CHECK (bucket_id = 'channel-images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Authenticated users can delete channel images'
  ) THEN
    CREATE POLICY "Authenticated users can delete channel images"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'channel-images');
  END IF;
END $$;

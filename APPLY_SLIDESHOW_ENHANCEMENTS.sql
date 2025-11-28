/*
  # Enhanced Slideshow Management - Database Migration

  ## What This Does
  Adds database support for advanced slideshow management features including:
  - Display order column for custom sorting
  - Automatic updated_at timestamp tracking
  - Performance indexes for queries

  ## How to Apply
  1. Open Supabase Dashboard > SQL Editor
  2. Copy this entire file
  3. Click "Run"
  4. Verify success message

  ## Features Enabled
  - Rename slideshows (triggers update timestamp)
  - Duplicate slideshows with all images
  - Custom sort order (drag to reorder)
  - Bulk operations (activate/deactivate/delete multiple)
  - Search and filter
  - Display timestamps (created/updated dates)
*/

-- Add display_order column if not exists (for sorting slideshows)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'image_sets' AND column_name = 'display_order'
  ) THEN
    ALTER TABLE image_sets ADD COLUMN display_order integer DEFAULT 0 NOT NULL;
  END IF;
END $$;

-- Create index on display_order for efficient sorting
CREATE INDEX IF NOT EXISTS idx_image_sets_display_order
  ON image_sets(set_type, display_order)
  WHERE set_type = 'slideshow';

-- Create or replace function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for image_sets.updated_at (tracks renames and other updates)
DROP TRIGGER IF EXISTS update_image_sets_updated_at ON image_sets;
CREATE TRIGGER update_image_sets_updated_at
  BEFORE UPDATE ON image_sets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Set initial display_order based on creation date for existing records
UPDATE image_sets
SET display_order = subquery.row_num
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY set_type ORDER BY created_at) as row_num
  FROM image_sets
  WHERE set_type = 'slideshow'
) AS subquery
WHERE image_sets.id = subquery.id
  AND image_sets.set_type = 'slideshow'
  AND image_sets.display_order = 0;

-- Add helpful comments for future reference
COMMENT ON COLUMN image_sets.display_order IS 'Admin-controlled sort order for slideshow sets. Lower numbers appear first. Reordered via up/down buttons.';
COMMENT ON COLUMN image_sets.updated_at IS 'Automatically updated timestamp on any modification (rename, status change, etc.).';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Slideshow management enhancements installed successfully!';
  RAISE NOTICE '✅ Features enabled: rename, duplicate, bulk operations, search, custom sort';
  RAISE NOTICE '✅ Database ready for enhanced admin dashboard';
END $$;

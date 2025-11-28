/*
  # Make channel_id nullable in image_set_images

  1. Changes
    - Make `channel_id` column nullable in `image_set_images` table
    - Drop the unique constraint on (image_set_id, channel_id) since channel_id can now be NULL
    - Add a partial unique index to maintain uniqueness only when channel_id IS NOT NULL
    - This allows image sets to have:
      a) Images tied to specific channels (for channel card backgrounds)
      b) Images with NULL channel_id (for slideshow-only image sets)

  2. Migration Logic
    - The change is safe because:
      - Making a column nullable is non-destructive
      - Existing data with channel_ids will continue to work
      - New slideshow-only images can be inserted with NULL channel_id
*/

-- Drop the existing unique constraint
ALTER TABLE image_set_images
DROP CONSTRAINT IF EXISTS image_set_images_image_set_id_channel_id_key;

-- Make channel_id nullable
ALTER TABLE image_set_images
ALTER COLUMN channel_id DROP NOT NULL;

-- Add a partial unique index to maintain uniqueness only when channel_id IS NOT NULL
-- This prevents duplicate channel assignments within a set while allowing multiple NULL channel_ids
CREATE UNIQUE INDEX IF NOT EXISTS idx_image_set_images_unique_channel
ON image_set_images(image_set_id, channel_id)
WHERE channel_id IS NOT NULL;
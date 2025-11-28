import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixFileSizes() {
  console.log('Starting file size correction...\n');

  const { data: tracks, error: tracksError } = await supabase
    .from('audio_tracks')
    .select('id, file_path, metadata')
    .order('id');

  if (tracksError) {
    console.error('Error fetching tracks:', tracksError);
    return;
  }

  console.log(`Found ${tracks.length} tracks to process\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const track of tracks) {
    try {
      const fileName = track.file_path.split('/').pop();

      if (!fileName) {
        console.log(`Skipping track ${track.id} - invalid file path`);
        skipped++;
        continue;
      }

      const { data: storageFile, error: storageError } = await supabase.storage
        .from('audio-files')
        .list('', {
          search: fileName
        });

      if (storageError || !storageFile || storageFile.length === 0) {
        console.log(`Skipping track ${track.id} - file not found in storage: ${fileName}`);
        skipped++;
        continue;
      }

      const fileInfo = storageFile[0];
      const fileSizeBytes = fileInfo.metadata?.size;

      if (!fileSizeBytes) {
        console.log(`Skipping track ${track.id} - no size metadata available`);
        skipped++;
        continue;
      }

      const updatedMetadata = {
        ...track.metadata,
        file_size: fileSizeBytes
      };

      const { error: updateError } = await supabase
        .from('audio_tracks')
        .update({ metadata: updatedMetadata })
        .eq('id', track.id);

      if (updateError) {
        console.error(`Error updating track ${track.id}:`, updateError);
        errors++;
      } else {
        updated++;
        if (updated % 100 === 0) {
          console.log(`Progress: ${updated} tracks updated...`);
        }
      }

    } catch (err) {
      console.error(`Error processing track ${track.id}:`, err);
      errors++;
    }
  }

  console.log('\n=== File Size Correction Complete ===');
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total: ${tracks.length}`);
}

fixFileSizes().catch(console.error);

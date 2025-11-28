import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const filesToDelete = [
  'HRH 1-1.3 Haiku Robot v38 - IG - Ian Mix and new transport.mp3',
  'HRH 2-3.3 HAIKU ROBOT v81 - IG - Ian Mix 1.mp3',
  'HRH 3-4.3 HAIKU ROBOT C v106 - IG - Ian Mix 2.mp3',
  'HRH 4-5.3 HAIKU ROBOT Am v39 - IG - Limiter Down - Trash 2 off.mp3',
  'HRH 5-6.3 HAIKU ROBOT Bbm v50 - IG - Ian Mix 2.2.mp3',
  'HRH 6-7.3 HAIKU ROBOT Bm v49 - IG - Ian Mix 2.mp3',
  'HRH 7-7.3 HAIKU ROBOT Bm v51 - IG - Kick Down.mp3',
  'HRH 8-8.3 HAIKU ROBOT v77 - IG - Ian Mix 2.mp3',
  'HRH 9-9 HAIKU ROBOT D v37 - IG - Ian Mix 1.mp3',
  'HRH 10-10.3 HAIKU ROBOT F#m v102 - IG - Ian Mix 1.mp3',
  'HRL 1-1.1 Haiku Robot - from v43 - IG - 118 BPM No Vox.mp3',
  'HRL 2-2.1 Haiku Robot - 118 BPM No Vox.mp3',
  'HRL 3-3.1 HAIKU ROBOT - 118 BPM No Vox.mp3',
  'HRL 4-4.1 HAIKU ROBOT 118 BPM no vox.mp3',
  'HRL 5-5.1 HAIKU ROBOT - from v41 - IG - 3 min version.mp3',
  'HRL 6-6.1 HAIKU ROBOT Bbm - from v51 - IG - Ian 3 min version.mp3',
  'HRL 7-7.1 HAIKU ROBOT - 118 BPM No Vox.mp3',
  'HRL 8-8.1 HAIKU ROBOT - 118 BPM - no vox.mp3',
  'HRL 9-9.1 HAIKU ROBOT D - 118 BPM No vox.mp3',
  'HRL 10-10.1 HAIKU ROBOT F#m - 118 BPM no vox.mp3',
  'HRM 1-10.2 HAIKU ROBOT F#m - 124 BPM Vox down 5db.mp3',
  'HRM 2-9.2 HAIKU ROBOT D - 124 BPM Vox down 5db.mp3',
  'HRM 3-8.2 HAIKU ROBOT -124 BPM vox down 5 dB.mp3',
  'HRM 4-7.2 HAIKU ROBOT Bm - 124 BPM Vox down 5 dB.mp3',
  'HRM 5-6.2 HAIKU ROBOT Bbm - 124 BPM Vox down 5dB.mp3',
  'HRM 6-5.2 HAIKU ROBOT - 124 BPM Vox Down 5db.mp3',
  'HRM 7-4.2 HAIKU ROBOT C - 124 BPM vox down 5 Db.mp3',
  'HRM 8-3.2 HAIKU ROBOT - 124 BPM Vox Down 5dB.mp3',
  'HRM 9-2.2 Haiku Robot - 124 BPM Vox down 5 db.mp3',
  'HRM 10-1.2 Haiku Robot - 124 BPM Vox down 5dB.mp3',
];

async function deleteTracksAndFiles() {
  console.log('Starting cleanup of 30 Haiku Robot tracks...\n');

  let successCount = 0;
  let errorCount = 0;

  for (const fileName of filesToDelete) {
    console.log(`Processing: ${fileName}`);

    try {
      // Find track records with this filename in metadata
      const { data: tracks, error: queryError } = await supabase
        .from('audio_tracks')
        .select('id, track_id, metadata, file_path')
        .filter('metadata->>original_filename', 'eq', fileName);

      if (queryError) {
        console.error(`  ❌ Query error: ${queryError.message}`);
        errorCount++;
        continue;
      }

      if (!tracks || tracks.length === 0) {
        console.log(`  ⚠️  Not found in database`);
        continue;
      }

      console.log(`  Found ${tracks.length} database record(s)`);

      // Extract track_id and file paths
      const trackIds = new Set<string>();
      const filePaths = new Set<string>();

      for (const track of tracks) {
        if (track.metadata?.track_id) {
          trackIds.add(track.metadata.track_id);
        }
        if (track.file_path) {
          const pathParts = track.file_path.split('/');
          const storageFileName = pathParts[pathParts.length - 1];
          filePaths.add(storageFileName);
        }
      }

      // Delete from database (permanently, not soft delete)
      const { error: deleteError } = await supabase
        .from('audio_tracks')
        .delete()
        .filter('metadata->>original_filename', 'eq', fileName);

      if (deleteError) {
        console.error(`  ❌ Database delete error: ${deleteError.message}`);
        errorCount++;
        continue;
      }

      console.log(`  ✓ Deleted ${tracks.length} database record(s)`);

      // Delete audio files from storage
      for (const storageFileName of filePaths) {
        const { error: storageError } = await supabase.storage
          .from('audio-files')
          .remove([storageFileName]);

        if (storageError) {
          console.error(`  ⚠️  Storage delete warning (${storageFileName}): ${storageError.message}`);
        } else {
          console.log(`  ✓ Deleted audio file: ${storageFileName}`);
        }
      }

      // Delete sidecar JSON files
      for (const trackId of trackIds) {
        const { error: sidecarError } = await supabase.storage
          .from('audio-sidecars')
          .remove([`${trackId}.json`]);

        if (sidecarError && sidecarError.message !== 'Object not found') {
          console.error(`  ⚠️  Sidecar delete warning (${trackId}.json): ${sidecarError.message}`);
        } else if (!sidecarError) {
          console.log(`  ✓ Deleted sidecar: ${trackId}.json`);
        }
      }

      successCount++;
      console.log(`  ✅ Successfully cleaned up: ${fileName}\n`);

    } catch (error) {
      console.error(`  ❌ Unexpected error: ${error}`);
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Cleanup Complete!`);
  console.log(`Successfully processed: ${successCount} files`);
  console.log(`Errors: ${errorCount} files`);
  console.log('='.repeat(60));
}

deleteTracksAndFiles().catch(console.error);

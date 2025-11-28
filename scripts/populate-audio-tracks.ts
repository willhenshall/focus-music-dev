import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function populateAudioTracks() {
  console.log('🎵 Starting audio tracks population...\n');

  let offset = 0;
  const limit = 1000;
  let totalProcessed = 0;
  let totalInserted = 0;
  let totalErrors = 0;

  while (true) {
    console.log(`📦 Fetching batch at offset ${offset}...`);

    const { data: audioFiles, error: audioError } = await supabase.storage
      .from('audio-files')
      .list('', {
        limit,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });

    if (audioError) {
      console.error('Error fetching audio files:', audioError);
      break;
    }

    if (!audioFiles || audioFiles.length === 0) {
      console.log('✅ No more files to process');
      break;
    }

    console.log(`   Found ${audioFiles.length} files`);

    for (const file of audioFiles) {
      totalProcessed++;

      const trackId = file.name.replace('.mp3', '');

      const { data: sidecarData } = await supabase.storage
        .from('audio-sidecars')
        .download(`${trackId}.json`);

      let metadata: any = {
        track_name: trackId,
        file_size: file.metadata?.size || 0,
      };

      if (sidecarData) {
        try {
          const text = await sidecarData.text();
          const parsed = JSON.parse(text);
          metadata = {
            ...metadata,
            ...parsed,
            track_name: parsed.title || parsed.track_name || trackId,
            artist_name: parsed.artist || parsed.artist_name || 'Focus.Music',
            duration: parsed.duration || parsed.length,
            bpm: parsed.bpm,
            key: parsed.key,
            genre: parsed.genre,
          };
        } catch (e) {
          console.warn(`   ⚠️  Could not parse sidecar for ${trackId}`);
        }
      }

      const { data: publicUrlData } = supabase.storage
        .from('audio-files')
        .getPublicUrl(file.name);

      const { error: insertError } = await supabase
        .from('audio_tracks')
        .upsert(
          {
            id: trackId,
            file_path: publicUrlData.publicUrl,
            energy_level: 'medium',
            metadata,
          },
          { onConflict: 'id' }
        );

      if (insertError) {
        console.error(`   ❌ Error inserting ${trackId}:`, insertError.message);
        totalErrors++;
      } else {
        totalInserted++;
      }

      if (totalProcessed % 100 === 0) {
        console.log(`   Progress: ${totalProcessed} processed, ${totalInserted} inserted, ${totalErrors} errors`);
      }
    }

    offset += limit;
  }

  console.log('\n🎉 Population complete!');
  console.log(`   Total processed: ${totalProcessed}`);
  console.log(`   Total inserted: ${totalInserted}`);
  console.log(`   Total errors: ${totalErrors}`);
}

populateAudioTracks().catch(console.error);

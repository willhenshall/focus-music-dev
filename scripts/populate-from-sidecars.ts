import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function populateFromSidecars() {
  console.log('🎵 Populating audio_tracks from sidecar metadata files...\n');

  let offset = 0;
  const limit = 1000;
  let totalProcessed = 0;
  let totalInserted = 0;
  let totalErrors = 0;
  let hasMore = true;

  while (hasMore) {
    console.log(`📦 Processing batch at offset ${offset}...`);

    const { data: sidecarFiles, error: listError } = await supabase.storage
      .from('audio-files')
      .list('', {
        limit,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });

    if (listError) {
      console.error('Error listing sidecar files:', listError);
      break;
    }

    if (!sidecarFiles || sidecarFiles.length === 0) {
      console.log('✅ No more files to process');
      hasMore = false;
      break;
    }

    console.log(`   Found ${sidecarFiles.length} sidecar files`);

    const tracksToInsert = [];

    for (const file of sidecarFiles) {
      if (!file.name.endsWith('.json')) continue;

      totalProcessed++;
      const trackId = file.name.replace('.json', '');

      try {
        const { data: sidecarData, error: downloadError } = await supabase.storage
          .from('audio-files')
          .download(file.name);

        if (downloadError || !sidecarData) {
          totalErrors++;
          continue;
        }

        const text = await sidecarData.text();
        const metadata = JSON.parse(text);

        const audioFilePath = `https://xewajlyswijmjxuajhif.supabase.co/storage/v1/object/public/audio-files/${trackId}.mp3`;

        tracksToInsert.push({
          id: crypto.randomUUID(),
          file_path: audioFilePath,
          energy_level: 'medium',
          duration_seconds: metadata.duration_seconds || metadata.duration || 0,
          metadata: {
            track_id: trackId,
            track_name: metadata.title || metadata.track_name || trackId,
            artist_name: metadata.artist || metadata.artist_name || 'Focus.Music',
            duration: metadata.duration,
            duration_seconds: metadata.duration_seconds,
            bpm: metadata.bpm,
            key: metadata.key,
            genre: metadata.genre,
            file_size: metadata.file_size,
            mimetype: 'audio/mpeg',
            ...metadata,
          },
        });

        if (tracksToInsert.length >= 100) {
          const { error: insertError } = await supabase
            .from('audio_tracks')
            .upsert(tracksToInsert, { onConflict: 'file_path' });

          if (insertError) {
            console.error('   ❌ Batch insert error:', insertError.message);
            totalErrors += tracksToInsert.length;
          } else {
            totalInserted += tracksToInsert.length;
          }

          tracksToInsert.length = 0;
        }
      } catch (e: any) {
        console.warn(`   ⚠️  Error processing ${file.name}:`, e.message);
        totalErrors++;
      }

      if (totalProcessed % 100 === 0) {
        console.log(`   Progress: ${totalProcessed} processed, ${totalInserted} inserted, ${totalErrors} errors`);
      }
    }

    if (tracksToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('audio_tracks')
        .upsert(tracksToInsert, { onConflict: 'file_path' });

      if (insertError) {
        console.error('   ❌ Final batch insert error:', insertError.message);
        totalErrors += tracksToInsert.length;
      } else {
        totalInserted += tracksToInsert.length;
      }
    }

    offset += limit;

    if (sidecarFiles.length < limit) {
      hasMore = false;
    }
  }

  console.log('\n🎉 Population complete!');
  console.log(`   Total processed: ${totalProcessed}`);
  console.log(`   Total inserted: ${totalInserted}`);
  console.log(`   Total errors: ${totalErrors}`);

  const { count } = await supabase
    .from('audio_tracks')
    .select('*', { count: 'exact', head: true });

  console.log(`\n📊 Final database count: ${count} tracks`);
}

populateFromSidecars().catch(console.error);

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

async function populateFromStorage() {
  console.log('🎵 Populating audio_tracks from storage...\n');

  // List files from storage bucket
  const { data: files, error: queryError } = await supabase.storage
    .from('audio-files')
    .list();

  if (queryError) {
    console.error('❌ Error listing storage files:', queryError);
    return;
  }

  if (!files || files.length === 0) {
    console.log('⚠️  No files found in audio-files bucket');
    return;
  }

  // Filter for JSON files only
  const jsonFiles = files.filter(f => f.name.endsWith('.json'));

  console.log(`📦 Found ${jsonFiles.length} JSON sidecar files (out of ${files.length} total files)\n`);

  const tracksToInsert = [];
  let processed = 0;
  let inserted = 0;
  let errors = 0;

  for (const file of jsonFiles) {
    const trackId = file.name.replace('.json', '');
    processed++;

    try {
      // Download and parse the JSON file
      const { data: sidecarData, error: downloadError } = await supabase.storage
        .from('audio-files')
        .download(file.name);

      if (downloadError || !sidecarData) {
        console.warn(`   ⚠️  Could not download ${file.name}`);
        errors++;
        continue;
      }

      const text = await sidecarData.text();
      const metadata = JSON.parse(text);

      const audioFilePath = `${supabaseUrl}/storage/v1/object/public/audio-files/${trackId}.mp3`;

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

      // Batch insert every 50 tracks
      if (tracksToInsert.length >= 50) {
        const { error: insertError } = await supabase
          .from('audio_tracks')
          .upsert(tracksToInsert, { onConflict: 'file_path' });

        if (insertError) {
          console.error('   ❌ Batch insert error:', insertError.message);
          errors += tracksToInsert.length;
        } else {
          inserted += tracksToInsert.length;
          console.log(`   ✅ Inserted ${inserted} tracks so far...`);
        }

        tracksToInsert.length = 0;
      }
    } catch (e: any) {
      console.warn(`   ⚠️  Error processing ${file.name}:`, e.message);
      errors++;
    }
  }

  // Insert remaining tracks
  if (tracksToInsert.length > 0) {
    const { error: insertError } = await supabase
      .from('audio_tracks')
      .upsert(tracksToInsert, { onConflict: 'file_path' });

    if (insertError) {
      console.error('   ❌ Final batch insert error:', insertError.message);
      errors += tracksToInsert.length;
    } else {
      inserted += tracksToInsert.length;
    }
  }

  console.log('\n🎉 Population complete!');
  console.log(`   Total processed: ${processed}`);
  console.log(`   Total inserted: ${inserted}`);
  console.log(`   Total errors: ${errors}`);

  const { count } = await supabase
    .from('audio_tracks')
    .select('*', { count: 'exact', head: true });

  console.log(`\n📊 Total tracks in database: ${count}`);
}

populateFromStorage().catch(console.error);

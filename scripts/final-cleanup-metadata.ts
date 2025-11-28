import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = 'https://xewajlyswijmjxuajhif.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZnl5dGx0dXd1eHV1b2V2YXZvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDU0NDgwMywiZXhwIjoyMDc2MTIwODAzfQ.tIu_7VgOJvRb1QU-YHKvT1TbNaxOGZgOt_hdbkUQQ64';

const supabase = createClient(supabaseUrl, serviceKey);

async function finalCleanup() {
  console.log('\n🔧 FINAL METADATA CLEANUP');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Get all tracks that still need metadata
  const { data: allTracks, error: fetchError } = await supabase
    .from('audio_tracks')
    .select('id, metadata')
    .is('deleted_at', null);

  if (fetchError) {
    console.error('Error fetching tracks:', fetchError);
    return;
  }

  const pendingTracks = allTracks.filter((track: any) =>
    track.metadata.track_name === track.metadata.track_id
  );

  const error = null;

  if (error) {
    console.error('Error fetching pending tracks:', error);
    return;
  }

  console.log(`Found ${pendingTracks.length} tracks still needing metadata\n`);

  let updated = 0;
  let errors = 0;

  for (let i = 0; i < pendingTracks.length; i++) {
    const track = pendingTracks[i];
    const trackId = track.metadata.track_id;

    try {
      // Fetch JSON from storage
      const jsonUrl = `${supabaseUrl}/storage/v1/object/public/audio-files/${trackId}.json`;
      const response = await fetch(jsonUrl);

      if (!response.ok) {
        console.log(`  ❌ Track ${trackId}: JSON not found`);
        errors++;
        continue;
      }

      const jsonData = await response.json();
      const metadata = jsonData.metadata || {};

      // Update the track
      const { error: updateError } = await supabase
        .from('audio_tracks')
        .update({
          metadata: {
            track_id: trackId,
            track_name: metadata.track_name || trackId,
            artist_name: metadata.artist_name || 'Focus.Music',
            album_name: metadata.album_name || '',
            duration: metadata.duration || '0',
            tempo: metadata.tempo || '120',
            file: metadata.file || '',
            catalog: metadata.catalog || '',
            genre_category: metadata.genre_category || ''
          }
        })
        .eq('id', track.id);

      if (updateError) {
        console.log(`  ❌ Track ${trackId}: Update failed - ${updateError.message}`);
        errors++;
      } else {
        updated++;
        if (updated % 10 === 0) {
          console.log(`  ✅ Updated ${updated}/${pendingTracks.length} tracks...`);
        }
      }
    } catch (err: any) {
      console.log(`  ❌ Track ${trackId}: ${err.message}`);
      errors++;
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Updated: ${updated}`);
  console.log(`❌ Errors: ${errors}`);
  console.log(`📊 Total processed: ${pendingTracks.length}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

finalCleanup().catch(console.error);

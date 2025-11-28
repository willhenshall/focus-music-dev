import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, anonKey);

/**
 * Extract version information from track name
 * Patterns to match:
 * - _v1, _v2, _v3, etc.
 * - _P4, _P1, etc.
 * - .02_01_P4, .01_02_P3, etc. (compound versions)
 * - Combinations at the end of the track name
 */
function extractVersion(trackName: string): { cleanName: string; version: string } {
  // Pattern to match version suffixes at the end of the track name
  // Matches: _v#, _P#, .##_##_P#, or combinations
  const versionPattern = /[._](?:v\d+|P\d+|\d{2}_\d{2}_P\d+)$/i;

  const match = trackName.match(versionPattern);

  if (match) {
    const version = match[0].substring(1); // Remove leading _ or .
    const cleanName = trackName.substring(0, match.index).trim();
    return { cleanName, version };
  }

  return { cleanName: trackName, version: '' };
}

async function processAllTracks() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎵 VERSION INFO EXTRACTION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const BATCH_SIZE = 100;
  let offset = 0;
  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  while (true) {
    // Fetch batch of tracks
    const { data: tracks, error } = await supabase
      .from('audio_tracks')
      .select('id, metadata')
      .is('deleted_at', null)
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      console.error('❌ Error fetching tracks:', error);
      console.error('Full error:', JSON.stringify(error, null, 2));
      break;
    }

    if (!tracks || tracks.length === 0) {
      console.log(`No more tracks found at offset ${offset}`);
      break;
    }

    console.log(`Fetched ${tracks.length} tracks at offset ${offset}`);

    // Process each track in the batch
    for (const track of tracks) {
      totalProcessed++;

      const trackName = track.metadata?.track_name;
      if (!trackName) {
        totalSkipped++;
        continue;
      }

      const { cleanName, version } = extractVersion(trackName);

      // Only update if we found a version or if track name changed
      if (version || cleanName !== trackName) {
        const updatedMetadata = {
          ...track.metadata,
          track_name: cleanName,
          version: version || null,
        };

        const { error: updateError } = await supabase
          .from('audio_tracks')
          .update({ metadata: updatedMetadata })
          .eq('id', track.id);

        if (updateError) {
          console.error(`❌ Failed to update track ${track.id}:`, updateError.message);
        } else {
          totalUpdated++;
          if (version) {
            console.log(`✓ ${trackName} → ${cleanName} [version: ${version}]`);
          }
        }
      } else {
        totalSkipped++;
      }
    }

    offset += BATCH_SIZE;

    if (totalProcessed % 1000 === 0) {
      console.log(`\n📊 Progress: ${totalProcessed} tracks processed, ${totalUpdated} updated\n`);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Total Processed: ${totalProcessed}`);
  console.log(`✅ Total Updated: ${totalUpdated}`);
  console.log(`⊘  Skipped (no changes): ${totalSkipped}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

processAllTracks().catch(console.error);

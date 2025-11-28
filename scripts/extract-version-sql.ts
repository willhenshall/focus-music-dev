import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, anonKey);

/**
 * Extract version information from track name
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
  console.log('🎵 VERSION INFO EXTRACTION (SQL Method)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Get all tracks with their metadata using raw SQL
  const { data: tracks, error } = await supabase.rpc('exec_sql', {
    query: `
      SELECT id, metadata
      FROM audio_tracks
      WHERE deleted_at IS NULL
      ORDER BY id
      LIMIT 11240
    `
  });

  if (error) {
    console.error('❌ Error fetching tracks:', error);

    // Fallback: Try using PostgREST directly
    console.log('\nTrying alternative method...\n');

    const response = await fetch(`${supabaseUrl}/rest/v1/audio_tracks?select=id,metadata&deleted_at=is.null&limit=11240`, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
    });

    if (!response.ok) {
      console.error('❌ Alternative method also failed');
      return;
    }

    const fetchedTracks = await response.json();
    await processTracks(fetchedTracks);
    return;
  }

  await processTracks(tracks);
}

async function processTracks(tracks: any[]) {
  console.log(`Found ${tracks.length} tracks to process\n`);

  let totalUpdated = 0;
  let totalSkipped = 0;

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
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

    if ((i + 1) % 1000 === 0) {
      console.log(`\n📊 Progress: ${i + 1}/${tracks.length} processed, ${totalUpdated} updated\n`);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Total Processed: ${tracks.length}`);
  console.log(`✅ Total Updated: ${totalUpdated}`);
  console.log(`⊘  Skipped (no changes): ${totalSkipped}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

processAllTracks().catch(console.error);

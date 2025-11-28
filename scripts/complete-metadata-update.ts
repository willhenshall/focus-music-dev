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

async function processAllTracks() {
  console.log('🎵 Processing all remaining tracks...\n');

  let totalUpdated = 0;
  let batchNumber = 0;

  while (true) {
    batchNumber++;

    try {
      // Get count of remaining tracks
      const { count } = await supabase
        .from('audio_tracks')
        .select('*', { count: 'exact', head: true })
        .eq('metadata->>track_name', 'metadata->>track_id');

      console.log(`\n📊 Remaining tracks: ${count || 0}`);

      if (!count || count === 0) {
        console.log('\n✅ All tracks updated!');
        break;
      }

      console.log(`📦 Processing batch ${batchNumber} (100 tracks)...`);

      // Call the SQL function via RPC to process 100 tracks
      const { error } = await supabase.rpc('execute_sql', {
        query: `
          DO $$
          DECLARE track_rec RECORD; success_count INT := 0;
          BEGIN
            FOR track_rec IN
              SELECT id, metadata->>'track_id' as track_id
              FROM audio_tracks
              WHERE metadata->>'track_name' = metadata->>'track_id'
              ORDER BY id
              LIMIT 100
            LOOP
              PERFORM update_single_track_metadata(track_rec.id, track_rec.track_id);
              success_count := success_count + 1;
            END LOOP;
          END $$;
        `
      });

      if (error) {
        console.error('   ❌ Error:', error.message);
      } else {
        totalUpdated += 100;
        console.log(`   ✓ Batch ${batchNumber} complete`);
        console.log(`   Total updated so far: ${totalUpdated}`);
      }

      // Small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (e: any) {
      console.error(`   ❌ Exception in batch ${batchNumber}:`, e.message);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('\n🎉 All tracks processed!');
  console.log(`   Total updated: ${totalUpdated}`);
}

processAllTracks().catch(console.error);

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!
);

async function applyMigration() {
  console.log('🔧 Applying CDN tracking columns migration...\n');

  // Apply each statement individually
  const statements = [
    {
      name: 'Add cdn_url column',
      sql: 'ALTER TABLE audio_tracks ADD COLUMN IF NOT EXISTS cdn_url text'
    },
    {
      name: 'Add cdn_uploaded_at column',
      sql: 'ALTER TABLE audio_tracks ADD COLUMN IF NOT EXISTS cdn_uploaded_at timestamptz'
    },
    {
      name: 'Add storage_locations column',
      sql: `ALTER TABLE audio_tracks ADD COLUMN IF NOT EXISTS storage_locations jsonb DEFAULT '{"supabase": false, "r2_cdn": false, "upload_timestamps": {}}'::jsonb`
    },
    {
      name: 'Create cdn_url index',
      sql: 'CREATE INDEX IF NOT EXISTS idx_audio_tracks_cdn_url ON audio_tracks(cdn_url)'
    },
    {
      name: 'Create storage_locations index',
      sql: 'CREATE INDEX IF NOT EXISTS idx_audio_tracks_storage_locations ON audio_tracks USING gin(storage_locations)'
    }
  ];

  for (const stmt of statements) {
    console.log(`Executing: ${stmt.name}...`);
    try {
      const response = await fetch(
        `${process.env.VITE_SUPABASE_URL}/rest/v1/rpc/exec`,
        {
          method: 'POST',
          headers: {
            'apikey': process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!,
            'Authorization': `Bearer ${process.env.VITE_SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sql: stmt.sql })
        }
      );

      if (response.ok) {
        console.log(`  ✅ Success`);
      } else {
        const error = await response.text();
        console.log(`  ⚠️  ${error}`);
      }
    } catch (error: any) {
      console.log(`  ⚠️  ${error.message}`);
    }
  }

  // Verify columns exist
  console.log('\n🔍 Verifying columns exist...');
  const { data: testData, error: testError } = await supabase
    .from('audio_tracks')
    .select('cdn_url, cdn_uploaded_at, storage_locations')
    .limit(1);

  if (testError) {
    console.error('❌ Verification failed:', testError.message);
    console.error('   Columns may not have been added successfully.');
    console.error('   You may need to apply this migration manually in the Supabase SQL Editor:');
    console.error('\n   https://supabase.com/dashboard/project/xewajlyswijmjxuajhif/sql/new\n');
    process.exit(1);
  } else {
    console.log('✅ CDN columns verified and working!');
    console.log('   - cdn_url');
    console.log('   - cdn_uploaded_at');
    console.log('   - storage_locations');
    console.log('\n🎉 Migration complete! CDN system ready to use.');
  }
}

applyMigration().catch((error) => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});

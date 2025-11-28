import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function deleteAllSidecarFiles() {
  console.log('🗑️  DELETING ALL SIDECAR FILES FROM STORAGE');
  console.log('==========================================\n');

  console.log('⚠️  WARNING: This will permanently delete all sidecar JSON files!');
  console.log('⏳ Starting in 3 seconds...\n');
  await new Promise(resolve => setTimeout(resolve, 3000));

  let totalDeleted = 0;
  let hasMore = true;
  let offset = 0;
  const batchSize = 1000;

  while (hasMore) {
    console.log(`📋 Fetching batch at offset ${offset}...`);

    const { data: files, error: listError } = await supabase
      .storage
      .from('audio-sidecars')
      .list('', {
        limit: batchSize,
        offset: offset,
        sortBy: { column: 'name', order: 'asc' }
      });

    if (listError) {
      console.error('❌ Error listing files:', listError);
      break;
    }

    if (!files || files.length === 0) {
      hasMore = false;
      break;
    }

    console.log(`   Found ${files.length} files in this batch`);

    const filePaths = files.map(f => f.name);

    const { error: deleteError } = await supabase
      .storage
      .from('audio-sidecars')
      .remove(filePaths);

    if (deleteError) {
      console.error('❌ Error deleting batch:', deleteError);
      break;
    }

    totalDeleted += files.length;
    console.log(`   ✅ Deleted ${files.length} files (total: ${totalDeleted})`);

    if (files.length < batchSize) {
      hasMore = false;
    }
  }

  console.log(`\n✅ COMPLETE: Deleted ${totalDeleted} sidecar files from storage`);
}

deleteAllSidecarFiles().catch(console.error);

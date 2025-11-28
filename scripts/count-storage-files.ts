import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!
);

async function countStorageFiles() {
  let total = 0;
  let offset = 0;
  const limit = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: files, error } = await supabase.storage
      .from('audio-files')
      .list('', { limit, offset });

    if (error) {
      console.error('Error:', error);
      break;
    }

    const mp3Files = files.filter(f => f.name.endsWith('.mp3'));
    total += mp3Files.length;

    console.log(`Batch: ${mp3Files.length} mp3 files (offset ${offset})`);

    hasMore = files.length === limit;
    offset += limit;
  }

  console.log(`\nTotal MP3 files in storage: ${total}`);
}

countStorageFiles();

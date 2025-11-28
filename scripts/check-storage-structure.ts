import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

async function checkStorage() {
  console.log('Checking audio-files bucket...\n');
  
  // List files in audio-files bucket
  const { data, error } = await supabase.storage
    .from('audio-files')
    .list('', { limit: 1000 });

  if (error) {
    console.error('Error listing files:', error);
    return;
  }

  console.log(`Total items in root: ${data.length}`);
  
  // Check for folders vs files
  const folders = data.filter(item => !item.name.includes('.'));
  const files = data.filter(item => item.name.includes('.'));
  
  console.log(`Folders: ${folders.length}`);
  console.log(`Files (including .mp3): ${files.length}`);
  
  const mp3Files = files.filter(item => item.name.endsWith('.mp3'));
  console.log(`MP3 files: ${mp3Files.length}`);
  
  console.log('\nFirst 30 items:');
  data.slice(0, 30).forEach(item => {
    console.log(`- ${item.name}`);
  });

  // Check for specific track
  const searchResult = data.find(item => item.name.includes('108023'));
  console.log('\n\nSearching for 108023:', searchResult || 'Not found in root');
  
  // If there are folders, check inside them
  if (folders.length > 0) {
    console.log('\n\nChecking first folder:', folders[0].name);
    const { data: folderData } = await supabase.storage
      .from('audio-files')
      .list(folders[0].name, { limit: 10 });
    
    if (folderData) {
      console.log(`Items in ${folders[0].name}:`, folderData.length);
      folderData.forEach(item => console.log(`  - ${item.name}`));
    }
  }
}

checkStorage();

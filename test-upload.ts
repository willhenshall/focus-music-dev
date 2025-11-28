import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabaseUrl = 'https://xewajlyswijmjxuajhif.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZnl5dGx0dXd1eHV1b2V2YXZvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDU0NDgwMywiZXhwIjoyMDc2MTIwODAzfQ.tIu_7VgOJvRb1QU-YHKvT1TbNaxOGZgOt_hdbkUQQ64';

console.log('Testing Supabase connection and upload...\n');

// Test 1: Database query
console.log('Test 1: Database query');
const supabase = createClient(supabaseUrl, serviceRoleKey);

const { data: buckets, error: bucketsError } = await supabase
  .storage
  .listBuckets();

if (bucketsError) {
  console.log('❌ Failed to list buckets:', bucketsError);
} else {
  console.log('✅ Successfully listed buckets:', buckets?.map(b => b.name));
}

// Test 2: Create a tiny test file and upload it
console.log('\nTest 2: Upload test file');
const testContent = 'This is a test file';
const testFileName = `test-${Date.now()}.txt`;

const { data: uploadData, error: uploadError } = await supabase.storage
  .from('audio-files')
  .upload(testFileName, testContent, {
    contentType: 'text/plain'
  });

if (uploadError) {
  console.log('❌ Failed to upload test file:', uploadError);
} else {
  console.log('✅ Successfully uploaded test file:', uploadData);

  // Clean up
  await supabase.storage.from('audio-files').remove([testFileName]);
  console.log('✅ Cleaned up test file');
}

console.log('\nIf the text file upload worked but MP3 upload fails,');
console.log('the issue might be with binary file handling or file size.');

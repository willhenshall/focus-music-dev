import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function testColumns() {
  console.log('Testing if columns exist...');

  try {
    // Try to select the new columns
    const { data, error } = await supabase
      .from('audio_channels')
      .select('id, channel_name, about_channel, about_image_url, about_external_link')
      .limit(1);

    if (error) {
      console.error('❌ Columns do NOT exist yet');
      console.error('Error:', error.message);
      console.log('\n=== MANUAL MIGRATION REQUIRED ===');
      console.log('Go to your Supabase Dashboard → SQL Editor and run:\n');
      console.log('ALTER TABLE audio_channels ADD COLUMN IF NOT EXISTS about_channel TEXT;');
      console.log('ALTER TABLE audio_channels ADD COLUMN IF NOT EXISTS about_image_url TEXT;');
      console.log('ALTER TABLE audio_channels ADD COLUMN IF NOT EXISTS about_external_link TEXT;');
      console.log('\nOr use the migration file at:');
      console.log('supabase/migrations/20251113234916_add_about_channel_field.sql');
    } else {
      console.log('✓ Columns exist!');
      console.log('Sample data:', data);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

testColumns();

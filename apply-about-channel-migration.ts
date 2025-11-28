import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  try {
    console.log('Applying about_channel migration...');

    const migrationPath = path.join(__dirname, 'supabase/migrations/20251113234916_add_about_channel_field.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Extract just the ALTER TABLE statements (skip comments)
    const statements = [
      `ALTER TABLE audio_channels ADD COLUMN IF NOT EXISTS about_channel TEXT`,
      `ALTER TABLE audio_channels ADD COLUMN IF NOT EXISTS about_image_url TEXT`,
      `ALTER TABLE audio_channels ADD COLUMN IF NOT EXISTS about_external_link TEXT`
    ];

    for (const statement of statements) {
      console.log(`Executing: ${statement}`);
      const { error } = await supabase.rpc('exec_sql', { sql: statement });

      if (error) {
        // Try direct query if RPC doesn't work
        const result = await supabase.from('audio_channels').select('about_channel').limit(1);
        if (result.error && result.error.message.includes('column')) {
          console.error('Migration failed:', error);
          throw error;
        } else {
          console.log('Column might already exist, continuing...');
        }
      } else {
        console.log('✓ Statement executed successfully');
      }
    }

    // Verify the columns exist
    console.log('\nVerifying columns...');
    const { data, error } = await supabase
      .from('audio_channels')
      .select('id, about_channel, about_image_url, about_external_link')
      .limit(1);

    if (error) {
      console.error('Verification failed:', error.message);
      console.log('\nPlease run this SQL manually in your Supabase SQL Editor:');
      console.log(migrationSQL);
    } else {
      console.log('✓ Migration applied successfully!');
      console.log('Columns verified:', Object.keys(data?.[0] || {}));
    }

  } catch (error) {
    console.error('Error applying migration:', error);
    console.log('\n=== MANUAL MIGRATION REQUIRED ===');
    console.log('Please run the following SQL in your Supabase SQL Editor:\n');
    console.log('ALTER TABLE audio_channels ADD COLUMN IF NOT EXISTS about_channel TEXT;');
    console.log('ALTER TABLE audio_channels ADD COLUMN IF NOT EXISTS about_image_url TEXT;');
    console.log('ALTER TABLE audio_channels ADD COLUMN IF NOT EXISTS about_external_link TEXT;');
  }
}

applyMigration();

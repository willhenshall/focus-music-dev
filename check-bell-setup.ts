import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

async function checkBellSetup() {
  console.log('=== Checking Timer Bell System Setup ===\n');

  // Check timer_bell_sounds table
  const { data: bellSounds, error: bellError } = await supabase
    .from('timer_bell_sounds')
    .select('id, name, is_default, is_visible')
    .limit(5);

  if (bellError) {
    console.log('❌ timer_bell_sounds table:', bellError.message);
  } else {
    console.log('✅ timer_bell_sounds table exists');
    console.log(`   Found ${bellSounds?.length || 0} bell sounds`);
    if (bellSounds && bellSounds.length > 0) {
      bellSounds.forEach(b => console.log(`   - ${b.name} (default: ${b.is_default}, visible: ${b.is_visible})`));
    }
  }

  // Check user_bell_preferences table
  const { data: prefs, error: prefsError } = await supabase
    .from('user_bell_preferences')
    .select('id')
    .limit(1);

  if (prefsError) {
    console.log('\n❌ user_bell_preferences table:', prefsError.message);
  } else {
    console.log('\n✅ user_bell_preferences table exists');
  }

  // Check storage bucket
  const { data: buckets, error: bucketError } = await supabase
    .storage
    .listBuckets();

  if (bucketError) {
    console.log('\n❌ Storage buckets check failed:', bucketError.message);
  } else {
    const timerBellBucket = buckets.find(b => b.id === 'timer-bell');
    if (timerBellBucket) {
      console.log('\n✅ timer-bell storage bucket exists');
      console.log(`   Public: ${timerBellBucket.public}`);
      
      // Check files in bucket
      const { data: files, error: filesError } = await supabase
        .storage
        .from('timer-bell')
        .list();
      
      if (!filesError && files) {
        console.log(`   Files: ${files.length}`);
      }
    } else {
      console.log('\n❌ timer-bell storage bucket NOT FOUND');
      console.log('   Available buckets:', buckets.map(b => b.id).join(', '));
    }
  }

  // Check system_preferences for timer_bell_url
  const { data: sysPref, error: sysPrefError } = await supabase
    .from('system_preferences')
    .select('timer_bell_url')
    .eq('id', 1)
    .maybeSingle();

  if (sysPrefError) {
    console.log('\n❌ system_preferences.timer_bell_url check failed:', sysPrefError.message);
  } else {
    console.log('\n✅ system_preferences.timer_bell_url column exists');
    console.log(`   Current value: ${sysPref?.timer_bell_url || 'NULL (using default)'}`);
  }
}

checkBellSetup().then(() => process.exit(0));

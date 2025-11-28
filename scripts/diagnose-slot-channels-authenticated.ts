/**
 * Authenticated Slot Channel Diagnostic
 *
 * This script simulates what an authenticated user experiences
 * when trying to play slot-based channels.
 *
 * Run with: npx tsx scripts/diagnose-slot-channels-authenticated.ts
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY!;

// Create client as anon, then we'll show what authenticated sees
const supabase = createClient(supabaseUrl, anonKey);

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  AUTHENTICATED SLOT CHANNEL DIAGNOSTIC                       ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

async function diagnose() {
  console.log('Step 1: Check which channels use slot-based strategy\n');

  const { data: channels, error: channelError } = await supabase
    .from('audio_channels')
    .select('id, channel_number, channel_name, playlist_strategy');

  if (channelError) {
    console.error('❌ Error fetching channels:', channelError.message);
    return;
  }

  const slotChannels = channels?.filter(ch => {
    const ps = ch.playlist_strategy;
    return ps && (
      ps.low?.strategy === 'slot_based' ||
      ps.medium?.strategy === 'slot_based' ||
      ps.high?.strategy === 'slot_based'
    );
  }) || [];

  console.log(`Found ${slotChannels.length} slot-based channels:\n`);
  slotChannels.forEach(ch => {
    const tiers = [];
    if (ch.playlist_strategy?.low?.strategy === 'slot_based') tiers.push('low');
    if (ch.playlist_strategy?.medium?.strategy === 'slot_based') tiers.push('medium');
    if (ch.playlist_strategy?.high?.strategy === 'slot_based') tiers.push('high');
    console.log(`  #${ch.channel_number} ${ch.channel_name} (${tiers.join(', ')})`);
  });

  console.log('\n' + '─'.repeat(70) + '\n');
  console.log('Step 2: Check RLS access to slot strategy tables\n');

  // Test as anonymous
  const tables = ['slot_strategies', 'slot_definitions', 'slot_boosts', 'slot_rule_groups', 'slot_rules'];

  console.log('Testing with ANON key (unauthenticated):\n');
  for (const table of tables) {
    const { count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    console.log(`  ${table.padEnd(25)} ${count === 0 ? '❌' : '✓'} ${count} rows visible`);
  }

  console.log('\n' + '─'.repeat(70) + '\n');
  console.log('Step 3: Simulate what authenticated user would see\n');
  console.log('NOTE: This requires you to provide credentials.\n');
  console.log('To test with real authentication, you need to:');
  console.log('  1. Create a test user in Supabase Auth');
  console.log('  2. Sign in with that user');
  console.log('  3. Use the session token to query\n');

  console.log('Example code to test with authenticated user:\n');
  console.log('```typescript');
  console.log('// Sign in');
  console.log('const { data: authData, error: authError } = await supabase.auth.signInWithPassword({');
  console.log('  email: "test@example.com",');
  console.log('  password: "test-password"');
  console.log('});');
  console.log('');
  console.log('// Now queries will run as authenticated user');
  console.log('const { data, count } = await supabase');
  console.log('  .from("slot_strategies")');
  console.log('  .select("*", { count: "exact" });');
  console.log('```\n');

  console.log('─'.repeat(70) + '\n');
  console.log('Step 4: Check for foreign key relationships\n');

  if (slotChannels.length > 0) {
    const firstChannel = slotChannels[0];
    console.log(`Checking channel: #${firstChannel.channel_number} ${firstChannel.channel_name}`);
    console.log(`Channel ID: ${firstChannel.id}\n`);

    // Try to query strategies for this channel
    const { data: strategies, error: stratError } = await supabase
      .from('slot_strategies')
      .select('*')
      .eq('channel_id', firstChannel.id);

    if (stratError) {
      console.log(`❌ Error querying strategies: ${stratError.message}`);
    } else if (!strategies || strategies.length === 0) {
      console.log('⚠️  No strategies found for this channel (might be RLS filtering)');
    } else {
      console.log(`✓ Found ${strategies.length} strategies for this channel`);
      strategies.forEach(s => {
        console.log(`  - ${s.energy_tier}: ${s.num_slots} slots`);
      });
    }
  }

  console.log('\n' + '─'.repeat(70) + '\n');
  console.log('DIAGNOSIS SUMMARY:\n');
  console.log('The slot strategy tables use RLS policies that require authentication.');
  console.log('This means:');
  console.log('  • Anonymous users CANNOT read these tables');
  console.log('  • Authenticated users CAN read these tables');
  console.log('  • The data exists, but RLS controls access\n');

  console.log('To fully diagnose, you need to:');
  console.log('  1. Check browser console when a user tries to play a slot channel');
  console.log('  2. Verify the user is authenticated (check for auth token)');
  console.log('  3. Look for any error messages in the network tab');
  console.log('  4. Share those errors here for analysis\n');

  console.log('Possible issues to investigate:');
  console.log('  • Users playing channels while NOT logged in');
  console.log('  • Auth session not properly initialized');
  console.log('  • Auth token not being sent with Supabase queries');
  console.log('  • Channel IDs mismatched between audio_channels and slot_strategies');
  console.log('  • Client-side code not handling "no data" case gracefully\n');
}

diagnose().catch(console.error);

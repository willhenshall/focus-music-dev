import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

async function testFullSelection() {
  const channelId = '1e79a776-29f3-4317-9a7f-096e2217dcef';
  const energyTier = 'medium';
  const slotIndex = 1;

  console.log('Testing FULL track selection...\n');

  const { data: strategy, error: strategyError } = await supabase
    .from('slot_strategies')
    .select('*')
    .eq('channel_id', channelId)
    .eq('energy_tier', energyTier)
    .maybeSingle();

  if (!strategy) {
    console.log('❌ No strategy found');
    return;
  }
  console.log('✓ Strategy loaded:', strategy.id.substring(0, 8));

  const { data: slotDef, error: slotError } = await supabase
    .from('slot_definitions')
    .select('*')
    .eq('strategy_id', strategy.id)
    .eq('index', slotIndex)
    .maybeSingle();

  if (!slotDef) {
    console.log('❌ No slot definition found for index', slotIndex);
    console.log('   Error:', slotError?.message);
    return;
  }
  console.log('✓ Slot definition loaded:', slotDef.id.substring(0, 8));
  console.log('  Target values:', {
    speed: slotDef.target_speed,
    intensity: slotDef.target_intensity,
    brightness: slotDef.target_brightness
  });

  const { data: boosts } = await supabase
    .from('slot_boosts')
    .select('*')
    .eq('slot_definition_id', slotDef.id);

  console.log('✓ Boosts loaded:', boosts?.length || 0);

  const { data: ruleGroups } = await supabase
    .from('slot_rule_groups')
    .select(`
      *,
      rules:slot_rules(*)
    `)
    .eq('strategy_id', strategy.id);

  console.log('✓ Rule groups loaded:', ruleGroups?.length || 0);

  const { data: tracks, error: tracksError } = await supabase
    .from('audio_tracks')
    .select('id')
    .is('deleted_at', null)
    .limit(10);

  console.log('✓ Tracks available:', tracks?.length || 0);

  if (tracks && tracks.length > 0) {
    console.log('\n✅ ALL DATA ACCESSIBLE - Slot selection should work!');
  } else {
    console.log('\n❌ No tracks found:', tracksError?.message);
  }
}

testFullSelection().catch(console.error);

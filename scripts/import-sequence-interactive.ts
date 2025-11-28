import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!
);

const DEFAULT_BOOSTS = [
  { field: 'speed', mode: 'near', weight: 2 },
  { field: 'intensity', mode: 'near', weight: 4 },
  { field: 'brightness', mode: 'near', weight: 1 },
  { field: 'complexity', mode: 'near', weight: 1 },
  { field: 'valence', mode: 'near', weight: 1 },
  { field: 'arousal', mode: 'near', weight: 1 },
  { field: 'bpm', mode: 'near', weight: 1 },
];

// Edit this object with your data from the screenshot
const SEQUENCE_TO_IMPORT = {
  name: 'Example Sequence',
  description: 'Imported from focus@will live site',
  channelSlug: 'bach_beats', // Change this to match your channel
  energyTier: 'medium' as 'low' | 'medium' | 'high',

  // Paste the values from your screenshot here
  // Arrays should have the same length (20 slots in your example)
  slots: {
    speed: [3, 3, 3, 2, 2, 3, 2, 3, 3, 3, 2, 2, 2, 3, 2, 3, 3, 2, 3, 2],
    intensity: [3, 3, 3, 2, 3, 2, 3, 2, 3, 3, 3, 2, 3, 2, 3, 2, 3, 3, 3, 2],
    brightness: [4, 4, 4, 2, 4, 3, 4, 3, 5, 2, 3, 2, 4, 3, 4, 3, 5, 2, 3, 2],
    complexity: [3, 3, 3, 3, 4, 3, 2, 3, 4, 5, 2, 3, 4, 3, 2, 3, 4, 5, 2, 3],
    valence: [0.00, 0.00, 0.00, -0.10, 0.20, 0.50, 0.30, 0.10, -0.10, -0.20, -0.30, -0.20, 0.50, 0.60, 0.40, 0.35, -0.10, -0.20, -0.10, 1.00],
    arousal: [0.10, 0.00, 0.10, 0.20, 0.25, 0.35, 0.40, 0.50, 0.00, 0.10, 0.20, 0.30, 0.50, 0.70, 0.40, 0.30, -1.00, 0.30, 0.50, 0.70],
    bpm: [86, 86, 86, 83, 83, 84, 86, 88, 89, 92, 94, 95, 97, 99, 100, 75, 76, 90, 95, 78],
  }
};

async function main() {
  console.log('\n🎵 Slot Sequence Importer\n');

  // Get admin user
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error('❌ Error: Not authenticated. Please set up authentication first.');
    return;
  }

  // Check if user is admin
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    console.error('❌ Error: User must be admin to import sequences.');
    return;
  }

  // Find channel by slug
  const { data: channel } = await supabase
    .from('audio_channels')
    .select('id, channel_name, slug')
    .eq('slug', SEQUENCE_TO_IMPORT.channelSlug)
    .single();

  if (!channel) {
    console.error(`❌ Error: Channel with slug "${SEQUENCE_TO_IMPORT.channelSlug}" not found.`);
    console.log('\nAvailable channels:');

    const { data: allChannels } = await supabase
      .from('audio_channels')
      .select('slug, channel_name')
      .order('channel_name');

    allChannels?.forEach((ch) => {
      console.log(`  - ${ch.slug} (${ch.channel_name})`);
    });
    return;
  }

  console.log(`Channel: ${channel.channel_name}`);
  console.log(`Energy Tier: ${SEQUENCE_TO_IMPORT.energyTier}`);
  console.log(`Sequence Name: ${SEQUENCE_TO_IMPORT.name}`);

  // Validate data
  const { slots } = SEQUENCE_TO_IMPORT;
  const numSlots = slots.speed.length;

  const fields = ['speed', 'intensity', 'brightness', 'complexity', 'valence', 'arousal', 'bpm'] as const;
  for (const field of fields) {
    if (slots[field].length !== numSlots) {
      console.error(`❌ Error: ${field} has ${slots[field].length} values, expected ${numSlots}`);
      return;
    }
  }

  console.log(`\n✓ Validated ${numSlots} slots across ${fields.length} fields`);

  // Create definitions
  const definitions = [];
  for (let i = 0; i < numSlots; i++) {
    definitions.push({
      index: i,
      targets: {
        speed: slots.speed[i],
        intensity: slots.intensity[i],
        brightness: slots.brightness[i],
        complexity: slots.complexity[i],
        valence: slots.valence[i],
        arousal: slots.arousal[i],
        bpm: slots.bpm[i],
      },
      boosts: DEFAULT_BOOSTS,
    });
  }

  // Default rule group
  const ruleGroups = [
    {
      logic: 'AND',
      order: 0,
      rules: [
        {
          field: 'channel_id',
          operator: 'eq',
          value: channel.id,
        },
      ],
    },
  ];

  // Save to database
  console.log('\n💾 Saving to database...');

  const { data, error } = await supabase
    .from('saved_slot_sequences')
    .insert({
      name: SEQUENCE_TO_IMPORT.name,
      description: SEQUENCE_TO_IMPORT.description,
      channel_id: channel.id,
      energy_tier: SEQUENCE_TO_IMPORT.energyTier,
      num_slots: numSlots,
      recent_repeat_window: 5,
      definitions,
      rule_groups: ruleGroups,
      playback_continuation: 'continue',
      created_by: user.id,
    })
    .select();

  if (error) {
    console.error('❌ Error saving sequence:', error);
    throw error;
  }

  console.log('✅ Sequence saved successfully!');
  console.log(`   ID: ${data[0].id}`);
  console.log(`   Name: ${data[0].name}`);
  console.log(`   Channel: ${channel.channel_name}`);
  console.log(`   Energy: ${data[0].energy_tier}`);
  console.log(`   Slots: ${data[0].num_slots}`);
  console.log('\n✨ You can now load this sequence in the Slot Strategy Editor!');
}

main().catch(console.error);

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!
);

interface SlotData {
  speed: number[];
  intensity: number[];
  brightness: number[];
  complexity: number[];
  valence: number[];
  arousal: number[];
  bpm: number[];
}

const DEFAULT_BOOSTS = [
  { field: 'speed', mode: 'near', weight: 2 },
  { field: 'intensity', mode: 'near', weight: 4 },
  { field: 'brightness', mode: 'near', weight: 1 },
  { field: 'complexity', mode: 'near', weight: 1 },
  { field: 'valence', mode: 'near', weight: 1 },
  { field: 'arousal', mode: 'near', weight: 1 },
  { field: 'bpm', mode: 'near', weight: 1 },
];

async function importSlotSequence(
  name: string,
  description: string,
  channelId: string,
  energyTier: 'low' | 'medium' | 'high',
  slotData: SlotData,
  createdBy: string
) {
  const numSlots = slotData.speed.length;

  // Validate all arrays have the same length
  const fields = ['speed', 'intensity', 'brightness', 'complexity', 'valence', 'arousal', 'bpm'];
  for (const field of fields) {
    if (slotData[field as keyof SlotData].length !== numSlots) {
      throw new Error(`${field} array length (${slotData[field as keyof SlotData].length}) doesn't match expected length (${numSlots})`);
    }
  }

  // Create slot definitions
  const definitions = [];
  for (let i = 0; i < numSlots; i++) {
    definitions.push({
      index: i,
      targets: {
        speed: slotData.speed[i],
        intensity: slotData.intensity[i],
        brightness: slotData.brightness[i],
        complexity: slotData.complexity[i],
        valence: slotData.valence[i],
        arousal: slotData.arousal[i],
        bpm: slotData.bpm[i],
      },
      boosts: DEFAULT_BOOSTS,
    });
  }

  // Default rule group (tracks from this channel only)
  const ruleGroups = [
    {
      logic: 'AND',
      order: 0,
      rules: [
        {
          field: 'channel_id',
          operator: 'eq',
          value: channelId,
        },
      ],
    },
  ];

  console.log(`Importing sequence "${name}":`);
  console.log(`- Channel: ${channelId}`);
  console.log(`- Energy Tier: ${energyTier}`);
  console.log(`- Slots: ${numSlots}`);
  console.log(`- Definitions: ${definitions.length}`);

  const { data, error } = await supabase
    .from('saved_slot_sequences')
    .insert({
      name,
      description,
      channel_id: channelId,
      energy_tier: energyTier,
      num_slots: numSlots,
      recent_repeat_window: 5,
      definitions,
      rule_groups: ruleGroups,
      playback_continuation: 'continue',
      created_by: createdBy,
    })
    .select();

  if (error) {
    console.error('Error saving sequence:', error);
    throw error;
  }

  console.log('✓ Sequence saved successfully!');
  return data;
}

// Example: The data from your screenshot
const exampleSequence: SlotData = {
  speed: [3, 3, 3, 2, 2, 3, 2, 3, 3, 3, 2, 2, 2, 3, 2, 3, 3, 2, 3, 2],
  intensity: [3, 3, 3, 2, 3, 2, 3, 2, 3, 3, 3, 2, 3, 2, 3, 2, 3, 3, 3, 2],
  brightness: [4, 4, 4, 2, 4, 3, 4, 3, 5, 2, 3, 2, 4, 3, 4, 3, 5, 2, 3, 2],
  complexity: [3, 3, 3, 3, 4, 3, 2, 3, 4, 5, 2, 3, 4, 3, 2, 3, 4, 5, 2, 3],
  valence: [0.00, 0.00, 0.00, -0.10, 0.20, 0.50, 0.30, 0.10, -0.10, -0.20, -0.30, -0.20, 0.50, 0.60, 0.40, 0.35, -0.10, -0.20, -0.10, 1.00],
  arousal: [0.10, 0.00, 0.10, 0.20, 0.25, 0.35, 0.40, 0.50, 0.00, 0.10, 0.20, 0.30, 0.50, 0.70, 0.40, 0.30, -1.00, 0.30, 0.50, 0.70],
  bpm: [86.0, 86.0, 86.0, 83.0, 83.0, 84.0, 86.0, 88.0, 89.0, 92.0, 94.0, 95.0, 97.0, 99.0, 100.0, 75.0, 76.0, 90.0, 95.0, 78.0],
};

// Main execution
async function main() {
  // Get admin user (you'll need to replace this with your actual admin user ID)
  const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();

  if (usersError || !users || users.length === 0) {
    console.error('Error getting users:', usersError);
    return;
  }

  // Find admin user
  const adminUser = users.find(async (u) => {
    const { data } = await supabase
      .from('user_profiles')
      .select('is_admin')
      .eq('id', u.id)
      .single();
    return data?.is_admin;
  });

  if (!adminUser) {
    console.error('No admin user found');
    return;
  }

  // You'll need to specify which channel this is for
  // List available channels first
  const { data: channels } = await supabase
    .from('audio_channels')
    .select('id, channel_name, slug')
    .order('channel_name');

  console.log('\nAvailable channels:');
  channels?.forEach((ch, i) => {
    console.log(`${i + 1}. ${ch.channel_name} (${ch.slug}) - ${ch.id}`);
  });

  // Example import - you'll need to modify these values
  await importSlotSequence(
    'Example Sequence from Screenshot',
    'Imported from focus@will live site',
    channels?.[0]?.id || '', // Replace with actual channel ID
    'medium', // Replace with actual energy tier
    exampleSequence,
    adminUser.id
  );
}

main().catch(console.error);

import { supabase } from './src/lib/supabase';
import { config } from 'dotenv';

config({ path: '.env' });

async function debugTrackAssignment() {
  const trackId = '122093';
  
  console.log(`\n=== Debugging Track ${trackId} ===\n`);
  
  // 1. Get the track
  const { data: track } = await supabase
    .from('audio_tracks')
    .select('*')
    .eq('metadata->>track_id', trackId)
    .maybeSingle();
  
  if (!track) {
    console.log('Track not found!');
    return;
  }
  
  console.log('Track found:', track.metadata?.track_name);
  console.log('Track metadata sample:', {
    artist: track.metadata?.artist_name,
    genre: track.metadata?.genre_category,
    bpm: track.metadata?.bpm,
    tempo: track.tempo,
    intensity: track.intensity,
  });
  
  // 2. Find Tranquility channel
  const { data: channels } = await supabase
    .from('audio_channels')
    .select('*')
    .ilike('channel_name', '%tranquility%');
  
  if (!channels || channels.length === 0) {
    console.log('Tranquility channel not found!');
    return;
  }
  
  const tranquilityChannel = channels[0];
  console.log('\nTranquility Channel ID:', tranquilityChannel.id);
  console.log('Channel strategy config:', JSON.stringify(tranquilityChannel.playlist_strategy, null, 2));
  
  // 3. Check if medium energy uses slot sequencer
  const mediumStrategy = tranquilityChannel.playlist_strategy?.medium;
  console.log('\nMedium energy strategy:', mediumStrategy?.strategy);
  
  if (mediumStrategy?.strategy !== 'slot_based') {
    console.log('Medium energy does not use slot_based strategy!');
    return;
  }
  
  // 4. Get slot strategy for Tranquility Medium
  const { data: slotStrategy } = await supabase
    .from('slot_strategies')
    .select('*')
    .eq('channel_id', tranquilityChannel.id)
    .eq('energy_tier', 'medium')
    .maybeSingle();
  
  if (!slotStrategy) {
    console.log('Slot strategy not found for Tranquility Medium!');
    return;
  }
  
  console.log('\nSlot Strategy ID:', slotStrategy.id);
  console.log('Slot Strategy:', slotStrategy);
  
  // 5. Get rule groups
  const { data: ruleGroups } = await supabase
    .from('slot_rule_groups')
    .select('*')
    .eq('strategy_id', slotStrategy.id)
    .order('order', { ascending: true });
  
  console.log('\nRule Groups:', ruleGroups?.length || 0);
  
  if (!ruleGroups || ruleGroups.length === 0) {
    console.log('No rule groups - track should match!');
    return;
  }
  
  // 6. Check each rule group
  for (const group of ruleGroups) {
    console.log(`\n--- Rule Group ${group.id} (${group.logic}) ---`);
    
    const { data: rules } = await supabase
      .from('slot_rules')
      .select('*')
      .eq('group_id', group.id);
    
    console.log('Rules:', rules?.length || 0);
    
    if (rules) {
      for (const rule of rules) {
        console.log(`\nRule: ${rule.field} ${rule.operator} ${JSON.stringify(rule.value)}`);
        
        // Get track field value
        let trackValue;
        if (rule.field in track) {
          trackValue = track[rule.field as keyof typeof track];
        } else if (track.metadata && rule.field in track.metadata) {
          trackValue = track.metadata[rule.field];
        }
        
        console.log(`  Track value for "${rule.field}":`, trackValue);
        
        // Evaluate rule
        let matches = false;
        switch (rule.operator) {
          case 'eq':
            matches = trackValue === rule.value;
            break;
          case 'neq':
            matches = trackValue !== rule.value;
            break;
          case 'in':
            matches = Array.isArray(rule.value) && rule.value.includes(trackValue);
            break;
          case 'nin':
            matches = Array.isArray(rule.value) && !rule.value.includes(trackValue);
            break;
          case 'gte':
            matches = Number(trackValue) >= Number(rule.value);
            break;
          case 'lte':
            matches = Number(trackValue) <= Number(rule.value);
            break;
          case 'exists':
            matches = trackValue !== null && trackValue !== undefined && trackValue !== '';
            break;
        }
        
        console.log(`  Matches: ${matches}`);
      }
    }
  }
}

debugTrackAssignment().then(() => {
  console.log('\n=== Debug Complete ===\n');
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

import { AudioTrack, UserProfile } from './supabase';

export type PlaylistConfig = {
  channelId: string;
  energyLevel: 'low' | 'medium' | 'high';
};

export function getPlaylistFromChannel(
  channelPlaylistData: { low: string[]; medium: string[]; high: string[] },
  config: PlaylistConfig
): string[] {
  const playlistForEnergy = channelPlaylistData[config.energyLevel];

  if (!playlistForEnergy || playlistForEnergy.length === 0) {
    return [];
  }

  return playlistForEnergy;
}

export function getRecommendedChannels(
  profile: UserProfile,
  allChannels: Array<{ id: string; channel_number: number; channel_name: string; brain_type_affinity: string[]; neuroscience_tags: string[] }>
): Array<{ channelId: string; channelNumber: number; channelName: string; confidence: number; reasoning: string }> {
  const recommendations = allChannels.map(channel => {
    let confidence = 0.5;
    const reasons: string[] = [];

    if (channel.brain_type_affinity.includes(profile.brain_type || '')) {
      confidence += 0.3;
      reasons.push('Matches your brain type');
    }

    if (profile.adhd_indicator > 60 && channel.neuroscience_tags.includes('focus')) {
      confidence += 0.15;
      reasons.push('Optimized for focus with ADHD');
    }

    if (profile.asd_indicator > 60 && channel.neuroscience_tags.includes('predictable')) {
      confidence += 0.15;
      reasons.push('Predictable patterns for comfort');
    }

    if (profile.ocean_openness > 70 && channel.neuroscience_tags.includes('creative')) {
      confidence += 0.1;
      reasons.push('Enhances creative thinking');
    }

    if (profile.ocean_neuroticism > 60 && channel.neuroscience_tags.includes('calming')) {
      confidence += 0.15;
      reasons.push('Calming for anxiety reduction');
    }

    if (profile.ocean_conscientiousness > 70 && channel.neuroscience_tags.includes('structured')) {
      confidence += 0.1;
      reasons.push('Structured for deep work');
    }

    return {
      channelId: channel.id,
      channelNumber: channel.channel_number,
      channelName: channel.channel_name,
      confidence: Math.min(confidence, 1),
      reasoning: reasons.join('; '),
    };
  });

  recommendations.sort((a, b) => b.confidence - a.confidence);

  return recommendations.slice(0, 10);
}

import { supabase } from './supabase';

export type StoredQuizResults = {
  responses: Record<string, number | string>;
  ocean_scores: Record<string, number>;
  recommended_channels: Array<{
    channel_id: string;
    channel_name: string;
    family: string;
    weight: number;
  }>;
  asd_score: number;
  adhd_indicator: number;
  preferred_stimulant_level: string;
  brain_type_primary: string;
  brain_type_secondary?: string;
  brain_type_scores: Record<string, number>;
  quiz_version: string;
};

export async function saveQuizResultsToDatabase(userId: string): Promise<void> {
  const storedResults = localStorage.getItem('quiz_results');
  if (!storedResults) return;

  const results: StoredQuizResults = JSON.parse(storedResults);

  await supabase.from('quiz_results').insert({
    user_id: userId,
    quiz_version: results.quiz_version,
    responses: results.responses,
    ocean_scores: results.ocean_scores,
    recommended_channels: results.recommended_channels,
    brain_type_primary: results.brain_type_primary,
    brain_type_secondary: results.brain_type_secondary,
    brain_type_scores: results.brain_type_scores,
    adhd_indicator: results.adhd_indicator,
    asd_score: results.asd_score,
    preferred_stimulant_level: results.preferred_stimulant_level,
  });

  await supabase
    .from('user_profiles')
    .update({
      ocean_openness: Math.round(results.ocean_scores.openness * 100),
      ocean_conscientiousness: Math.round(results.ocean_scores.conscientiousness * 100),
      ocean_extraversion: Math.round(results.ocean_scores.extraversion * 100),
      ocean_agreeableness: Math.round(results.ocean_scores.agreeableness * 100),
      ocean_neuroticism: Math.round(results.ocean_scores.neuroticism * 100),
      adhd_indicator: results.adhd_indicator,
      asd_indicator: Math.round((results.asd_score / 2.5) * 100),
      prefers_music: true,
      energy_preference: results.ocean_scores.extraversion > 0.7 ||
                        results.preferred_stimulant_level === 'lot' ||
                        results.preferred_stimulant_level === 'medium'
                        ? 'high'
                        : results.ocean_scores.neuroticism > 0.6
                        ? 'medium'
                        : 'low',
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  // Deactivate all previous recommendations for this user
  await supabase
    .from('channel_recommendations')
    .update({ is_active: false })
    .eq('user_id', userId);

  // Determine recommended energy level based on user's profile
  const recommendedEnergyLevel = results.ocean_scores.extraversion > 0.7 ||
                                  results.preferred_stimulant_level === 'lot' ||
                                  results.preferred_stimulant_level === 'medium'
                                  ? 'high'
                                  : results.ocean_scores.neuroticism > 0.6
                                  ? 'medium'
                                  : 'low';

  // Insert new recommendations
  for (const channel of results.recommended_channels) {
    await supabase.from('channel_recommendations').insert({
      user_id: userId,
      channel_id: channel.channel_id,
      confidence_score: channel.weight / Math.max(...results.recommended_channels.map(c => c.weight)),
      reasoning: `Recommended based on ${channel.family} preference`,
      recommended_energy_level: recommendedEnergyLevel,
      is_active: true,
    });
  }

  localStorage.removeItem('quiz_results');
}

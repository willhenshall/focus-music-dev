export type QuizQuestion = {
  id: number;
  text: string;
  category: 'openness' | 'conscientiousness' | 'extraversion' | 'agreeableness' | 'neuroticism' | 'adhd' | 'asd' | 'music_preference';
  scale: number;
  reversed?: boolean;
};

export const quizQuestions: QuizQuestion[] = [
  { id: 1, text: 'I enjoy exploring new ideas and concepts', category: 'openness', scale: 5 },
  { id: 2, text: 'I am organized and pay attention to details', category: 'conscientiousness', scale: 5 },
  { id: 3, text: 'I feel energized when around other people', category: 'extraversion', scale: 5 },
  { id: 4, text: 'I have difficulty focusing on one task for extended periods', category: 'adhd', scale: 5 },
  { id: 5, text: 'I prefer routines and find changes stressful', category: 'asd', scale: 5 },
  { id: 6, text: 'I often worry about things that might go wrong', category: 'neuroticism', scale: 5 },
  { id: 7, text: 'I enjoy helping others even when it inconveniences me', category: 'agreeableness', scale: 5 },
  { id: 8, text: 'Background music helps me concentrate on work', category: 'music_preference', scale: 5 },
  { id: 9, text: 'I appreciate art, poetry, and abstract thinking', category: 'openness', scale: 5 },
  { id: 10, text: 'I often act on impulse without thinking ahead', category: 'conscientiousness', scale: 5, reversed: true },
  { id: 11, text: 'I prefer working alone rather than in groups', category: 'extraversion', scale: 5, reversed: true },
  { id: 12, text: 'I lose track of time when deeply engaged in activities', category: 'adhd', scale: 5 },
  { id: 13, text: 'I notice small details that others might miss', category: 'asd', scale: 5 },
  { id: 14, text: 'I remain calm under pressure', category: 'neuroticism', scale: 5, reversed: true },
  { id: 15, text: 'I trust others easily and assume good intentions', category: 'agreeableness', scale: 5 },
  { id: 16, text: 'Silence or ambient noise is better for focus than music', category: 'music_preference', scale: 5, reversed: true },
  { id: 17, text: 'I enjoy philosophical discussions and "what if" scenarios', category: 'openness', scale: 5 },
  { id: 18, text: 'I fidget or need to move frequently when sitting', category: 'adhd', scale: 5 },
  { id: 19, text: 'I find social cues and body language difficult to interpret', category: 'asd', scale: 5 },
  { id: 20, text: 'I often feel overwhelmed by emotions', category: 'neuroticism', scale: 5 },
  { id: 21, text: 'I prioritize others\' needs over my own', category: 'agreeableness', scale: 5 },
];

export type QuizResults = {
  ocean: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  };
  adhd_indicator: number;
  asd_indicator: number;
  prefers_music: boolean;
  brain_type: string;
  energy_preference: 'low' | 'medium' | 'high';
};

export function calculateQuizResults(responses: Record<number, number>): QuizResults {
  const scores = {
    openness: [] as number[],
    conscientiousness: [] as number[],
    extraversion: [] as number[],
    agreeableness: [] as number[],
    neuroticism: [] as number[],
    adhd: [] as number[],
    asd: [] as number[],
    music_preference: [] as number[],
  };

  quizQuestions.forEach(question => {
    const response = responses[question.id];
    if (response !== undefined) {
      let score = response;
      if (question.reversed) {
        score = question.scale + 1 - response;
      }
      scores[question.category].push(score);
    }
  });

  const average = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 50;
  const toPercentage = (val: number, scale: number) => Math.round((val / scale) * 100);

  const ocean = {
    openness: toPercentage(average(scores.openness), 5),
    conscientiousness: toPercentage(average(scores.conscientiousness), 5),
    extraversion: toPercentage(average(scores.extraversion), 5),
    agreeableness: toPercentage(average(scores.agreeableness), 5),
    neuroticism: toPercentage(average(scores.neuroticism), 5),
  };

  const adhd_indicator = toPercentage(average(scores.adhd), 5);
  const asd_indicator = toPercentage(average(scores.asd), 5);
  const music_pref_score = average(scores.music_preference);
  const prefers_music = music_pref_score >= 3;

  const brain_type = determineBrainType(ocean, adhd_indicator, asd_indicator);
  const energy_preference = determineEnergyPreference(ocean, adhd_indicator);

  return {
    ocean,
    adhd_indicator,
    asd_indicator,
    prefers_music,
    brain_type,
    energy_preference,
  };
}

function determineBrainType(
  ocean: QuizResults['ocean'],
  adhd: number,
  asd: number
): string {
  if (adhd > 60 && ocean.openness > 60) return 'divergent_explorer';
  if (adhd > 60 && ocean.conscientiousness < 40) return 'spontaneous_creator';
  if (asd > 60 && ocean.conscientiousness > 60) return 'systematic_analyzer';
  if (asd > 60 && ocean.openness > 60) return 'pattern_seeker';
  if (ocean.openness > 70) return 'creative_innovator';
  if (ocean.conscientiousness > 70) return 'structured_achiever';
  if (ocean.extraversion > 70) return 'social_energizer';
  if (ocean.extraversion < 30 && ocean.openness > 60) return 'introspective_thinker';
  if (ocean.neuroticism > 60) return 'sensitive_processor';
  return 'balanced_generalist';
}

function determineEnergyPreference(
  ocean: QuizResults['ocean'],
  adhd: number
): 'low' | 'medium' | 'high' {
  if (adhd > 60 || ocean.extraversion > 70) return 'high';
  if (ocean.neuroticism > 60 || ocean.openness > 70) return 'medium';
  return 'low';
}

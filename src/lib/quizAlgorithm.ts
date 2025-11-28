type OceanScores = {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
};

type QuizResponses = Record<string, number | string>;

type ChannelFamily = {
  channels: string[];
  base_weight: string;
  description: string;
};

type ChannelFamilies = Record<string, ChannelFamily>;

export function calculateOceanScores(responses: QuizResponses): OceanScores {
  const reverseScore = (score: number) => 8 - score;

  const tipi1 = responses.tipi_1 as number || 4;
  const tipi2 = responses.tipi_2 as number || 4;
  const tipi3 = responses.tipi_3 as number || 4;
  const tipi4 = responses.tipi_4 as number || 4;
  const tipi5 = responses.tipi_5 as number || 4;
  const tipi6 = responses.tipi_6 as number || 4;
  const tipi7 = responses.tipi_7 as number || 4;
  const tipi8 = responses.tipi_8 as number || 4;
  const tipi9 = responses.tipi_9 as number || 4;
  const tipi10 = responses.tipi_10 as number || 4;

  const extraversion = (tipi1 + reverseScore(tipi6)) / 2;
  const agreeableness = (tipi7 + reverseScore(tipi2)) / 2;
  const conscientiousness = (tipi3 + reverseScore(tipi8)) / 2;
  const neuroticism = (reverseScore(tipi9) + tipi4) / 2;
  const openness = (tipi5 + reverseScore(tipi10)) / 2;

  return {
    extraversion: extraversion / 7,
    agreeableness: agreeableness / 7,
    conscientiousness: conscientiousness / 7,
    neuroticism: neuroticism / 7,
    openness: openness / 7,
  };
}

export function calculateFamilyWeights(
  ocean: OceanScores,
  responses: QuizResponses,
  channelFamilies: ChannelFamilies,
  preferenceModifiers: any
): Record<string, number> {
  const E = ocean.extraversion;
  const A = ocean.agreeableness;
  const C = ocean.conscientiousness;
  const N = ocean.neuroticism;
  const O = ocean.openness;

  const weights: Record<string, number> = {};

  for (const [familyName, family] of Object.entries(channelFamilies)) {
    let weight = 0;
    const formula = family.base_weight;

    weight = eval(formula.replace(/E/g, String(E))
      .replace(/A/g, String(A))
      .replace(/C/g, String(C))
      .replace(/N/g, String(N))
      .replace(/O/g, String(O)));

    weights[familyName] = Math.max(0, weight);
  }

  const soundPref = responses.avatar_1 as string;
  if (soundPref && preferenceModifiers.sound_preference[soundPref]) {
    const modifiers = preferenceModifiers.sound_preference[soundPref];
    for (const [family, modifier] of Object.entries(modifiers)) {
      weights[family] = (weights[family] || 0) + (modifier as number);
    }
  }

  const stimulantLevel = responses.avatar_2 as string;
  if ((stimulantLevel === 'medium' || stimulantLevel === 'lot') && preferenceModifiers.adhd_score) {
    const effect = preferenceModifiers.adhd_score.effect;
    for (const [family, modifier] of Object.entries(effect)) {
      weights[family] = (weights[family] || 0) + (modifier as number);
    }
  }

  const age = responses.context_1 as string;
  if ((age === '50_plus' || age === '40s') && preferenceModifiers.age_nudge?.['50_plus']) {
    const nudges = preferenceModifiers.age_nudge['50_plus'];
    for (const [family, modifier] of Object.entries(nudges)) {
      weights[family] = (weights[family] || 0) + (modifier as number);
    }
  }

  const workSetting = responses.context_2 as string;
  if (workSetting && preferenceModifiers.work_setting?.[workSetting]) {
    const modifiers = preferenceModifiers.work_setting[workSetting];
    for (const [family, modifier] of Object.entries(modifiers)) {
      weights[family] = (weights[family] || 0) + (modifier as number);
    }
  }

  const focusDuration = responses.focus_duration as string;
  if (focusDuration && preferenceModifiers.focus_duration[focusDuration]) {
    const modifiers = preferenceModifiers.focus_duration[focusDuration];
    for (const [family, modifier] of Object.entries(modifiers)) {
      weights[family] = (weights[family] || 0) + (modifier as number);
    }
  }

  const currentActivity = responses.current_activity as string;
  if (currentActivity && preferenceModifiers.current_activity[currentActivity]) {
    const modifiers = preferenceModifiers.current_activity[currentActivity];
    for (const [family, modifier] of Object.entries(modifiers)) {
      weights[family] = (weights[family] || 0) + (modifier as number);
    }
  }

  const bestFocusTime = responses.best_focus_time as string;
  if (bestFocusTime && preferenceModifiers.best_focus_time[bestFocusTime]) {
    const modifiers = preferenceModifiers.best_focus_time[bestFocusTime];
    for (const [family, modifier] of Object.entries(modifiers)) {
      weights[family] = (weights[family] || 0) + (modifier as number);
    }
  }

  const musicFrequency = responses.music_frequency as string;
  if (musicFrequency && preferenceModifiers.music_frequency[musicFrequency]) {
    const modifiers = preferenceModifiers.music_frequency[musicFrequency];
    if (modifiers.all) {
      for (const family of Object.keys(weights)) {
        weights[family] = weights[family] + modifiers.all;
      }
    } else {
      for (const [family, modifier] of Object.entries(modifiers)) {
        weights[family] = (weights[family] || 0) + (modifier as number);
      }
    }
  }

  const focusPreference = responses.focus_preference as string;
  if (focusPreference && preferenceModifiers.focus_preference[focusPreference]) {
    const modifiers = preferenceModifiers.focus_preference[focusPreference];
    for (const [family, modifier] of Object.entries(modifiers)) {
      weights[family] = (weights[family] || 0) + (modifier as number);
    }
  }

  return weights;
}

export function selectTopChannels(
  weights: Record<string, number>,
  channelFamilies: ChannelFamilies,
  availableChannels: Array<{ channel_name: string; id: string }>
): Array<{ channel_id: string; channel_name: string; family: string; weight: number }> {
  const sortedFamilies = Object.entries(weights)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  const recommendations = sortedFamilies.map(([familyName, weight]) => {
    const family = channelFamilies[familyName];
    const familyChannelNames = family.channels;

    const availableFamilyChannels = availableChannels.filter(ch =>
      familyChannelNames.includes(ch.channel_name)
    );

    if (availableFamilyChannels.length === 0) {
      return null;
    }

    const randomChannel = availableFamilyChannels[
      Math.floor(Math.random() * availableFamilyChannels.length)
    ];

    return {
      channel_id: randomChannel.id,
      channel_name: randomChannel.channel_name,
      family: familyName,
      weight: weight
    };
  }).filter(Boolean) as Array<{ channel_id: string; channel_name: string; family: string; weight: number }>;

  return recommendations;
}

export function calculateAsdScore(responses: QuizResponses): number {
  let score = 0;

  const soundPref = responses.avatar_1 as string;
  if (soundPref === 'rhythmic_low_emotion') score += 2.0;
  else if (soundPref === 'melodic_emotional') score += 0;

  const noMelodyPref = (responses.no_melody_pref as number) || 3;
  if (noMelodyPref === 5) score += 1.0;
  else if (noMelodyPref === 4) score += 0.5;
  else if (noMelodyPref <= 2) score += 0;

  return score;
}

export function getAdhdIndicator(responses: QuizResponses): number {
  const stimulantLevel = responses.avatar_2 as string;

  const levelMap: Record<string, number> = {
    'none': 0,
    'little': 33,
    'medium': 66,
    'lot': 100
  };

  return levelMap[stimulantLevel] || 50;
}

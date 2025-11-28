export type BrainType =
  | 'explorer'
  | 'systematic_executor'
  | 'focused_builder'
  | 'collaborator'
  | 'worrier'
  | 'dabbler';

export type BrainTypeProfile = {
  primaryType: BrainType;
  secondaryType?: BrainType;
  scores: {
    explorer: number;
    systematic_executor: number;
    focused_builder: number;
    collaborator: number;
    worrier: number;
    dabbler: number;
  };
};

export type BrainTypeContent = {
  emoji: string;
  title: string;
  headline: string;
  body: string;
  howItHelps: string;
  tips: string[];
  coreStrength: string;
  biggestChallenge: string;
  howFocusHelps: string;
};

export function calculateBrainType(oceanScores: {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}): BrainTypeProfile {
  const { openness: O, conscientiousness: C, extraversion: E, neuroticism: N } = oceanScores;

  // Calculate trait strengths for each type
  const scores = {
    explorer: O >= 0.6 ? O : 0,
    systematic_executor: (O < 0.4 && C >= 0.6) ? (1 - O) * C : 0,
    focused_builder: (C >= 0.6 && O >= 0.6) ? (C + O) / 2 : 0,
    collaborator: E >= 0.6 ? E : 0,
    worrier: N >= 0.6 ? N : 0,
    dabbler: C < 0.4 ? (1 - C) : 0,
  };

  // Calculate raw affinities (without thresholds) for finding secondary traits
  const rawAffinities = {
    explorer: O,
    systematic_executor: (1 - O) * C,
    focused_builder: (C + O) / 2,
    collaborator: E,
    worrier: N,
    dabbler: (1 - C),
  };

  const sortedTypes = Object.entries(scores)
    .sort(([, a], [, b]) => b - a)
    .filter(([, score]) => score > 0);

  const primaryType = (sortedTypes[0]?.[0] || 'explorer') as BrainType;

  // Find secondary by looking at raw affinities, excluding primary
  const sortedAffinities = Object.entries(rawAffinities)
    .filter(([type]) => type !== primaryType)
    .sort(([, a], [, b]) => b - a);

  const secondaryType = sortedAffinities[0] && sortedAffinities[0][1] > 0.3
    ? sortedAffinities[0][0] as BrainType
    : undefined;

  return {
    primaryType,
    secondaryType,
    scores: scores as BrainTypeProfile['scores'],
  };
}

export function getBrainTypeContent(brainType: BrainType): BrainTypeContent {
  const content: Record<BrainType, BrainTypeContent> = {
    explorer: {
      emoji: '🎨',
      title: 'Explorer',
      headline: "You're an Explorer — Creative but Easily Distracted",
      body: "Your imagination is your superpower. You're brimming with ideas, curiosity, and energy — but that same creativity can scatter your attention. You start projects with enthusiasm, but shiny new distractions or \"just a quick peek\" at social media can pull you off course.",
      howItHelps: "Our music channels give your mind gentle boundaries, so you can dive into flow without losing your spark. They help you capture your creative bursts and translate them into finished work.",
      tips: [
        "Choose stimulating, inspiring channels (e.g., Cinematic, The Deep)",
        "Work in 45–60 minute focus sessions — long enough for depth, short enough to keep boredom at bay",
        "Keep a notepad handy to \"park\" stray ideas instead of chasing them mid-task"
      ],
      coreStrength: "Creative, curious, full of ideas",
      biggestChallenge: "Distracted by novelty & shiny objects",
      howFocusHelps: "Channels creative energy into finished work"
    },
    systematic_executor: {
      emoji: '📊',
      title: 'Systematic Executor',
      headline: "You're a Systematic Executor — Reliable but Noise-Sensitive",
      body: "You get things done. You thrive on structure, routine, and ticking boxes off your to-do list. But when the environment gets noisy or chaotic — chatter, interruptions, or even repetitive sounds — your focus evaporates.",
      howItHelps: "Think of focus.music as your productivity shield. It blocks out distractions and creates a steady audio backdrop, helping you maintain flow and finish tasks without frustration.",
      tips: [
        "Try minimal, structured channels (e.g., Zen Piano, Baroque Piano)",
        "Use longer sessions (75–90 minutes) to match your methodical rhythm",
        "Pair your music with clear, bite-sized task lists for maximum focus"
      ],
      coreStrength: "Organized, dependable, detail-focused",
      biggestChallenge: "Noise & interruptions break concentration",
      howFocusHelps: "Provides a noise shield & structured rhythm"
    },
    focused_builder: {
      emoji: '🚀',
      title: 'Focused Builder',
      headline: "You're a Focused Builder — Ambitious but Overloaded",
      body: "You're a powerhouse of drive and vision. You juggle multiple projects, often wearing many hats — leader, creator, strategist. But with so many competing priorities, it's easy to feel stretched thin or lose momentum jumping between tasks.",
      howItHelps: "Our music helps you zero in on what matters most right now. It anchors you in a single project, keeping you from drifting into overwhelm.",
      tips: [
        "Use strong, energizing channels (e.g., Uptempo, The Drop)",
        "Work in defined 60–75 minute \"sprints\" with short resets to re-prioritize",
        "Before each session, write down one key outcome — then let the music carry you there"
      ],
      coreStrength: "Ambitious, visionary, disciplined",
      biggestChallenge: "Juggling too many projects at once",
      howFocusHelps: "Anchors focus on one priority at a time"
    },
    collaborator: {
      emoji: '🗣️',
      title: 'Collaborator',
      headline: "You're a Collaborator — Social but Overstimulated",
      body: "You thrive on interaction, teamwork, and people energy. But in open offices or group settings, constant chatter and interruptions can derail your focus. Even with headphones on, you can feel pulled into every conversation.",
      howItHelps: "Our music helps you create a personal \"bubble\" in busy environments. It sends a subtle \"do not disturb\" signal while giving your brain a calmer, steadier rhythm for deep work.",
      tips: [
        "Use steady, immersive channels (e.g., Ambient, Tranquility)",
        "Try shorter, 25–40 minute sessions when you're surrounded by others",
        "Use music as a polite boundary — let coworkers know headphones mean you're in focus mode"
      ],
      coreStrength: "Social, energetic, team-driven",
      biggestChallenge: "Overstimulated in busy environments",
      howFocusHelps: "Creates a personal focus bubble in noisy spaces"
    },
    worrier: {
      emoji: '🌧️',
      title: 'Worrier',
      headline: "You're a Worrier — Sensitive but Resilient with Support",
      body: "You feel things deeply. Stress, anxiety, or perfectionism can make it hard to start or stay on task. Procrastination often sneaks in, not from laziness, but as a way to soothe overwhelm. Yet when you do focus, your work is thoughtful and meaningful.",
      howItHelps: "Our music is like an emotional anchor — calming restless thoughts while helping you gently stay with your task. It can transform anxious energy into steady progress.",
      tips: [
        "Choose calming, low-arousal channels (e.g., Zen Piano, Ambient Focus)",
        "Work in 25–40 minute \"safe sprints\" to reduce pressure",
        "Use music as a ritual: same playlist, same start time, to cue your brain into flow"
      ],
      coreStrength: "Sensitive, thoughtful, caring",
      biggestChallenge: "Stress, anxiety, procrastination",
      howFocusHelps: "Calms nerves & stabilizes attention"
    },
    dabbler: {
      emoji: '🎭',
      title: 'Dabbler',
      headline: "You're a Dabbler — Spontaneous but Easily Distracted",
      body: "You love variety and flexibility. Rigid schedules aren't your thing — but that spontaneity can leave you bouncing between tasks, half-finished projects, or endless browser tabs. Getting started is often the hardest part.",
      howItHelps: "Our music works like a gentle nudge, giving you the momentum to begin and the stamina to stick with it just a little longer than you otherwise would.",
      tips: [
        "Pick motivating, upbeat channels (e.g., Uptempo, NatureBeat)",
        "Use the built-in timer — commit to just 25 minutes and see where it takes you",
        "Treat focus like exercise: short, consistent reps beat occasional marathons"
      ],
      coreStrength: "Flexible, spontaneous, adaptable",
      biggestChallenge: "Struggles with starting & sticking to tasks",
      howFocusHelps: "Provides momentum and gentle accountability"
    }
  };

  return content[brainType];
}

export function getAllBrainTypeComparison(): Array<{
  type: BrainType;
  emoji: string;
  title: string;
  coreStrength: string;
  biggestChallenge: string;
  howFocusHelps: string;
}> {
  const types: BrainType[] = [
    'explorer',
    'systematic_executor',
    'focused_builder',
    'collaborator',
    'worrier',
    'dabbler'
  ];

  return types.map(type => {
    const content = getBrainTypeContent(type);
    return {
      type,
      emoji: content.emoji,
      title: content.title,
      coreStrength: content.coreStrength,
      biggestChallenge: content.biggestChallenge,
      howFocusHelps: content.howFocusHelps
    };
  });
}

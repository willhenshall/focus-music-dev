import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { calculateOceanScores, calculateFamilyWeights, selectTopChannels, calculateAsdScore, getAdhdIndicator } from '../lib/quizAlgorithm';
import { calculateBrainType, BrainType } from '../lib/brainTypeCalculator';

type QuizQuestion = {
  id: string;
  question_order: number;
  question_type: 'single_select' | 'likert_1_5' | 'likert_1_7';
  question_text: string;
  options: Array<{ value: string; label: string }>;
  reverse_scored: boolean;
};

type TopChannel = {
  channel_id: string;
  channel_name: string;
  family: string;
  weight: number;
};

type OnboardingQuizProps = {
  onComplete: (
    topChannels?: TopChannel[],
    brainType?: { primary: BrainType; secondary?: BrainType; secondaryScore?: number },
    cognitiveProfile?: { adhdIndicator: number; asdScore: number; stimulantLevel: string },
    responses?: Record<string, number | string>
  ) => void;
  isAnonymous?: boolean;
  onLogoClick?: () => void;
};

export function OnboardingQuiz({ onComplete, isAnonymous = false, onLogoClick }: OnboardingQuizProps) {
  const { user, refreshProfile } = useAuth();
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [channels, setChannels] = useState<Array<{ id: string; channel_name: string }>>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [responses, setResponses] = useState<Record<string, number | string>>({});
  const [startTime, setStartTime] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadQuizData();
  }, []);

  const loadQuizData = async () => {
    try {
      const { data: questionsData, error: questionsError } = await supabase
        .from('quiz_questions')
        .select('*')
        .order('question_order');

      const { data: configData, error: configError } = await supabase
        .from('quiz_config')
        .select('*')
        .eq('is_active', true)
        .single();

      const { data: channelsData, error: channelsError } = await supabase
        .from('audio_channels')
        .select('id, channel_name');


      if (questionsData) setQuestions(questionsData);
      if (configData) setConfig(configData);
      if (channelsData) setChannels(channelsData);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  if (loading || questions.length === 0 || !config) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <header className="fixed top-0 left-0 right-0 z-50 h-20 bg-white/80 backdrop-blur-sm border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center">
            <button
              onClick={onLogoClick}
              className="hover:opacity-80 transition-opacity"
            >
              <span className="text-2xl text-slate-900">
                <span className="font-bold">focus</span>.music
              </span>
            </button>
          </div>
        </header>

        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
            <p className="mt-4 text-slate-600">Loading quiz...</p>
          </div>
        </div>
      </div>
    );
  }

  const question = questions[currentQuestion];
  const progress = ((currentQuestion + 1) / questions.length) * 100;

  const handleBack = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    } else {
      // On first question, go back to the page they came from
      if (onLogoClick) {
        onLogoClick();
      }
    }
  };

  const handleResponse = async (value: number | string) => {
    const responseTime = startTime[question.id]
      ? Date.now() - startTime[question.id]
      : 0;

    if (!isAnonymous && user) {
      await supabase.from('quiz_responses').insert({
        user_id: user.id,
        question_number: question.question_order,
        response_value: typeof value === 'number' ? value : 0,
        response_time_ms: responseTime,
      });
    }

    const newResponses = { ...responses, [question.id]: value };
    setResponses(newResponses);

    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
      setStartTime({ ...startTime, [questions[currentQuestion + 1].id]: Date.now() });
    } else {
      await submitQuiz(newResponses);
    }
  };

  const submitQuiz = async (finalResponses: Record<string, number | string>) => {
    setIsSubmitting(true);

    const oceanScores = calculateOceanScores(finalResponses);

    const familyWeights = calculateFamilyWeights(
      oceanScores,
      finalResponses,
      config.channel_mapping.channel_families,
      config.scoring_logic.preference_modifiers
    );

    const topChannels = selectTopChannels(
      familyWeights,
      config.channel_mapping.channel_families,
      channels
    );


    const asdScore = calculateAsdScore(finalResponses);
    const adhdIndicator = getAdhdIndicator(finalResponses);
    const stimulantLevel = finalResponses.avatar_2 as string;

    const brainTypeProfile = calculateBrainType(oceanScores);
    const secondaryScore = brainTypeProfile.secondaryType
      ? brainTypeProfile.scores[brainTypeProfile.secondaryType]
      : undefined;

    const brainTypeData = {
      primary: brainTypeProfile.primaryType,
      secondary: brainTypeProfile.secondaryType,
      secondaryScore,
    };

    const cognitiveProfile = {
      adhdIndicator,
      asdScore,
      stimulantLevel
    };

    if (isAnonymous) {
      localStorage.setItem('quiz_results', JSON.stringify({
        responses: finalResponses,
        ocean_scores: oceanScores,
        recommended_channels: topChannels,
        brain_type_primary: brainTypeProfile.primaryType,
        brain_type_secondary: brainTypeProfile.secondaryType,
        brain_type_scores: brainTypeProfile.scores,
        asd_score: asdScore,
        adhd_indicator: adhdIndicator,
        preferred_stimulant_level: stimulantLevel,
        quiz_version: config.version,
      }));
      onComplete(topChannels, brainTypeData, cognitiveProfile, finalResponses);
      return;
    }

    if (!user) return;

    // Check if user has existing quiz results (retaking quiz)
    const { data: existingResults } = await supabase
      .from('quiz_results')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingResults) {
      // Deactivate old channel recommendations (don't delete - keep history)
      const { error: deactivateError } = await supabase
        .from('channel_recommendations')
        .update({ is_active: false })
        .eq('user_id', user.id);

      if (deactivateError) {
      } else {
      }

      // Delete old quiz results
      await supabase
        .from('quiz_results')
        .delete()
        .eq('user_id', user.id);
    }

    // Insert new quiz results
    await supabase.from('quiz_results').insert({
      user_id: user.id,
      quiz_version: config.version,
      responses: finalResponses,
      ocean_scores: oceanScores,
      recommended_channels: topChannels,
      brain_type_primary: brainTypeProfile.primaryType,
      brain_type_secondary: brainTypeProfile.secondaryType,
      brain_type_scores: brainTypeProfile.scores,
      adhd_indicator: adhdIndicator,
      asd_score: asdScore,
      preferred_stimulant_level: stimulantLevel,
    });

    // Determine recommended energy level
    const recommendedEnergyLevel = oceanScores.extraversion > 0.7 || stimulantLevel === 'lot' || stimulantLevel === 'medium' ? 'high' :
                          oceanScores.neuroticism > 0.6 ? 'medium' : 'low';

    // Update user profile
    await supabase
      .from('user_profiles')
      .update({
        ocean_openness: Math.round(oceanScores.openness * 100),
        ocean_conscientiousness: Math.round(oceanScores.conscientiousness * 100),
        ocean_extraversion: Math.round(oceanScores.extraversion * 100),
        ocean_agreeableness: Math.round(oceanScores.agreeableness * 100),
        ocean_neuroticism: Math.round(oceanScores.neuroticism * 100),
        adhd_indicator: adhdIndicator,
        asd_indicator: Math.round((asdScore / 2.5) * 100),
        prefers_music: true,
        energy_preference: recommendedEnergyLevel,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    // Insert new channel recommendations
    for (const channel of topChannels) {
      const { error: insertError } = await supabase.from('channel_recommendations').insert({
        user_id: user.id,
        channel_id: channel.channel_id,
        confidence_score: channel.weight / Math.max(...topChannels.map(c => c.weight)),
        reasoning: `Recommended based on ${channel.family} preference`,
        recommended_energy_level: recommendedEnergyLevel,
        is_active: true,
      });

      if (insertError) {
      } else {
      }
    }

    await refreshProfile();
    setIsSubmitting(false);
    onComplete(topChannels, brainTypeData, cognitiveProfile, finalResponses);
  };

  if (!startTime[question.id]) {
    setStartTime({ ...startTime, [question.id]: Date.now() });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 pb-24">
      <header className="fixed top-0 left-0 right-0 z-50 h-20 bg-white/80 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center">
          <button
            onClick={onLogoClick}
            className="hover:opacity-80 transition-opacity"
          >
            <span className="text-2xl text-slate-900">
              <span className="font-bold">focus</span>.music
            </span>
          </button>
        </div>
      </header>

      <div className="max-w-2xl w-full mx-auto pt-24">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <button
            onClick={handleBack}
            disabled={isSubmitting}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors mb-6 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowLeft size={20} />
            <span className="font-medium">Back</span>
          </button>
          <div className="mb-8" data-testid="quiz-progress">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-slate-600">
                Question {currentQuestion + 1} of {questions.length}
              </span>
              <span className="text-sm font-medium text-slate-600">
                {Math.round(progress)}%
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <h2 className="text-2xl font-semibold text-slate-900 mb-8" data-testid="quiz-question">
            {question.question_text}
          </h2>

          <div className="space-y-3">
            {question.question_type === 'single_select' ? (
              question.options.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleResponse(option.value)}
                  disabled={isSubmitting}
                  data-testid="quiz-option"
                  className="w-full p-4 text-left rounded-xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="text-slate-700 font-medium">{option.label}</span>
                </button>
              ))
            ) : question.question_type === 'likert_1_7' ? (
              [1, 2, 3, 4, 5, 6, 7].map((value) => (
                <button
                  key={value}
                  onClick={() => handleResponse(value)}
                  disabled={isSubmitting}
                  data-testid="quiz-option"
                  className="w-full p-4 text-left rounded-xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="text-slate-700 font-medium">
                    {value === 1 && 'Strongly Disagree'}
                    {value === 2 && 'Disagree'}
                    {value === 3 && 'Somewhat Disagree'}
                    {value === 4 && 'Neutral'}
                    {value === 5 && 'Somewhat Agree'}
                    {value === 6 && 'Agree'}
                    {value === 7 && 'Strongly Agree'}
                  </span>
                </button>
              ))
            ) : (
              [1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  onClick={() => handleResponse(value)}
                  disabled={isSubmitting}
                  data-testid="quiz-option"
                  className="w-full p-4 text-left rounded-xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="text-slate-700 font-medium">
                    {value === 1 && 'Strongly Disagree'}
                    {value === 2 && 'Disagree'}
                    {value === 3 && 'Neutral'}
                    {value === 4 && 'Agree'}
                    {value === 5 && 'Strongly Agree'}
                  </span>
                </button>
              ))
            )}
          </div>

          {isSubmitting && (
            <div className="mt-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" />
              <p className="mt-4 text-slate-600">Analyzing your responses...</p>
            </div>
          )}
        </div>

        <div className="mt-6 text-center text-sm text-slate-500">
          <p>Your responses help us personalize your focus music experience</p>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { BrainTypeProfile } from './BrainTypeProfile';
import { BrainType } from '../lib/brainTypeCalculator';

type Channel = {
  id: string;
  channel_name: string;
  image_url: string | null;
  description: string | null;
};

type QuizResultsPageProps = {
  topChannelIds: string[];
  brainType?: {
    primary: BrainType;
    secondary?: BrainType;
    secondaryScore?: number;
  };
  cognitiveProfile?: {
    adhdIndicator: number;
    asdScore: number;
    stimulantLevel: string;
  };
  onStartTrial: () => void;
  onSignIn?: () => void;
  onLogoClick?: () => void;
  quizResponses?: Record<string, number | string>;
};

export function QuizResultsPage({ topChannelIds, brainType, cognitiveProfile, onStartTrial, onSignIn, onLogoClick, quizResponses }: QuizResultsPageProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const prefersCompleteSilence = quizResponses?.focus_preference === 'complete_silence';

  useEffect(() => {
    loadChannels();
  }, [topChannelIds]);

  const loadChannels = async () => {
    try {
      const { data, error } = await supabase
        .from('audio_channels')
        .select('id, channel_name, image_url, description')
        .in('id', topChannelIds);

      if (error) {
      }

      if (data) {
        const orderedChannels = topChannelIds
          .map(id => data.find(ch => ch.id === id))
          .filter(Boolean) as Channel[];
        setChannels(orderedChannels);
      }
    } catch (err) {
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
          <p className="mt-4 text-slate-600">Loading your results...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 pb-24">
      <header className="fixed top-0 left-0 right-0 z-50 h-20 bg-white/80 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between">
          <button
            onClick={onLogoClick}
            className="hover:opacity-80 transition-opacity"
          >
            <span className="text-2xl text-slate-900">
              <span className="font-bold">focus</span>.music
            </span>
          </button>
          <div className="flex gap-3">
            {onSignIn && (
              <button
                onClick={onSignIn}
                className="px-6 py-2 text-slate-700 hover:text-slate-900 transition-colors"
              >
                Sign In
              </button>
            )}
            <button
              onClick={onStartTrial}
              className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors"
            >
              Start 7-Day Free Trial
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto pt-24">
        {brainType && (
          <div className="mb-12">
            <BrainTypeProfile
              primaryType={brainType.primary}
              secondaryType={brainType.secondary}
              secondaryScore={brainType.secondaryScore}
              channels={channels}
              adhdIndicator={cognitiveProfile?.adhdIndicator}
              asdScore={cognitiveProfile?.asdScore}
              stimulantLevel={cognitiveProfile?.stimulantLevel}
              onSignUp={onStartTrial}
              prefersCompleteSilence={prefersCompleteSilence}
            />
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg p-8 border border-slate-200 text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            Ready to Experience Your Perfect Focus Music?
          </h2>
          <p className="text-base text-slate-600 mb-6 max-w-2xl mx-auto">
            Get instant access to your personalized channels, 8,600+ scientifically-designed tracks, unlock your peak productivity, and find out more about your extended focus profile.
          </p>
          <button
            onClick={onStartTrial}
            className="px-8 py-4 bg-blue-500 hover:bg-blue-600 text-white text-lg font-semibold rounded-xl transition-colors"
          >
            Start 7-Day Free Trial
          </button>
          <p className="text-sm text-slate-500 mt-4">
            No credit card required during trial
          </p>
        </div>
      </div>
    </div>
  );
}

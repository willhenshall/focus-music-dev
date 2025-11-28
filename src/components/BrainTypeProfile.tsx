import { useState, useEffect, useRef } from 'react';
import { Play, Pause } from 'lucide-react';
import { BrainType, BrainTypeContent, getBrainTypeContent, getAllBrainTypeComparison } from '../lib/brainTypeCalculator';
import { CognitiveProfiles } from './CognitiveProfiles';
import { AudioTrack } from '../lib/supabase';
import { getPreviewTracks } from '../lib/previewService';

type Channel = {
  id: string;
  channel_name: string;
  image_url: string | null;
  description: string | null;
};

type BrainTypeProfileProps = {
  primaryType: BrainType;
  secondaryType?: BrainType;
  secondaryScore?: number;
  channels?: Channel[];
  adhdIndicator?: number;
  asdScore?: number;
  stimulantLevel?: string;
  onSignUp?: () => void;
  prefersCompleteSilence?: boolean;
};

export function BrainTypeProfile({ primaryType, secondaryType, secondaryScore, channels, adhdIndicator, asdScore, stimulantLevel, onSignUp, prefersCompleteSilence }: BrainTypeProfileProps) {
  const content = getBrainTypeContent(primaryType);
  const secondaryContent = secondaryType ? getBrainTypeContent(secondaryType) : null;
  const comparison = getAllBrainTypeComparison();

  const [previewTracks, setPreviewTracks] = useState<Record<string, AudioTrack>>({});
  const [playingChannelId, setPlayingChannelId] = useState<string | null>(null);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (channels && channels.length > 0) {
      loadPreviewTracks();
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [channels]);

  const loadPreviewTracks = async () => {
    if (!channels) return;
    const channelIds = channels.map(ch => ch.id);
    const tracks = await getPreviewTracks(channelIds);
    setPreviewTracks(tracks);
  };

  const handlePreviewToggle = async (channelId: string) => {
    const track = previewTracks[channelId];
    if (!track) {
      alert('No preview track available for this channel yet.');
      return;
    }

    if (playingChannelId === channelId) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingChannelId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    setLoading({ ...loading, [channelId]: true });

    // Check if file_path is already a full URL or just a path
    const audioUrl = track.file_path.startsWith('http')
      ? track.file_path
      : `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/audio-files/${track.file_path}`;


    const audio = new Audio(audioUrl);

    audio.oncanplaythrough = () => {
      setLoading({ ...loading, [channelId]: false });
      audio.play().catch(err => {
        alert('Failed to play preview track.');
        setPlayingChannelId(null);
      });
      setPlayingChannelId(channelId);
    };

    audio.onerror = (e) => {
      setLoading({ ...loading, [channelId]: false });
      alert('Failed to load preview track. The audio file may not be accessible.');
    };

    audio.onended = () => {
      setPlayingChannelId(null);
    };

    audioRef.current = audio;
  };

  const getSecondaryText = (score?: number) => {
    if (!score) return 'You also show some qualities of';
    if (score >= 0.7) return 'You also show qualities of';
    if (score >= 0.55) return 'You also show some qualities of';
    return 'You also show light qualities of';
  };

  const getArticle = (typeName: string) => {
    const vowels = ['a', 'e', 'i', 'o', 'u'];
    return vowels.includes(typeName.toLowerCase()[0]) ? 'an' : 'a';
  };

  const secondaryText = secondaryType ? getSecondaryText(secondaryScore) : null;

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-2xl shadow-lg p-8 border border-slate-200">
        <div className="flex items-start gap-4 mb-6">
          <div className="text-6xl">{content.emoji}</div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-blue-600 uppercase tracking-wide mb-2">
              Your Focus Profile Brain Type
            </div>
            <h2 className="text-3xl font-bold text-slate-900 mb-2">
              {content.headline}
            </h2>
          </div>
        </div>

        <div className="prose prose-slate max-w-none">
          <p className="text-base text-slate-700 leading-relaxed mb-6">
            {content.body}
            {secondaryContent && onSignUp ? (
              <span>
                {' '}<button onClick={onSignUp} className="text-blue-600 hover:text-blue-700 underline font-medium">More info...</button>
              </span>
            ) : secondaryContent && secondaryText ? (
              <span className="text-slate-600">
                {' '}{secondaryText} {getArticle(secondaryContent.title)} {secondaryContent.title} Type: {secondaryContent.body.split('.')[0]}.
              </span>
            ) : null}
          </p>


          {/* Top 3 Recommended Channels */}
          {channels && channels.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-slate-900 mb-4">
                Your Personalized Recommendations
              </h3>
              <p className="text-base text-slate-600 mb-4">
                <span className="font-semibold text-blue-600">Personalized for you:</span> These channels are scientifically matched to your cognitive profile to enhance focus and productivity. Our recommendation algorithm is the result of 15 years of in-house research and insights from over 640,000 subscribers.{' '}
                <button onClick={onSignUp} className="text-blue-600 hover:text-blue-700 underline font-medium">View my Profile</button>
              </p>
              {prefersCompleteSilence && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <p className="text-base text-slate-700">
                    Around 30% of people prefer working in quiet environments—just like you. When things get noisy, focus.music can help by gently masking background sounds so you can stay in the zone.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {channels.slice(0, 3).map((channel, index) => {
                  const track = previewTracks[channel.id];
                  const isPlaying = playingChannelId === channel.id;
                  const isLoading = loading[channel.id];

                  return (
                    <div key={channel.id} className="bg-white rounded-2xl shadow-md border-2 border-slate-900 md:border md:border-slate-200 overflow-hidden hover:shadow-lg transition-shadow flex flex-col min-h-[255px] md:min-h-[255px] min-h-[230px]">
                      <div className="relative h-[97px] md:h-[97px] h-[87px]">
                        <div className="absolute top-3 left-3 w-9 h-9 bg-slate-900 rounded-lg flex items-center justify-center text-white font-bold text-base z-10">
                          {index + 1}
                        </div>
                        {channel.image_url ? (
                          <img
                            src={channel.image_url}
                            alt={channel.channel_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300" />
                        )}
                      </div>
                      <div className="flex-grow flex flex-col px-[18px] md:px-[18px] px-4 pt-[18px] md:pt-[18px] pt-4 pb-[22px] md:pb-[22px] pb-[19px] w-full min-w-0">
                        <h4 className="font-bold text-slate-900 leading-tight mb-2 text-lg md:text-lg text-base">
                          {channel.channel_name}
                        </h4>
                        <p className="text-slate-600 leading-relaxed line-clamp-4 text-[13px] md:text-[13px] text-[12px]">
                          {channel.description || 'Scientifically designed focus music'}
                        </p>
                        <div className="mt-2.5">
                          <div className="inline-block px-2.5 py-1 bg-blue-100 text-blue-800 text-[11px] font-semibold rounded-full">
                            Best: {stimulantLevel === 'high' ? 'high' : stimulantLevel === 'low' ? 'low' : 'medium'} energy
                          </div>
                        </div>
                        <div className="mt-2.5">
                          <button
                            onClick={() => handlePreviewToggle(channel.id)}
                            disabled={isLoading}
                            className={`w-full flex items-center justify-center gap-2 py-1.5 px-3.5 rounded-lg text-[13px] font-semibold transition-all ${
                              isPlaying
                                ? 'bg-slate-900 text-white hover:bg-slate-800'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
                            } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {isLoading ? (
                              <>Loading...</>
                            ) : isPlaying ? (
                              <>
                                <Pause size={14} fill="currentColor" />
                                Stop Preview
                              </>
                            ) : (
                              <>
                                <Play size={14} fill="currentColor" />
                                Preview
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {adhdIndicator !== undefined && asdScore !== undefined && stimulantLevel && (
        <CognitiveProfiles
          adhdIndicator={adhdIndicator}
          asdScore={asdScore}
          stimulantLevel={stimulantLevel}
          onSignUp={onSignUp}
        />
      )}

      <div className="bg-white rounded-2xl shadow-lg p-8 border border-slate-200">
        <div className="text-center mb-6">
          <h3 className="text-2xl font-bold text-slate-900 mb-2">
            Focus Brain Types — At a Glance
          </h3>
          <p className="text-base text-slate-600">
            Here's how your focus style compares with others — every profile has strengths and challenges, and focus.music tunes in to yours.{secondaryContent ? " Your secondary trait is also highlighted below." : ""}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-200">
                <th className="py-3 px-4 text-sm font-semibold text-slate-700">Brain Type</th>
                <th className="py-3 px-4 text-sm font-semibold text-slate-700">Core Strength</th>
                <th className="py-3 px-4 text-sm font-semibold text-slate-700">Biggest Challenge</th>
                <th className="py-3 px-4 text-sm font-semibold text-slate-700">How Focus Music Helps</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((type, index) => {
                const isPrimary = type.type === primaryType;
                const isSecondary = type.type === secondaryType;
                return (
                  <tr
                    key={type.type}
                    className={`border-b border-slate-100 transition-colors ${
                      isPrimary
                        ? 'bg-blue-50 font-medium'
                        : isSecondary
                        ? 'bg-slate-50'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{type.emoji}</span>
                        <div>
                          <div className="font-semibold text-slate-900">
                            {type.title}
                            {isPrimary && (
                              <span className="ml-2 text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">
                                You
                              </span>
                            )}
                            {isSecondary && (
                              <span className="ml-2 text-xs bg-slate-400 text-white px-2 py-0.5 rounded-full">
                                Secondary
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-base text-slate-700">
                      {type.coreStrength}
                    </td>
                    <td className="py-4 px-4 text-base text-slate-700">
                      {type.biggestChallenge}
                    </td>
                    <td className="py-4 px-4 text-base text-slate-700">
                      {type.howFocusHelps}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

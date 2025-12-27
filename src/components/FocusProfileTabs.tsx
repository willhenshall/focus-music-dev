import { useState, useEffect, useRef } from 'react';
import { Brain, Radio, TrendingUp, Lightbulb, User, Check } from 'lucide-react';
import { BrainTypeProfile } from './BrainTypeProfile';
import { getBrainTypeContent, getAllBrainTypeComparison } from '../lib/brainTypeCalculator';
import { CognitiveProfiles } from './CognitiveProfiles';
import { useMusicPlayer } from '../contexts/MusicPlayerContext';

type Channel = {
  id: string;
  channel_name: string;
  image_url: string | null;
  description: string | null;
};

type RecommendedChannel = {
  channel_id: string;
  recommended_energy_level?: string;
};

type CognitiveProfile = {
  adhdIndicator?: number;
  asdScore?: number;
  stimulantLevel?: string;
};

type BrainType = {
  primary: string;
  secondary?: string;
  secondaryScore?: number;
};

type Profile = {
  ocean_openness: number;
  ocean_conscientiousness: number;
  ocean_extraversion: number;
  ocean_agreeableness: number;
  ocean_neuroticism: number;
};

type FocusProfileTabsProps = {
  brainType: BrainType | null;
  profile: Profile;
  cognitiveProfile: CognitiveProfile | null;
  recommendedChannels: RecommendedChannel[];
  channels: Channel[];
  getChannelImage: (channelId: string, imageUrl: string | null) => string | null;
};

export function FocusProfileTabs({
  brainType,
  profile,
  cognitiveProfile,
  recommendedChannels,
  channels,
  getChannelImage
}: FocusProfileTabsProps) {
  const [activeSubTab, setActiveSubTab] = useState<'brain-type' | 'channels' | 'traits' | 'tips'>('brain-type');
  const { toggleChannel, setChannelEnergy, activeChannel } = useMusicPlayer();
  const containerRef = useRef<HTMLDivElement>(null);

  // Expose setActiveSubTab to parent via DOM
  useEffect(() => {
    if (containerRef.current) {
      (containerRef.current as any).setActiveSubTab = setActiveSubTab;
    }
  }, []);

  // Update active state of buttons in parent nav
  useEffect(() => {
    const buttons = document.querySelectorAll('[data-sub-tab]');
    buttons.forEach((btn) => {
      const btnElement = btn as HTMLButtonElement;
      const subTab = btnElement.getAttribute('data-sub-tab');
      if (subTab === activeSubTab) {
        btnElement.className = btnElement.className.replace('border-transparent text-slate-600', 'border-blue-600 text-blue-600');
      } else {
        btnElement.className = btnElement.className.replace('border-blue-600 text-blue-600', 'border-transparent text-slate-600');
      }
    });
  }, [activeSubTab]);

  const topChannels = recommendedChannels.slice(0, 3).map(rec => {
    const channel = channels.find(c => c.id === rec.channel_id);
    return channel ? {
      ...channel,
      image_url: getChannelImage(channel.id, channel.image_url),
      recommendedEnergyLevel: rec.recommended_energy_level
    } : null;
  }).filter(Boolean) as any[];

  const brainTypeContent = brainType ? getBrainTypeContent(brainType.primary as any) : null;

  const getFocusTips = () => {
    if (!brainType || !cognitiveProfile) return [];

    const tips = [];

    if (cognitiveProfile.adhdIndicator && cognitiveProfile.adhdIndicator > 60) {
      tips.push({
        title: 'Break Tasks Into Smaller Steps',
        description: 'Your profile suggests you benefit from breaking large tasks into smaller, manageable chunks. Set mini-goals and celebrate small wins.',
        icon: '🎯'
      });
      tips.push({
        title: 'Use Movement Breaks',
        description: 'Take short movement breaks every 25-30 minutes. Physical activity can help reset your attention and improve focus.',
        icon: '🏃'
      });
    }

    if (cognitiveProfile.stimulantLevel === 'high') {
      tips.push({
        title: 'Higher Tempo Music Works Best',
        description: 'Your brain responds well to energetic, upbeat soundscapes. Try channels with higher intensity for optimal focus.',
        icon: '⚡'
      });
    } else if (cognitiveProfile.stimulantLevel === 'low') {
      tips.push({
        title: 'Calm Environments Enhance Focus',
        description: 'You focus best with minimal auditory stimulation. Try ambient sounds or lower-energy channels.',
        icon: '🌊'
      });
    }

    if (profile.ocean_conscientiousness > 70) {
      tips.push({
        title: 'Structure Your Workspace',
        description: 'Your organized nature thrives with a structured environment. Keep your workspace tidy and follow consistent routines.',
        icon: '📋'
      });
    }

    if (profile.ocean_openness > 70) {
      tips.push({
        title: 'Vary Your Focus Environment',
        description: 'Your creative mind benefits from variety. Try different channels and switch up your workspace occasionally.',
        icon: '🎨'
      });
    }

    if (profile.ocean_extraversion < 40) {
      tips.push({
        title: 'Minimize Interruptions',
        description: 'As someone who recharges through quiet time, protect your focus sessions from interruptions.',
        icon: '🔕'
      });
    }

    if (tips.length === 0) {
      tips.push({
        title: 'Stay Consistent',
        description: 'Build a consistent focus routine using your recommended channels. Consistency is key to long-term productivity.',
        icon: '✨'
      });
      tips.push({
        title: 'Experiment and Adapt',
        description: 'Try different channels and intensity levels to discover what works best for your unique needs.',
        icon: '🔬'
      });
    }

    return tips;
  };

  const focusTips = getFocusTips();

  const getSecondaryTraitStrength = (score?: number): 'subtle' | 'moderate' | 'strong' => {
    if (!score) return 'subtle';
    if (score < 0.4) return 'subtle';
    if (score < 0.55) return 'moderate';
    return 'strong';
  };

  const getSecondaryTraitLanguage = (secondaryType: string, strength: 'subtle' | 'moderate' | 'strong'): string => {
    const secondaryContent = getBrainTypeContent(secondaryType as any);
    const typeTitle = secondaryContent.title;

    switch (strength) {
      case 'strong':
        return `You also show strong ${typeTitle} traits, meaning you blend the best of both approaches. This combination gives you a unique edge — you're ${secondaryContent.coreStrength.toLowerCase()} in addition to your primary style.`;
      case 'moderate':
        return `You also lean toward ${typeTitle} tendencies. This secondary trait surfaces in certain situations, adding flexibility to how you work. When it emerges, you tap into being ${secondaryContent.coreStrength.toLowerCase()}.`;
      case 'subtle':
        return `You show hints of ${typeTitle} characteristics as a secondary trait. While subtle, this influence can emerge in specific contexts, allowing you to occasionally draw on being ${secondaryContent.coreStrength.toLowerCase()}.`;
    }
  };

  const getTraitBand = (percentage: number): 'Low' | 'Mid' | 'High' => {
    const normalized = percentage / 100;
    if (normalized <= 0.33) return 'Low';
    if (normalized <= 0.66) return 'Mid';
    return 'High';
  };

  const getOpennessInterpretation = (band: 'Low' | 'Mid' | 'High') => {
    switch (band) {
      case 'High':
        return {
          description: 'You like variety and complex textures',
          musicImplication: 'Varied patterns and rich timbres engage your curiosity'
        };
      case 'Mid':
        return {
          description: 'You appreciate variety while maintaining structure',
          musicImplication: 'Simple patterns enhance concentration'
        };
      case 'Low':
        return {
          description: 'You focus best with familiar, simple textures',
          musicImplication: 'Predictable patterns create comfort and stability'
        };
    }
  };

  const getConscientiousnessInterpretation = (band: 'Low' | 'Mid' | 'High') => {
    switch (band) {
      case 'High':
        return {
          description: 'Structured sound supports your flow',
          musicImplication: 'Regular rhythms match your organized approach'
        };
      case 'Mid':
        return {
          description: 'Balanced structure supports your workflow',
          musicImplication: 'Moderate structure maintains focus without rigidity'
        };
      case 'Low':
        return {
          description: 'Flexible sound supports your spontaneous flow',
          musicImplication: 'Flexible rhythms match adaptability'
        };
    }
  };

  const getExtraversionInterpretation = (band: 'Low' | 'Mid' | 'High') => {
    switch (band) {
      case 'High':
        return {
          description: 'Higher energy keeps you engaged',
          musicImplication: 'Upbeat tempo matches your energy level'
        };
      case 'Mid':
        return {
          description: 'Moderate energy maintains engagement',
          musicImplication: 'Gentler pace supports sustained focus'
        };
      case 'Low':
        return {
          description: 'Calm environments enhance your focus',
          musicImplication: 'Lower energy prevents overstimulation'
        };
    }
  };

  const getAgreeablenessInterpretation = (band: 'Low' | 'Mid' | 'High') => {
    switch (band) {
      case 'High':
        return {
          description: 'Warm, organic textures feel good to you',
          musicImplication: 'Harmonious tones create comfort'
        };
      case 'Mid':
        return {
          description: 'Balanced tones support your focus',
          musicImplication: 'Neutral textures work across contexts'
        };
      case 'Low':
        return {
          description: 'Analytical sound appeals to your logic',
          musicImplication: 'Mechanical patterns support rational thinking'
        };
    }
  };

  const getNeuroticismInterpretation = (band: 'Low' | 'Mid' | 'High') => {
    switch (band) {
      case 'High':
        return {
          description: 'Calmer, steadier sound limits reactivity',
          musicImplication: 'Stable patterns reduce emotional triggers'
        };
      case 'Mid':
        return {
          description: 'Balanced sound maintains emotional equilibrium',
          musicImplication: 'Moderate variation keeps interest without stress'
        };
      case 'Low':
        return {
          description: 'Varied sound keeps you stimulated',
          musicImplication: 'Dynamic changes maintain interest'
        };
    }
  };

  return (
    <div className="space-y-6" ref={containerRef} data-focus-profile-tabs>
      <div>
        {activeSubTab === 'brain-type' && !brainType && (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl shadow-lg p-12 border border-blue-200 text-center">
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="text-6xl mb-4">🧠</div>
              <h2 className="text-3xl font-bold text-slate-900 mb-4">
                Discover Your Focus Profile
              </h2>
              <p className="text-lg text-slate-700 mb-6">
                Take our scientifically-designed quiz to unlock personalized music recommendations tailored to your unique cognitive profile. Learn how your brain works best and get channels matched specifically for you.
              </p>
              <div className="bg-white/50 rounded-lg p-6 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-3xl mb-2">⚡</div>
                    <div className="font-semibold text-slate-900">5 Minutes</div>
                    <div className="text-slate-600">Quick and easy</div>
                  </div>
                  <div>
                    <div className="text-3xl mb-2">🎯</div>
                    <div className="font-semibold text-slate-900">Personalized</div>
                    <div className="text-slate-600">Just for you</div>
                  </div>
                  <div>
                    <div className="text-3xl mb-2">🔬</div>
                    <div className="font-semibold text-slate-900">Science-Based</div>
                    <div className="text-slate-600">Backed by research</div>
                  </div>
                </div>
              </div>
              <button
                onClick={() => window.location.href = '?retake-quiz=true'}
                className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white text-lg rounded-lg font-semibold transition-colors shadow-lg hover:shadow-xl flex items-center gap-3 mx-auto"
              >
                <Brain size={24} />
                Take Focus Quiz
              </button>
            </div>
          </div>
        )}

        {activeSubTab === 'brain-type' && brainType && brainTypeContent && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-lg p-8 border border-slate-200">
              <div className="flex items-start gap-4 mb-6">
                <div className="text-6xl">{brainTypeContent.emoji}</div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-slate-900">
                    {brainTypeContent.headline}
                  </h2>
                </div>
              </div>

              <div className="prose prose-slate max-w-none space-y-4">
                <p className="text-sm text-slate-700 leading-relaxed">
                  {brainTypeContent.body}
                </p>

                {brainType.secondary && (
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {getSecondaryTraitLanguage(
                      brainType.secondary,
                      getSecondaryTraitStrength(brainType.secondaryScore)
                    )}
                  </p>
                )}
              </div>
            </div>


            {cognitiveProfile && cognitiveProfile.adhdIndicator !== undefined && cognitiveProfile.asdScore !== undefined && cognitiveProfile.stimulantLevel && (
              <CognitiveProfiles
                adhdIndicator={cognitiveProfile.adhdIndicator}
                asdScore={cognitiveProfile.asdScore}
                stimulantLevel={cognitiveProfile.stimulantLevel}
              />
            )}

            <div className="bg-white rounded-2xl shadow-lg p-8 border border-slate-200">
              <div className="text-center mb-6">
                <h3 className="text-xl font-bold text-slate-900 mb-2">
                  Focus Brain Types — At a Glance
                </h3>
                <p className="text-sm text-slate-600">
                  Here's how your focus style compares with others — every profile has strengths and challenges, and focus.music tunes in to yours.{brainType.secondary ? " Your secondary trait is also highlighted below." : ""}
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
                    {getAllBrainTypeComparison().map((type) => {
                      const isPrimary = type.type === brainType.primary;
                      const isSecondary = type.type === brainType.secondary;
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
                          <td className="py-4 px-4 text-sm text-slate-700">{type.coreStrength}</td>
                          <td className="py-4 px-4 text-sm text-slate-700">{type.biggestChallenge}</td>
                          <td className="py-4 px-4 text-sm text-slate-700">{type.howFocusHelps}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-center">
              <button
                onClick={() => window.location.href = '?retake-quiz=true'}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 shadow-md hover:shadow-lg"
              >
                <User size={18} />
                Retake Focus Quiz
              </button>
            </div>
          </div>
        )}

        {activeSubTab === 'channels' && (
          <div className="space-y-4">
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <p className="text-sm text-blue-900">
                <strong>Personalized for you:</strong> These channels are scientifically matched to your cognitive profile to enhance focus and productivity. Our recommendation algorithm is the result of 15 years of in-house research and insights from over 640,000 subscribers.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {topChannels.map((channel, index) => {
                const isActive = activeChannel?.id === channel.id;
                return (
                  <button
                    key={channel.id}
                    onClick={() => {
                      if (!isActive) {
                        const energyLevel = channel.recommendedEnergyLevel || 'medium';
                        // channel.image_url is already resolved via getChannelImage in topChannels mapping
                        const imageUrl = channel.image_url || undefined;
                        setChannelEnergy(channel.id, energyLevel, imageUrl);
                        toggleChannel(channel, true, false, imageUrl);
                      }
                    }}
                    className={`w-full text-left bg-white rounded-xl shadow-md overflow-hidden transition-all hover:shadow-xl hover:-translate-y-1 ${
                      isActive
                        ? 'border-[3px] border-slate-900 shadow-2xl'
                        : 'border border-slate-200'
                    }`}
                  >
                    <div className="relative">
                      {channel.image_url ? (
                        <img
                          src={channel.image_url}
                          alt={channel.channel_name}
                          className="w-full h-40 object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="w-full h-40 bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center">
                          <Radio size={48} className="text-slate-400" />
                        </div>
                      )}
                      <div className="absolute top-3 left-3 w-10 h-10 bg-slate-900 rounded-lg flex items-center justify-center text-white text-lg font-bold shadow-lg">
                        {index + 1}
                      </div>
                      {isActive && (
                        <div className="absolute top-3 right-3 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg">
                          <Check size={22} className="text-slate-900" strokeWidth={3} />
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="text-lg font-bold text-slate-900 mb-2">{channel.channel_name}</h3>
                      {channel.description && (
                        <p className="text-sm text-slate-600 line-clamp-2">{channel.description}</p>
                      )}
                      {channel.recommendedEnergyLevel && (
                        <div className="mt-3 inline-block px-3 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full">
                          Best: {channel.recommendedEnergyLevel} energy
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {topChannels.length === 0 && (
              <div className="bg-white rounded-lg p-8 text-center border border-slate-200">
                <p className="text-slate-600">No channel recommendations available yet.</p>
              </div>
            )}
          </div>
        )}

        {activeSubTab === 'traits' && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-slate-900 mb-2">Your Personality Traits</h3>
              <p className="text-sm text-slate-600">
                Based on the Big Five (OCEAN) personality model, these traits influence how you focus and work best.
              </p>
            </div>

            <div className="space-y-8">
              {/* Openness */}
              {(() => {
                const band = getTraitBand(profile.ocean_openness);
                const interpretation = getOpennessInterpretation(band);
                return (
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-base font-semibold text-slate-900">Openness</span>
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">
                            {band}
                          </span>
                        </div>
                        <p className="text-sm text-slate-700 mb-1">{interpretation.description}</p>
                      </div>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2.5 mb-2">
                      <div className="bg-blue-600 h-2.5 rounded-full transition-all" style={{ width: `${profile.ocean_openness}%` }} />
                    </div>
                    <div className="flex items-start gap-2 text-sm text-slate-600">
                      <span className="text-blue-600 font-medium">→</span>
                      <span className="italic">{interpretation.musicImplication}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Conscientiousness */}
              {(() => {
                const band = getTraitBand(profile.ocean_conscientiousness);
                const interpretation = getConscientiousnessInterpretation(band);
                return (
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-base font-semibold text-slate-900">Conscientiousness</span>
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                            {band}
                          </span>
                        </div>
                        <p className="text-sm text-slate-700 mb-1">{interpretation.description}</p>
                      </div>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2.5 mb-2">
                      <div className="bg-green-600 h-2.5 rounded-full transition-all" style={{ width: `${profile.ocean_conscientiousness}%` }} />
                    </div>
                    <div className="flex items-start gap-2 text-sm text-slate-600">
                      <span className="text-green-600 font-medium">→</span>
                      <span className="italic">{interpretation.musicImplication}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Extraversion */}
              {(() => {
                const band = getTraitBand(profile.ocean_extraversion);
                const interpretation = getExtraversionInterpretation(band);
                return (
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-base font-semibold text-slate-900">Extraversion</span>
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full">
                            {band}
                          </span>
                        </div>
                        <p className="text-sm text-slate-700 mb-1">{interpretation.description}</p>
                      </div>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2.5 mb-2">
                      <div className="bg-amber-600 h-2.5 rounded-full transition-all" style={{ width: `${profile.ocean_extraversion}%` }} />
                    </div>
                    <div className="flex items-start gap-2 text-sm text-slate-600">
                      <span className="text-amber-600 font-medium">→</span>
                      <span className="italic">{interpretation.musicImplication}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Agreeableness */}
              {(() => {
                const band = getTraitBand(profile.ocean_agreeableness);
                const interpretation = getAgreeablenessInterpretation(band);
                return (
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-base font-semibold text-slate-900">Agreeableness</span>
                          <span className="px-2 py-0.5 bg-rose-100 text-rose-700 text-xs font-semibold rounded-full">
                            {band}
                          </span>
                        </div>
                        <p className="text-sm text-slate-700 mb-1">{interpretation.description}</p>
                      </div>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2.5 mb-2">
                      <div className="bg-rose-600 h-2.5 rounded-full transition-all" style={{ width: `${profile.ocean_agreeableness}%` }} />
                    </div>
                    <div className="flex items-start gap-2 text-sm text-slate-600">
                      <span className="text-rose-600 font-medium">→</span>
                      <span className="italic">{interpretation.musicImplication}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Emotional Sensitivity (Neuroticism) */}
              {(() => {
                const band = getTraitBand(profile.ocean_neuroticism);
                const interpretation = getNeuroticismInterpretation(band);
                return (
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-base font-semibold text-slate-900">Emotional Sensitivity</span>
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-semibold rounded-full">
                            {band}
                          </span>
                        </div>
                        <p className="text-sm text-slate-700 mb-1">{interpretation.description}</p>
                      </div>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2.5 mb-2">
                      <div className="bg-red-600 h-2.5 rounded-full transition-all" style={{ width: `${profile.ocean_neuroticism}%` }} />
                    </div>
                    <div className="flex items-start gap-2 text-sm text-slate-600">
                      <span className="text-red-600 font-medium">→</span>
                      <span className="italic">{interpretation.musicImplication}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {activeSubTab === 'tips' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              <h3 className="text-xl font-semibold text-slate-900 mb-4">Personalized Focus Tips</h3>
              <p className="text-sm text-slate-600 mb-6">
                Based on your unique cognitive profile and personality traits, here are strategies to optimize your focus:
              </p>

              <div className="space-y-4">
                {focusTips.map((tip, index) => (
                  <div key={index} className="bg-slate-50 rounded-lg p-5 border border-slate-200">
                    <div className="flex items-start gap-3">
                      <div className="text-3xl">{tip.icon}</div>
                      <div className="flex-1">
                        <h4 className="text-lg font-semibold text-slate-900 mb-2">{tip.title}</h4>
                        <p className="text-sm text-slate-700 leading-relaxed">{tip.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-blue-50 rounded-lg p-5 border border-blue-200">
              <h4 className="text-sm font-semibold text-blue-900 mb-2">Remember</h4>
              <p className="text-sm text-blue-800">
                Everyone's focus journey is unique. Experiment with these tips and adjust based on what works best for you. Consistency is more important than perfection.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

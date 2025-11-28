type CognitiveProfilesProps = {
  adhdIndicator: number;
  asdScore: number;
  stimulantLevel: string;
  onSignUp?: () => void;
};

export function CognitiveProfiles({ adhdIndicator, asdScore, stimulantLevel, onSignUp }: CognitiveProfilesProps) {
  const getAdhdLevel = (indicator: number): { level: string; text: string; energyText: string } => {
    if (indicator === 0) return {
      level: 'None',
      text: 'Standard focus profile',
      energyText: 'Standard energy levels match your natural rhythm'
    };
    if (indicator <= 33) return {
      level: 'Light',
      text: 'Light stimulation supports focus',
      energyText: 'Low-to-medium energy levels work best for sustained concentration'
    };
    if (indicator <= 66) return {
      level: 'Moderate',
      text: 'Moderate stimulation supports focus',
      energyText: 'Medium energy matches your focus state and personality profile'
    };
    return {
      level: 'High',
      text: 'High stimulation supports focus',
      energyText: 'Medium-to-high energy helps maintain engagement and attention'
    };
  };

  const getAsdLevel = (score: number): { level: string; text: string; maskingText: string } => {
    if (score >= 1.5) return {
      level: 'High',
      text: 'You have high auditory emotional sensitivity - rhythmic, minimal-emotion patterns work best',
      maskingText: 'Noise/Drums channels block distractions effectively'
    };
    if (score >= 1.0) return {
      level: 'Moderate',
      text: 'You prefer structured, predictable sound patterns with less emotional variation',
      maskingText: 'Rhythmic channels help reduce environmental interference'
    };
    if (score >= 0.5) return {
      level: 'Light',
      text: 'You show some preference for consistent, steady sound patterns',
      maskingText: 'Ambient or rhythmic channels can help with focus in busy environments'
    };
    return {
      level: 'Low',
      text: 'You respond well to varied emotional content and melodic music',
      maskingText: 'Melodic channels work well even in varied environments'
    };
  };

  const adhdProfile = getAdhdLevel(adhdIndicator);
  const asdProfile = getAsdLevel(asdScore);

  return (
    <div className="bg-gradient-to-br from-white to-slate-50 rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200">
        <div className="p-6 md:p-7">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center shadow-md">
              <span className="text-white text-xl">⚡</span>
            </div>
            <h3 className="text-xl font-bold text-slate-900">
              Attention Profile
            </h3>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-slate-700 uppercase tracking-wide">ADHD-tendency:</span>
                <span className={`px-4 py-1.5 rounded-full text-sm font-bold shadow-sm ${
                  adhdProfile.level === 'High' ? 'bg-red-100 text-red-700 border border-red-200' :
                  adhdProfile.level === 'Moderate' ? 'bg-orange-100 text-orange-700 border border-orange-200' :
                  adhdProfile.level === 'Light' ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' :
                  'bg-slate-100 text-slate-700 border border-slate-200'
                }`}>
                  {adhdProfile.level}
                </span>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">
                {adhdProfile.text}
              </p>
            </div>

            {!onSignUp && (
              <div className="bg-gradient-to-br from-blue-50 to-slate-50 rounded-xl p-4 border border-blue-100">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Energy setting:</span>
                  <span className="text-base font-bold text-blue-600">
                    {adhdProfile.level === 'High' ? 'Medium-High' :
                     adhdProfile.level === 'Moderate' ? 'Medium' :
                     adhdProfile.level === 'Light' ? 'Low-Medium' :
                     'Standard'}
                  </span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {adhdProfile.energyText}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 md:p-7">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md">
              <span className="text-white text-xl">🎧</span>
            </div>
            <h3 className="text-xl font-bold text-slate-900">
              Sensory Profile
            </h3>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Auditory Sensitivity:</span>
                <span className={`px-4 py-1.5 rounded-full text-sm font-bold shadow-sm ${
                  asdProfile.level === 'High' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                  asdProfile.level === 'Moderate' ? 'bg-blue-100 text-blue-600 border border-blue-200' :
                  asdProfile.level === 'Light' ? 'bg-slate-100 text-slate-600 border border-slate-200' :
                  'bg-slate-100 text-slate-700 border border-slate-200'
                }`}>
                  {asdProfile.level}
                </span>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">
                {asdProfile.text}
              </p>
            </div>

            {!onSignUp && (
              <div className="bg-gradient-to-br from-green-50 to-slate-50 rounded-xl p-4 border border-green-100">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Masking:</span>
                  <span className="text-base font-bold text-green-600">
                    {asdProfile.level === 'High' ? 'High' :
                     asdProfile.level === 'Moderate' ? 'Moderate' :
                     asdProfile.level === 'Light' ? 'Light' :
                     'Not needed'}
                  </span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {asdProfile.maskingText}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {onSignUp && (
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 text-center">
          <button
            onClick={onSignUp}
            className="text-blue-600 hover:text-blue-700 underline font-medium text-sm"
          >
            More info...
          </button>
        </div>
      )}
    </div>
  );
}

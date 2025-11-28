import { useState } from 'react';
import { X, Save } from 'lucide-react';
import { PlaylistStrategy } from '../lib/supabase';

type PlaybackContinuation = 'restart_login' | 'restart_session' | 'continue';

type StrategyConfig = {
  strategy: PlaylistStrategy;
  playbackContinuation: PlaybackContinuation;
  noRepeatWindow?: number;
};

type Props = {
  strategyType: PlaylistStrategy;
  currentConfig: StrategyConfig;
  onClose: () => void;
  onSave: (config: StrategyConfig) => void;
};

const strategyInfo: Record<PlaylistStrategy, { title: string; description: string }> = {
  track_id_order: {
    title: 'Track ID Order',
    description: 'Plays tracks in sequential order by their track ID. This is the most predictable playback order.',
  },
  weighted: {
    title: 'Weighted Algorithm',
    description: 'Uses weight values assigned to each track to determine how frequently they play. Higher weights mean more frequent playback.',
  },
  filename: {
    title: 'Track Name Order',
    description: 'Plays tracks in alphabetical order by their filename. Provides a consistent A-Z playback experience.',
  },
  upload_date: {
    title: 'Upload Date',
    description: 'Plays tracks in the order they were uploaded to the system. Newest or oldest first based on sort direction.',
  },
  random: {
    title: 'Random Shuffle',
    description: 'Randomly shuffles all tracks in the channel. Can be configured with a no-repeat window to prevent recently played tracks from appearing too soon.',
  },
  custom: {
    title: 'Custom Order',
    description: 'Uses a manually defined track order that you set up. Perfect for curated listening experiences.',
  },
};

export function StrategyEditModal({ strategyType, currentConfig, onClose, onSave }: Props) {
  const [config, setConfig] = useState<StrategyConfig>({
    ...currentConfig,
    strategy: strategyType
  });
  const info = strategyInfo[strategyType];

  const handleSave = () => {
    onSave(config);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{info.title}</h2>
            <p className="text-sm text-slate-600 mt-1">{info.description}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {strategyType === 'random' ? (
            <>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-900">No-Repeat Window</span>
                  <p className="text-xs text-slate-600 mt-1 mb-3">
                    Minimum number of other tracks that must play before a track can be randomly selected again.
                    Set to 0 to allow immediate repeats.
                  </p>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="0"
                      max="999"
                      value={config.noRepeatWindow || 0}
                      onChange={(e) =>
                        setConfig({ ...config, noRepeatWindow: parseInt(e.target.value) || 0 })
                      }
                      className="w-32 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-500">tracks</span>
                  </div>
                  {(config.noRepeatWindow || 0) > 0 && (
                    <p className="text-xs text-blue-600 mt-2">
                      A track must wait for {config.noRepeatWindow} other track{config.noRepeatWindow !== 1 ? 's' : ''} to play before it can be selected again.
                    </p>
                  )}
                </label>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm text-amber-900">
                  <span className="font-semibold">How it works:</span> Each time a track finishes, the system randomly selects
                  the next track from all available tracks, excluding any within the no-repeat window. This creates an
                  unpredictable listening experience while preventing excessive repetition.
                </p>
              </div>
            </>
          ) : (
            <>
            <h3 className="text-base font-semibold text-slate-900 mb-3">Playback Continuation</h3>
            <p className="text-sm text-slate-600 mb-4">
              Choose how the playlist should behave when the user stops and resumes playback.
            </p>

            <div className="space-y-3">
              <label
                className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  config.playbackContinuation === 'restart_login'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="playbackContinuation"
                  value="restart_login"
                  checked={config.playbackContinuation === 'restart_login'}
                  onChange={(e) =>
                    setConfig({ ...config, playbackContinuation: e.target.value as PlaybackContinuation })
                  }
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="font-medium text-slate-900">Restart from Beginning on Login</div>
                  <p className="text-sm text-slate-600 mt-1">
                    Every time the user logs in to the app, the playlist will restart from the first track.
                    Playback also restarts when user stops and resumes during the same session.
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  config.playbackContinuation === 'restart_session'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="playbackContinuation"
                  value="restart_session"
                  checked={config.playbackContinuation === 'restart_session'}
                  onChange={(e) =>
                    setConfig({ ...config, playbackContinuation: e.target.value as PlaybackContinuation })
                  }
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="font-medium text-slate-900">Restart from Beginning Each Session</div>
                  <p className="text-sm text-slate-600 mt-1">
                    Each time the user stops and starts playback during a session, the playlist restarts from the first track.
                    Position is maintained across sessions only if the user doesn't manually stop.
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  config.playbackContinuation === 'continue'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="playbackContinuation"
                  value="continue"
                  checked={config.playbackContinuation === 'continue'}
                  onChange={(e) =>
                    setConfig({ ...config, playbackContinuation: e.target.value as PlaybackContinuation })
                  }
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="font-medium text-slate-900">Continue from Last Position</div>
                  <p className="text-sm text-slate-600 mt-1">
                    Resume playback from the next unplayed track when the user returns. Position is preserved
                    across logins and sessions, providing a continuous listening experience.
                  </p>
                </div>
              </label>
            </div>

            {strategyType === 'weighted' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900">
                  <span className="font-semibold">Note:</span> Weight values are set individually for each track
                  in the playlist. Higher weight values mean the track will play more frequently relative to other tracks.
                </p>
              </div>
            )}

            {strategyType === 'custom' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900">
                  <span className="font-semibold">Note:</span> Custom order is managed through the playlist interface.
                  Use the drag-and-drop feature to arrange tracks in your preferred order.
                </p>
              </div>
            )}
          </>
          )}
        </div>

        <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Save size={16} />
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
}

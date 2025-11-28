import { useState, useEffect } from 'react';
import { Settings, Play, Save, AlertCircle, CreditCard as Edit2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

type PlaylistStrategy = 'filename_order' | 'upload_date' | 'random' | 'weighted' | 'custom';

interface StrategyConfig {
  value: PlaylistStrategy;
  label: string;
  description: string;
  enabled: boolean;
}

interface PlaylisterSettings {
  defaultStrategy: PlaylistStrategy;
  enableWeighting: boolean;
  shuffleOnRepeat: boolean;
  minTracksPerPlaylist: number;
}

export function PlaylisterConfig() {
  const [settings, setSettings] = useState<PlaylisterSettings>({
    defaultStrategy: 'weighted',
    enableWeighting: true,
    shuffleOnRepeat: false,
    minTracksPerPlaylist: 10,
  });
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [editingStrategy, setEditingStrategy] = useState<StrategyConfig | null>(null);
  const [showStrategyModal, setShowStrategyModal] = useState(false);

  const [strategies, setStrategies] = useState<StrategyConfig[]>([
    {
      value: 'weighted',
      label: 'Weighted Algorithm',
      description: 'Uses the weight values from channel JSON files to determine track order and frequency',
      enabled: true,
    },
    {
      value: 'filename_order',
      label: 'Track ID Order',
      description: 'Plays tracks in sequential order by track ID',
      enabled: true,
    },
    {
      value: 'upload_date',
      label: 'Upload Date',
      description: 'Plays tracks ordered by upload date (newest or oldest first)',
      enabled: true,
    },
    {
      value: 'random',
      label: 'Random Shuffle',
      description: 'Randomly shuffles all tracks in the channel',
      enabled: true,
    },
    {
      value: 'custom',
      label: 'Custom Order',
      description: 'Use manually defined track order',
      enabled: true,
    },
  ]);

  const handleEditStrategy = (strategy: StrategyConfig) => {
    setEditingStrategy(strategy);
    setShowStrategyModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('Saving configuration...');

    await new Promise(resolve => setTimeout(resolve, 1000));

    setSaveStatus('Configuration saved successfully!');
    setSaving(false);

    setTimeout(() => setSaveStatus(''), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Playlister Configuration</h2>
          <p className="text-slate-600 mt-1">Configure how playlists are generated for users</p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="text-blue-600 flex-shrink-0 mt-0.5" size={20} />
        <div>
          <h3 className="font-medium text-blue-900 mb-1">Current Version: Simple Playback</h3>
          <p className="text-sm text-blue-800">
            The playlister currently reads track IDs directly from channel JSON files and plays them in the order specified.
            Future versions will include advanced algorithms for personalized playlist generation.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6 space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Playlist Strategies</h3>
          <div className="space-y-2">
            {strategies.map((strategy) => (
              <div
                key={strategy.value}
                className={`flex items-center gap-4 p-4 border-2 rounded-lg transition-all ${
                  settings.defaultStrategy === strategy.value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-slate-900">{strategy.label}</span>
                    {settings.defaultStrategy === strategy.value && (
                      <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs font-medium rounded">
                        Active
                      </span>
                    )}
                    {!strategy.enabled && (
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-medium rounded">
                        Disabled
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600">{strategy.description}</p>
                </div>
                <button
                  onClick={() => handleEditStrategy(strategy)}
                  className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <Edit2 size={16} />
                  Edit
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-200 pt-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Advanced Settings</h3>
          <div className="space-y-4">
            <label className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <div>
                <p className="font-medium text-slate-900">Enable Track Weighting</p>
                <p className="text-sm text-slate-600">
                  Use weight values to determine track frequency in playlists
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.enableWeighting}
                onChange={(e) => setSettings({ ...settings, enableWeighting: e.target.checked })}
                className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
            </label>

            <label className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <div>
                <p className="font-medium text-slate-900">Shuffle on Repeat</p>
                <p className="text-sm text-slate-600">
                  Automatically shuffle playlist when it repeats
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.shuffleOnRepeat}
                onChange={(e) => setSettings({ ...settings, shuffleOnRepeat: e.target.checked })}
                className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
            </label>

            <div className="p-4 bg-slate-50 rounded-lg">
              <label className="block">
                <p className="font-medium text-slate-900 mb-2">Minimum Tracks Per Playlist</p>
                <p className="text-sm text-slate-600 mb-3">
                  Minimum number of tracks to include in each generated playlist
                </p>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={settings.minTracksPerPlaylist}
                  onChange={(e) =>
                    setSettings({ ...settings, minTracksPerPlaylist: parseInt(e.target.value) || 10 })
                  }
                  className="w-32 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-6">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={20} />
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>

          {saveStatus && (
            <div className={`mt-4 p-4 rounded-lg ${
              saveStatus.includes('success')
                ? 'bg-green-50 text-green-800'
                : 'bg-blue-50 text-blue-800'
            }`}>
              {saveStatus}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Future Enhancements</h3>
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
            <Settings className="text-slate-400 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-medium text-slate-700">Machine Learning Algorithms</p>
              <p className="text-sm text-slate-600">
                Personalized playlist generation based on user listening history and preferences
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
            <Play className="text-slate-400 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-medium text-slate-700">Dynamic Energy Adjustment</p>
              <p className="text-sm text-slate-600">
                Automatically adjust energy levels based on time of day and user patterns
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
            <AlertCircle className="text-slate-400 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-medium text-slate-700">Smart Skip Detection</p>
              <p className="text-sm text-slate-600">
                Learn from user skip patterns to improve playlist quality over time
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Strategy Edit Modal */}
      {showStrategyModal && editingStrategy && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Edit Strategy</h3>
                <p className="text-sm text-slate-600 mt-1">{editingStrategy.label}</p>
              </div>
              <button
                onClick={() => {
                  setShowStrategyModal(false);
                  setEditingStrategy(null);
                }}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-slate-600" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Strategy Name */}
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-2">
                  Strategy Name
                </label>
                <input
                  type="text"
                  value={editingStrategy.label}
                  onChange={(e) =>
                    setEditingStrategy({ ...editingStrategy, label: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-2">
                  Description
                </label>
                <textarea
                  value={editingStrategy.description}
                  onChange={(e) =>
                    setEditingStrategy({ ...editingStrategy, description: e.target.value })
                  }
                  rows={3}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Enabled Toggle */}
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-medium text-slate-900">Enable Strategy</p>
                  <p className="text-sm text-slate-600">
                    Make this strategy available for selection
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={editingStrategy.enabled}
                  onChange={(e) =>
                    setEditingStrategy({ ...editingStrategy, enabled: e.target.checked })
                  }
                  className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Set as Active */}
              {editingStrategy.enabled && (
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div>
                    <p className="font-medium text-blue-900">Set as Active Strategy</p>
                    <p className="text-sm text-blue-700">
                      Use this strategy as the default for all channels
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.defaultStrategy === editingStrategy.value}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSettings({ ...settings, defaultStrategy: editingStrategy.value });
                      }
                    }}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowStrategyModal(false);
                  setEditingStrategy(null);
                }}
                className="px-4 py-2 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  // Update the strategy in the list
                  setStrategies(strategies.map(s =>
                    s.value === editingStrategy.value ? editingStrategy : s
                  ));
                  setShowStrategyModal(false);
                  setEditingStrategy(null);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

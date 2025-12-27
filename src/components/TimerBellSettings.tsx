import { useState, useEffect } from 'react';
import { Settings, Check, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { BellSoundLibrary } from './BellSoundLibrary';
import { getSystemPreferences, invalidateSystemPreferences } from '../lib/supabaseDataCache';

export function TimerBellSettings() {
  const { user } = useAuth();
  const [recommendationSessions, setRecommendationSessions] = useState<number>(5);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    loadRecommendationSettings();
  }, []);

  const loadRecommendationSettings = async () => {
    setError('');

    try {
      // Use cached system preferences to avoid duplicate Supabase calls
      const data = await getSystemPreferences();

      if (data) {
        setRecommendationSessions(data.recommendation_visibility_sessions || 5);
      }
    } catch (err) {
      setError('Failed to load settings. Please refresh the page.');
    }
  };

  const handleSaveRecommendations = async () => {
    if (!user?.id) return;

    setIsSaving(true);
    setSaveStatus('');
    setError('');

    try {
      const { error: updateError } = await supabase
        .from('system_preferences')
        .update({
          recommendation_visibility_sessions: recommendationSessions,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        })
        .eq('id', 1);

      if (updateError) throw updateError;

      // Invalidate cache after mutation
      invalidateSystemPreferences();

      setSaveStatus('Settings saved successfully!');
      setTimeout(() => setSaveStatus(''), 3000);
    } catch (err) {
      setError('Failed to save settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Personalized Recommendations Visibility */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <div className="flex items-start gap-3 mb-4">
          <Settings size={24} className="text-slate-700 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-slate-900 mb-1">
              Personalized Recommendations Visibility
            </h3>
            <p className="text-sm text-slate-600">
              Control how many sessions new users see the highlighted personalized recommendation frame on the Channels page.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Number of Sessions to Show Recommendations
            </label>
            <div className="flex items-center gap-4">
              <input
                type="number"
                min="0"
                max="100"
                value={recommendationSessions}
                onChange={(e) => setRecommendationSessions(parseInt(e.target.value) || 0)}
                className="w-32 px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <span className="text-sm text-slate-600">
                sessions (0 = never show, 1-100 = show for first N sessions)
              </span>
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium text-slate-900">How it works:</p>
            <ul className="text-sm text-slate-600 space-y-1 ml-4 list-disc">
              <li>New users start with a session count of 0</li>
              <li>
                Users will see the blue-framed "Your Personalized Recommendations" section while their session count is less than this value
              </li>
              <li>For example, if set to 2, users will see the frame during sessions 0 and 1 (their first 2 sessions)</li>
              <li>After reaching or exceeding this threshold, the frame disappears but recommendations still appear at the top when sorted by "Recommended"</li>
              <li>Set to 0 to never show the highlighted frame</li>
            </ul>
          </div>

          <div className="flex items-center gap-2 text-sm text-slate-600 bg-blue-50 p-3 rounded-md border border-blue-100">
            <AlertCircle size={16} className="text-blue-600 flex-shrink-0" />
            <span>
              Currently set to <strong>{recommendationSessions}</strong> session{recommendationSessions !== 1 ? 's' : ''}
            </span>
          </div>

          <button
            onClick={handleSaveRecommendations}
            disabled={isSaving}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                Saving...
              </>
            ) : (
              <>
                <Check size={18} />
                Save Settings
              </>
            )}
          </button>

          {saveStatus && (
            <div className="text-sm p-3 rounded-md bg-green-50 text-green-700 flex items-center gap-2">
              <Check size={16} />
              {saveStatus}
            </div>
          )}

          {error && (
            <div className="text-sm p-3 rounded-md bg-red-50 text-red-700 flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Timer Bell Sound Library */}
      <BellSoundLibrary />
    </div>
  );
}

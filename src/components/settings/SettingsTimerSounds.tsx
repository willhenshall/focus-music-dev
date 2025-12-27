import { useState, useEffect } from 'react';
import { UserBellSettings } from '../UserBellSettings';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { getUserPreferences, invalidateUserPreferences } from '../../lib/supabaseDataCache';

export function SettingsTimerSounds() {
  const { user } = useAuth();
  const [autoHideNav, setAutoHideNav] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    loadAutoHidePreference();
  }, [user]);

  const loadAutoHidePreference = async () => {
    if (!user) return;

    try {
      setLoading(true);
      // Use cached user preferences to avoid duplicate Supabase calls
      const data = await getUserPreferences(user.id);

      if (data && data.auto_hide_tab_navigation !== null) {
        setAutoHideNav(data.auto_hide_tab_navigation);
      }
    } catch (err) {
      console.error('Failed to load auto-hide preference:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAutoHide = async (enabled: boolean) => {
    if (!user) return;

    setAutoHideNav(enabled);
    setSaveStatus('saving');

    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert(
          { user_id: user.id, auto_hide_tab_navigation: enabled },
          { onConflict: 'user_id' }
        );

      if (error) throw error;

      // Invalidate cache after mutation
      invalidateUserPreferences(user.id);

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);

      window.dispatchEvent(new CustomEvent('autoHideNavChanged', { detail: { enabled } }));
    } catch (err) {
      console.error('Failed to save auto-hide preference:', err);
      setSaveStatus('error');
      setAutoHideNav(!enabled);
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  return (
    <div className="space-y-6">
      <UserBellSettings />

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Navigation Behavior</h3>
            <p className="text-sm text-slate-600">
              Customize how the tab navigation bar appears while browsing channels.
            </p>
          </div>

          <div className="flex items-start justify-between gap-4 py-4 border-t border-slate-200">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <label htmlFor="auto-hide-nav" className="font-medium text-slate-900">
                  Auto-hide navigation bar
                </label>
                {saveStatus === 'saved' && (
                  <span className="text-xs text-green-600 font-medium">Saved</span>
                )}
                {saveStatus === 'error' && (
                  <span className="text-xs text-red-600 font-medium">Error saving</span>
                )}
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                When enabled, the tab navigation automatically hides to give you more space for your channels.
                Simply hover near the top of the page to reveal it. Similar to the auto-hide behavior of the macOS Dock.
              </p>
            </div>
            <button
              id="auto-hide-nav"
              role="switch"
              aria-checked={autoHideNav}
              disabled={loading || saveStatus === 'saving'}
              onClick={() => handleToggleAutoHide(!autoHideNav)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                autoHideNav ? 'bg-blue-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  autoHideNav ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

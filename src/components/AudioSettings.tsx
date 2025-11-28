import { useState, useEffect } from 'react';
import { Volume2, Activity, Eye, EyeOff, Timer, Upload } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { BulkAudioUploader } from './BulkAudioUploader';

export function AudioSettings() {
  const [activeSection, setActiveSection] = useState<'settings' | 'upload'>('settings');
  const { user } = useAuth();
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showQueue, setShowQueue] = useState(true);
  const [showTimerDebug, setShowTimerDebug] = useState(false);
  // Continuous playback code removed here
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, [user]);

  const loadPreferences = async () => {
    setLoading(true);

    // Load system preferences
    const { data: sysData } = await supabase
      .from('system_preferences')
      .select('show_audio_diagnostics, show_queue')
      .eq('id', 1)
      .maybeSingle();

    if (sysData) {
      setShowDiagnostics(sysData.show_audio_diagnostics ?? false);
      setShowQueue(sysData.show_queue ?? true);
      // Continuous playback code removed here
    }

    // Load user preferences for timer debug
    if (user) {
      const { data: userData } = await supabase
        .from('user_preferences')
        .select('show_timer_debug')
        .eq('user_id', user.id)
        .maybeSingle();

      if (userData) {
        setShowTimerDebug(userData.show_timer_debug ?? false);
      }
    }

    setLoading(false);
  };

  const updatePreference = async (field: 'show_audio_diagnostics' | 'show_queue', value: boolean) => {
    if (!user) return;

    setSaving(true);

    const { error } = await supabase
      .from('system_preferences')
      .update({
        [field]: value,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq('id', 1);

    if (error) {
      alert('Failed to save preference');
    } else {
      if (field === 'show_audio_diagnostics') {
        setShowDiagnostics(value);
      } else if (field === 'show_queue') {
        setShowQueue(value);
      }
      // Continuous playback code removed here
      window.dispatchEvent(new CustomEvent('audioPreferencesChanged', {
        detail: {
          show_audio_diagnostics: field === 'show_audio_diagnostics' ? value : showDiagnostics,
          show_queue: field === 'show_queue' ? value : showQueue,
        }
      }));
    }

    setSaving(false);
  };

  const updateTimerDebug = async (value: boolean) => {
    if (!user) return;

    setSaving(true);

    const { error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: user.id,
        show_timer_debug: value,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

    if (error) {
      alert('Failed to save preference');
    } else {
      setShowTimerDebug(value);
    }

    setSaving(false);
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Audio Management</h2>
        <p className="text-slate-600">
          Configure audio settings and upload audio files with metadata
        </p>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveSection('settings')}
          className={`px-6 py-3 font-medium transition-colors relative ${
            activeSection === 'settings'
              ? 'text-blue-600'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <Volume2 size={18} />
            Settings
          </div>
          {activeSection === 'settings' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
          )}
        </button>
        <button
          onClick={() => setActiveSection('upload')}
          className={`px-6 py-3 font-medium transition-colors relative ${
            activeSection === 'upload'
              ? 'text-blue-600'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <Upload size={18} />
            Bulk Upload
          </div>
          {activeSection === 'upload' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
          )}
        </button>
      </div>

      {activeSection === 'upload' ? (
        <BulkAudioUploader />
      ) : (
        <>
      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Audio Settings</h3>
        <p className="text-slate-600 text-sm mb-4">
          Configure global audio-related display options and diagnostic tools for all users
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm divide-y divide-slate-200">
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4 flex-1">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Activity className="text-green-600" size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900 mb-1">
                  HTML5 Audio Diagnostics
                </h3>
                <p className="text-sm text-slate-600 mb-3">
                  Show real-time diagnostic panel with network status, buffer health, playback state, and iOS compatibility metrics for all users.
                  This panel appears above the music player footer and provides detailed console-style monitoring.
                </p>
                <div className="inline-flex items-center gap-2 text-xs bg-amber-50 text-amber-700 px-3 py-1.5 rounded-lg">
                  <Eye size={14} />
                  Global setting for all users
                </div>
              </div>
            </div>
            <button
              onClick={() => updatePreference('show_audio_diagnostics', !showDiagnostics)}
              disabled={saving}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                showDiagnostics ? 'bg-blue-600' : 'bg-slate-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  showDiagnostics ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4 flex-1">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Volume2 className="text-blue-600" size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900 mb-1">
                  Music Player Queue
                </h3>
                <p className="text-sm text-slate-600 mb-3">
                  Show the upcoming tracks queue on the music player footer for all users.
                  This provides a quick view of what's playing next and allows queue management.
                </p>
                <div className="inline-flex items-center gap-2 text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg">
                  {showQueue ? (
                    <>
                      <Eye size={14} />
                      Visible
                    </>
                  ) : (
                    <>
                      <EyeOff size={14} />
                      Hidden
                    </>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => updatePreference('show_queue', !showQueue)}
              disabled={saving}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${
                showQueue ? 'bg-blue-600' : 'bg-slate-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  showQueue ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Continuous playback UI removed here */}

        <div className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4 flex-1">
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Timer className="text-yellow-600" size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900 mb-1">
                  Session Timer Debug Overlay
                </h3>
                <p className="text-sm text-slate-600 mb-3">
                  Show a draggable debug overlay with detailed session timer diagnostics. Displays timer state,
                  interval activity, countdown conditions, and real-time metrics. Admin-only feature for debugging timer issues.
                </p>
                <div className="inline-flex items-center gap-2 text-xs bg-yellow-50 text-yellow-700 px-3 py-1.5 rounded-lg">
                  <Eye size={14} />
                  Admin-only setting (applies to your account)
                </div>
              </div>
            </div>
            <button
              onClick={() => updateTimerDebug(!showTimerDebug)}
              disabled={saving}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 disabled:opacity-50 ${
                showTimerDebug ? 'bg-yellow-600' : 'bg-slate-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  showTimerDebug ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
        <h4 className="text-sm font-semibold text-blue-900 mb-2">About These Settings</h4>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>These settings affect all users globally</li>
          <li>Changes take effect immediately</li>
        </ul>
      </div>
      </>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Volume2, Check, AlertCircle, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type BellSound = {
  id: string;
  name: string;
  public_url: string | null;
  format: string | null;
  duration: number | null;
  is_default: boolean;
};

type UserPreference = {
  bell_sound_id: string | null;
  volume: number;
};

export function UserBellSettings() {
  const { user } = useAuth();
  const [bellSounds, setBellSounds] = useState<BellSound[]>([]);
  const [selectedBellId, setSelectedBellId] = useState<string | null>(null);
  const [volume, setVolume] = useState(80);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [savingBellId, setSavingBellId] = useState<string | null>(null);
  const [previewingBellId, setPreviewingBellId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const volumeTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    loadBellSounds();
    loadUserPreferences();
  }, [user]);

  useEffect(() => {
    // Subscribe to realtime updates of user preferences
    if (!user) return;

    const channel = supabase
      .channel('user_bell_prefs_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_bell_preferences',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new && typeof payload.new === 'object') {
            const newPrefs = payload.new as UserPreference;
            setSelectedBellId(newPrefs.bell_sound_id);
            setVolume(newPrefs.volume);
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [user]);

  const loadBellSounds = async () => {
    try {
      const { data, error } = await supabase
        .from('timer_bell_sounds')
        .select('id, name, public_url, format, duration, is_default')
        .eq('is_visible', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;

      setBellSounds(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load bell sounds');
    }
  };

  const loadUserPreferences = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_bell_preferences')
        .select('bell_sound_id, volume')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && !error.message.includes('No rows found')) {
        throw error;
      }

      if (data) {
        setSelectedBellId(data.bell_sound_id);
        setVolume(data.volume);
      } else {
        // No preferences yet - use defaults
        const defaultBell = bellSounds.find(b => b.is_default);
        setSelectedBellId(defaultBell?.id || null);
        setVolume(80);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load preferences');
    } finally {
      setLoading(false);
    }
  };

  const handleBellChange = async (bellId: string) => {
    if (!user) return;

    setSelectedBellId(bellId);
    setSavingBellId(bellId);
    setError(null);

    try {
      const { error } = await supabase
        .from('user_bell_preferences')
        .upsert({
          user_id: user.id,
          bell_sound_id: bellId,
          volume: volume,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });

      if (error) throw error;

      setSuccess('Sound selected!');
      setTimeout(() => setSuccess(null), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to save selection');
      setTimeout(() => setError(null), 3000);
    } finally {
      setSavingBellId(null);
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);

    // Clear existing timeout
    if (volumeTimeoutRef.current) {
      clearTimeout(volumeTimeoutRef.current);
    }

    // Set audio volume for preview
    if (previewAudioRef.current) {
      previewAudioRef.current.volume = newVolume / 100;
    }

    // Auto-save volume after 500ms of no changes (debounce)
    volumeTimeoutRef.current = window.setTimeout(() => {
      saveVolumePreference(newVolume);
    }, 500);
  };

  const saveVolumePreference = async (newVolume: number) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('user_bell_preferences')
        .upsert({
          user_id: user.id,
          bell_sound_id: selectedBellId,
          volume: newVolume,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });

      if (error) throw error;
    } catch (err: any) {
      console.error('Failed to save volume:', err);
    }
  };

  const handlePreview = async (bellId: string, event: React.MouseEvent) => {
    // Prevent the button click from selecting the bell
    event.stopPropagation();

    const bell = bellSounds.find(b => b.id === bellId);
    if (!bell) return;

    // If this bell is already playing, stop it
    if (previewingBellId === bellId) {
      stopPreview();
      return;
    }

    // Stop any currently playing preview
    stopPreview();

    // Handle built-in programmatic bell
    if (!bell.public_url) {
      playBuiltInBell();
      setPreviewingBellId(bellId);
      // Auto-stop after duration
      setTimeout(() => {
        setPreviewingBellId(null);
      }, 2000);
      return;
    }

    // Play audio file
    try {
      const audio = new Audio(bell.public_url);
      audio.volume = volume / 100;
      previewAudioRef.current = audio;
      setPreviewingBellId(bellId);

      // Limit preview to 2-3 seconds
      const maxPreviewDuration = Math.min(bell.duration || 3, 3);
      let previewTimeout: number;

      audio.onended = () => {
        setPreviewingBellId(null);
        clearTimeout(previewTimeout);
      };

      audio.onerror = () => {
        setPreviewingBellId(null);
        setError('Failed to preview this sound. It may not be available.');
        setTimeout(() => setError(null), 3000);
        clearTimeout(previewTimeout);
      };

      await audio.play();

      // Stop after max duration
      previewTimeout = window.setTimeout(() => {
        if (previewAudioRef.current) {
          previewAudioRef.current.pause();
          previewAudioRef.current.currentTime = 0;
        }
        setPreviewingBellId(null);
      }, maxPreviewDuration * 1000);
    } catch (err) {
      setPreviewingBellId(null);
      setError('Failed to preview this sound.');
      setTimeout(() => setError(null), 3000);
    }
  };

  const stopPreview = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
      previewAudioRef.current = null;
    }
    setPreviewingBellId(null);
  };

  const playBuiltInBell = () => {
    // Create a simple built-in bell tone using Web Audio API
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.5);

    gainNode.gain.setValueAtTime(volume / 100, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  };

  const getSelectedBellName = () => {
    const bell = bellSounds.find(b => b.id === selectedBellId);
    return bell?.name || 'None selected';
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPreview();
      if (volumeTimeoutRef.current) {
        clearTimeout(volumeTimeoutRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Error/Success Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-800">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">
            <X size={16} />
          </button>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <Check size={20} className="text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-800 font-medium">{success}</p>
        </div>
      )}

      {/* Timer Sound Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Timer Sound</h3>
          <p className="text-sm text-slate-600 mt-1">
            Choose the sound that plays when your timer completes
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Volume Control - Moved to top */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <Volume2 size={18} />
                Volume
              </label>
              <span className="text-lg font-semibold text-blue-600">{volume}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
              className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${volume}%, #e2e8f0 ${volume}%, #e2e8f0 100%)`,
              }}
              aria-label="Timer sound volume"
              data-testid="bell-volume-slider"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-2">
              <span>Quiet</span>
              <span>Loud</span>
            </div>
          </div>

          {/* Bell Sound Selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-3">
              Select Sound
            </label>
            <div className="space-y-2">
              {bellSounds.map(bell => (
                <button
                  key={bell.id}
                  onClick={() => handleBellChange(bell.id)}
                  disabled={savingBellId === bell.id}
                  className={`w-full flex items-center justify-between p-4 rounded-lg border-2 transition-all ${
                    selectedBellId === bell.id
                      ? 'border-green-500 bg-green-50'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  } ${savingBellId === bell.id ? 'opacity-50 cursor-wait' : ''}`}
                  aria-label={`Select ${bell.name}`}
                  aria-pressed={selectedBellId === bell.id}
                  data-testid="bell-sound-option"
                  data-selected={selectedBellId === bell.id}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        selectedBellId === bell.id
                          ? 'border-green-500 bg-green-500'
                          : 'border-slate-300'
                      }`}
                    >
                      {selectedBellId === bell.id && (
                        <Check size={12} className="text-white" strokeWidth={3} />
                      )}
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <p className="font-medium text-slate-900 truncate">{bell.name}</p>
                      <p className="text-xs text-slate-500">
                        {bell.format?.toUpperCase() || 'Audio'}
                        {bell.duration && ` • ${bell.duration.toFixed(1)}s`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {bell.is_default && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-medium">
                        Default
                      </span>
                    )}
                    {savingBellId === bell.id && (
                      <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent" />
                    )}
                    <button
                      onClick={(e) => handlePreview(bell.id, e)}
                      className={`p-2 rounded-lg transition-all hover:scale-110 ${
                        previewingBellId === bell.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                      aria-label={previewingBellId === bell.id ? `Stop previewing ${bell.name}` : `Preview ${bell.name}`}
                      title={previewingBellId === bell.id ? 'Stop preview' : 'Preview sound'}
                      data-testid="bell-preview-button"
                    >
                      {previewingBellId === bell.id ? (
                        <Pause size={16} className="animate-pulse" />
                      ) : (
                        <Play size={16} />
                      )}
                    </button>
                  </div>
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Sounds are automatically saved when selected. Use the play button to preview before choosing.
            </p>
          </div>
        </div>
      </div>

      {/* Help Text */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>How it works:</strong> Your selected sound will play when the timer completes.
          Adjust the volume to your preference and preview sounds before selecting.
        </p>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useMusicPlayer } from '../contexts/MusicPlayerContext';
import TimerDebugOverlay from './TimerDebugOverlay';

export default function SessionTimer() {
  const { user } = useAuth();
  const { isPlaying, setSessionTimer, activeChannel, toggleChannel } = useMusicPlayer();
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [timerDuration, setTimerDuration] = useState(0); // in seconds
  const [remainingTime, setRemainingTime] = useState(0); // in seconds
  const [lastSetDuration, setLastSetDuration] = useState(1500); // Remember last set duration (default 25 min)
  const [showModal, setShowModal] = useState(false);
  const [inputMinutes, setInputMinutes] = useState('25');
  const intervalRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const hasPlayedStartBell = useRef(false);
  const timerDurationRef = useRef(0);
  const effectRunCount = useRef(0);
  const [isLoading, setIsLoading] = useState(true);
  const wasPlayingRef = useRef(false);
  const [customBellUrl, setCustomBellUrl] = useState<string | null>(null);
  const customBellAudioRef = useRef<HTMLAudioElement | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [bellVolume, setBellVolume] = useState(80); // User's volume preference


  // Initialize audio context
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Load user bell preferences (sound and volume)
  useEffect(() => {
    const loadUserBellPreferences = async () => {
      if (!user) return;

      try {
        // Get user's bell preference
        const { data: userPref, error: userError } = await supabase
          .from('user_bell_preferences')
          .select('bell_sound_id, volume')
          .eq('user_id', user.id)
          .maybeSingle();

        if (userError && !userError.message.includes('No rows found')) {
          throw userError;
        }

        // Set user's volume
        if (userPref) {
          setBellVolume(userPref.volume || 80);

          // If user selected a specific bell sound, load it
          if (userPref.bell_sound_id) {
            const { data: bellSound, error: bellError } = await supabase
              .from('timer_bell_sounds')
              .select('public_url, name')
              .eq('id', userPref.bell_sound_id)
              .single();

            if (bellError) throw bellError;

            if (bellSound?.public_url) {
              setCustomBellUrl(bellSound.public_url);
              // Preload the audio
              const audio = new Audio(bellSound.public_url);
              audio.preload = 'auto';
              audio.volume = (userPref.volume || 80) / 100;
              customBellAudioRef.current = audio;
            }
          } else {
            // User has no specific bell selected - load default
            const { data: defaultBell, error: defaultError } = await supabase
              .from('timer_bell_sounds')
              .select('public_url, name')
              .eq('is_default', true)
              .maybeSingle();

            if (!defaultError && defaultBell?.public_url) {
              setCustomBellUrl(defaultBell.public_url);
              const audio = new Audio(defaultBell.public_url);
              audio.preload = 'auto';
              audio.volume = (userPref.volume || 80) / 100;
              customBellAudioRef.current = audio;
            }
          }
        } else {
          // No user preference - load system default bell
          const { data: defaultBell, error: defaultError } = await supabase
            .from('timer_bell_sounds')
            .select('public_url, name')
            .eq('is_default', true)
            .maybeSingle();

          if (!defaultError && defaultBell?.public_url) {
            setCustomBellUrl(defaultBell.public_url);
            const audio = new Audio(defaultBell.public_url);
            audio.preload = 'auto';
            audio.volume = 0.8; // Default 80%
            customBellAudioRef.current = audio;
          }
        }
      } catch (error) {
        // Silent fail - will use programmatic bell
      }
    };

    loadUserBellPreferences();
  }, [user]);

  // Subscribe to real-time changes in user bell preferences
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('user-bell-prefs-realtime')
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
            const newPrefs = payload.new as { bell_sound_id: string | null; volume: number };
            setBellVolume(newPrefs.volume);

            // Reload the bell sound if it changed
            if (newPrefs.bell_sound_id) {
              supabase
                .from('timer_bell_sounds')
                .select('public_url')
                .eq('id', newPrefs.bell_sound_id)
                .single()
                .then(({ data }) => {
                  if (data?.public_url) {
                    setCustomBellUrl(data.public_url);
                    const audio = new Audio(data.public_url);
                    audio.preload = 'auto';
                    audio.volume = newPrefs.volume / 100;
                    customBellAudioRef.current = audio;
                  }
                });
            }
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [user]);


  // Load timer preferences from database
  useEffect(() => {
    const loadTimerPreferences = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_preferences')
          .select('session_timer_duration, session_timer_enabled, show_timer_debug')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          const duration = data.session_timer_duration || 1500;
          const minutes = Math.floor(duration / 60);
          setInputMinutes(minutes.toString());
          setLastSetDuration(duration); // Remember the saved duration
          setShowDebug(data.show_timer_debug || false);

          if (data.session_timer_enabled) {
            setTimerDuration(duration);
            setRemainingTime(duration);
            setIsTimerActive(true);
          } else {
            // Even if timer is not active, show the last set duration
            setRemainingTime(duration);
          }
        }
      } catch (error) {
      } finally {
        setIsLoading(false);
      }
    };

    loadTimerPreferences();
  }, [user]);

  // Subscribe to debug preference changes
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('timer-debug-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_preferences',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new && 'show_timer_debug' in payload.new) {
            setShowDebug(payload.new.show_timer_debug);
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [user]);

  // Save timer preferences to database
  const saveTimerPreferences = useCallback(async (duration: number, enabled: boolean) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          session_timer_duration: duration,
          session_timer_enabled: enabled,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });

      if (error) throw error;
    } catch (error) {
    }
  }, [user]);

  const playProgrammaticBell = () => {
    if (!audioContextRef.current) return;

    const ctx = audioContextRef.current;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Create a pleasant bell-like sound
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(800, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.5);

    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 1.5);
  };

  // Play bell sound with user's volume preference
  const playBell = () => {
    // If custom bell is available, play it
    if (customBellAudioRef.current) {
      customBellAudioRef.current.volume = bellVolume / 100;
      customBellAudioRef.current.currentTime = 0;
      customBellAudioRef.current.play().catch(err => {
        // Fall back to programmatic bell if custom fails
        playProgrammaticBell();
      });
      return;
    }

    // If custom bell URL exists but audio ref is not set, create it
    if (customBellUrl) {
      const audio = new Audio(customBellUrl);
      audio.volume = bellVolume / 100;
      customBellAudioRef.current = audio;
      audio.play().catch(err => {
        playProgrammaticBell();
      });
      return;
    }

    // Otherwise use programmatic bell
    playProgrammaticBell();
  };

  // Sync timer state to context
  useEffect(() => {
    setSessionTimer(isTimerActive, remainingTime);
  }, [isTimerActive, remainingTime, setSessionTimer]);

  const handleCancelTimer = useCallback(async () => {
    setIsTimerActive(false);
    setRemainingTime(lastSetDuration); // Reset to last set duration
    setTimerDuration(lastSetDuration);
    hasPlayedStartBell.current = false;
    wasPlayingRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    setShowModal(false); // Close the modal after cancelling
    await saveTimerPreferences(lastSetDuration, false);
  }, [lastSetDuration, saveTimerPreferences]);

  // Track when playback pauses to end timer session
  useEffect(() => {
    if (isTimerActive) {
      if (wasPlayingRef.current && !isPlaying) {
        // Music was paused - ring bell and end the timer session
        playBell();
        handleCancelTimer();
      }
      wasPlayingRef.current = isPlaying;
    }
  }, [isPlaying, isTimerActive, handleCancelTimer]);

  // Timer countdown logic
  useEffect(() => {
    effectRunCount.current += 1;

    if (isTimerActive && isPlaying) {
      // Play start bell when timer starts with playback
      if (!hasPlayedStartBell.current) {
        playBell();
        hasPlayedStartBell.current = true;
      }

      intervalRef.current = window.setInterval(() => {
        setRemainingTime((prev) => {
          if (prev <= 1) {
            // Timer finished - clear interval first
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }

            playBell();

            // Stop music playback
            if (activeChannel) {
              toggleChannel(activeChannel, false, true);
            }

            setIsTimerActive(false);
            hasPlayedStartBell.current = false;

            // Reset to last set duration after completion
            const finalDuration = timerDurationRef.current;

            // Save timer ended state (using captured values to avoid closure issues)
            if (user) {
              supabase
                .from('user_preferences')
                .upsert({
                  user_id: user.id,
                  session_timer_duration: finalDuration,
                  session_timer_enabled: false,
                  updated_at: new Date().toISOString(),
                }, {
                  onConflict: 'user_id',
                })
                .then(() => {})
            }
            return finalDuration;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    } else {
      // Clear interval when paused
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // Reset start bell flag when stopped
      if (!isPlaying) {
        hasPlayedStartBell.current = false;
      }
    }
  }, [isTimerActive, isPlaying, user]);

  const handleSetTimer = async () => {
    const minutes = parseInt(inputMinutes) || 25;
    const seconds = minutes * 60;
    setTimerDuration(seconds);
    timerDurationRef.current = seconds;
    setLastSetDuration(seconds); // Remember this duration
    setRemainingTime(seconds);
    setIsTimerActive(true);
    setShowModal(false);
    hasPlayedStartBell.current = false;
    wasPlayingRef.current = false;

    // If music is already playing, start timer immediately with bell
    if (isPlaying) {
      playBell();
      hasPlayedStartBell.current = true;
      wasPlayingRef.current = true;
    }

    await saveTimerPreferences(seconds, true);
  };

  // Handle Enter key to cancel timer when modal is open and timer is active
  useEffect(() => {
    if (!showModal || !isTimerActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCancelTimer();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModal, isTimerActive, handleCancelTimer]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getDisplayMinutes = (): string => {
    const mins = Math.floor(remainingTime / 60);
    return mins.toString();
  };

  const getBellFileName = (): string => {
    if (customBellUrl) {
      // Extract filename from URL
      try {
        const url = new URL(customBellUrl);
        const pathParts = url.pathname.split('/');
        return pathParts[pathParts.length - 1] || 'custom-bell.mp3';
      } catch {
        return 'custom-bell.mp3';
      }
    }
    return 'default-bell.mp3 (built-in)';
  };

  return (
    <>
      {/* Debug Overlay */}
      {showDebug && (
        <TimerDebugOverlay
          isTimerActive={isTimerActive}
          remainingTime={remainingTime}
          timerDuration={timerDuration}
          isPlaying={isPlaying}
          lastSetDuration={lastSetDuration}
          hasPlayedStartBell={hasPlayedStartBell.current}
          effectRunCount={effectRunCount.current}
          intervalActive={intervalRef.current !== null}
        />
      )}

      {/* Timer Display Button - Console Style */}
      <button
        onClick={() => {
          if (isTimerActive) {
            // Show cancel dialog if timer is active
            setShowModal(true);
          } else {
            // Show setup dialog if timer is not active
            setShowModal(true);
          }
        }}
        className={`px-3 py-1.5 rounded-xl text-lg font-semibold tabular-nums transition-all ${
          isTimerActive && isPlaying
            ? 'bg-blue-50 border-2 border-blue-200 text-blue-700 hover:bg-blue-100 hover:border-blue-300 shadow-sm'
            : isTimerActive && !isPlaying
            ? 'bg-amber-50 border-2 border-amber-300 text-amber-700 hover:bg-amber-100 shadow-sm'
            : 'bg-slate-50 border-2 border-slate-200 text-slate-500 hover:bg-slate-100 hover:border-slate-300 shadow-sm'
        }`}
        title={isTimerActive ? 'Click to cancel timer' : 'Click to set timer'}
      >
        {isTimerActive && remainingTime > 0 ? formatTime(remainingTime) : formatTime(lastSetDuration)}
      </button>

      {/* Timer Settings Modal */}
      {showModal && createPortal(
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4"
          style={{ zIndex: 9999 }}
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900">Session Timer</h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-slate-600" />
              </button>
            </div>

            {isTimerActive ? (
              <div className="space-y-6">
                <div className="text-center">
                  <div className="text-5xl font-bold text-blue-600 mb-2">
                    {formatTime(remainingTime)}
                  </div>
                  <p className="text-slate-600">
                    {isPlaying ? 'Timer is running' : 'Timer is paused'}
                  </p>
                </div>
                <button
                  onClick={handleCancelTimer}
                  className="w-full px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  Cancel Timer
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="text-center space-y-4">
                  <div className="relative">
                    <input
                      type="number"
                      value={inputMinutes}
                      onChange={(e) => setInputMinutes(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSetTimer();
                        }
                      }}
                      min="1"
                      max="180"
                      className="w-full text-center text-5xl font-bold text-blue-600 bg-transparent border-none focus:outline-none focus:ring-0 py-2"
                      placeholder="25"
                    />
                    <div className="text-slate-500 text-sm mt-1">minutes</div>
                  </div>
                  <p className="text-slate-600 text-sm">
                    Set a timer from 1 to 180 minutes
                  </p>
                </div>

                <button
                  onClick={handleSetTimer}
                  className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Set Timer
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

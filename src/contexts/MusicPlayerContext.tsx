import { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { supabase, AudioChannel, AudioTrack, SystemPreferences } from '../lib/supabase';
import { generatePlaylist, EnergyLevel } from '../lib/playlisterService';
import { useAuth } from './AuthContext';
import { trackPlayStart, trackPlayEnd } from '../lib/analyticsService';
import { EnterpriseAudioEngine } from '../lib/enterpriseAudioEngine';
import type { AudioMetrics } from '../lib/enterpriseAudioEngine';
import { createStorageAdapter } from '../lib/storageAdapters';
import { createAudioEngine as routerCreateAudioEngine, type AudioEngineType } from '../player';
import { selectNextTrackCached, getCurrentSlotIndex } from '../lib/slotStrategyEngine';
import { getIosWebkitInfo } from '../lib/iosWebkitDetection';
import type { IAudioEngine, AudioMetrics as StreamingAudioMetrics } from '../lib/types/audioEngine';
import { shouldDisableNextTrackPrefetch } from '../lib/prefetchPolicy';

// Re-export for consistency - both engines produce compatible metrics
type EngineAudioMetrics = AudioMetrics | StreamingAudioMetrics;

// ============================================================================
// ENGINE SELECTION
// ============================================================================

// AudioEngineType is imported from '../player' (router)

/**
 * Get the engine type from environment or local storage.
 * This allows A/B testing and gradual rollout.
 */
function getEngineType(): AudioEngineType {
  // Check environment variable first
  const envEngine = import.meta.env.VITE_AUDIO_ENGINE_TYPE as AudioEngineType;
  if (envEngine && ['legacy', 'streaming', 'ios-safari', 'auto'].includes(envEngine)) {
    return envEngine;
  }

  // Check local storage (for per-user override)
  try {
    const stored = localStorage.getItem('audioEngineType') as AudioEngineType;
    if (stored && ['legacy', 'streaming', 'ios-safari', 'auto'].includes(stored)) {
      return stored;
    }
  } catch {}

  // Default to streaming for all platforms (HLS with MP3 fallback)
  // This provides better resilience, faster starts, and lower memory usage
  return 'streaming';
}

/**
 * Determine if we should use the streaming engine based on platform.
 * Returns true for streaming-based engines (streaming, ios-safari), false for legacy.
 */
function shouldUseStreamingEngine(engineType: AudioEngineType): boolean {
  if (engineType === 'streaming') return true;
  if (engineType === 'ios-safari') return true;
  if (engineType === 'legacy') return false;

  // Auto mode: use streaming on iOS (where buffer issues occur)
  const iosInfo = getIosWebkitInfo();
  return iosInfo.isIOSWebKit;
}

/**
 * Create the appropriate audio engine instance via the router.
 */
function createAudioEngine(engineType: AudioEngineType): IAudioEngine {
  const storageAdapter = createStorageAdapter();
  return routerCreateAudioEngine(storageAdapter, engineType);
}

type ChannelState = {
  isOn: boolean;
  energyLevel: 'low' | 'medium' | 'high';
};

type MusicPlayerContextType = {
  channels: AudioChannel[];
  activeChannel: AudioChannel | null;
  channelStates: Record<string, ChannelState>;
  playlist: AudioTrack[];
  currentTrackIndex: number;
  isPlaying: boolean;
  currentTrack: AudioTrack | undefined;
  isAdminMode: boolean;
  adminPreviewTrack: AudioTrack | null;
  audioEngine: IAudioEngine | null;
  audioMetrics: AudioMetrics | null;
  sessionTimerActive: boolean;
  sessionTimerRemaining: number;
  // Track which channel the current playlist belongs to (prevents stale track display)
  playlistChannelId: string | null;
  // Engine selection (for A/B testing)
  engineType: AudioEngineType;
  isStreamingEngine: boolean;
  setSessionTimer: (active: boolean, remaining: number) => void;
  toggleChannel: (channel: AudioChannel, turnOn: boolean, fromPlayer?: boolean) => Promise<void>;
  setChannelEnergy: (channelId: string, energyLevel: 'low' | 'medium' | 'high') => void;
  loadChannels: () => Promise<void>;
  setAdminPreview: (track: AudioTrack | null, autoPlay?: boolean) => void;
  toggleAdminPlayback: () => void;
  skipTrack: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  // Engine switching (for testing/debugging)
  switchEngine: (type: AudioEngineType) => void;
};

const MusicPlayerContext = createContext<MusicPlayerContextType | undefined>(undefined);

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [channels, setChannels] = useState<AudioChannel[]>([]);
  const [activeChannel, setActiveChannel] = useState<AudioChannel | null>(null);
  const [channelStates, setChannelStates] = useState<Record<string, ChannelState>>({});
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [adminPreviewTrack, setAdminPreviewTrack] = useState<AudioTrack | null>(null);
  const [playlist, setPlaylist] = useState<AudioTrack[]>([]);
  const [allTracks, setAllTracks] = useState<AudioTrack[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  // Track which channel the current playlist belongs to (prevents stale track display during channel switch)
  const [playlistChannelId, setPlaylistChannelId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentPlayEventId, setCurrentPlayEventId] = useState<string | null>(null);
  const [audioEngine, setAudioEngine] = useState<IAudioEngine | null>(null);
  const [audioMetrics, setAudioMetrics] = useState<AudioMetrics | null>(null);
  const [sessionTimerActive, setSessionTimerActive] = useState(false);
  const [sessionTimerRemaining, setSessionTimerRemaining] = useState(0);
  const [systemPreferences, setSystemPreferences] = useState<SystemPreferences | null>(null);
  
  // Engine type state (for A/B testing)
  const [engineType, setEngineType] = useState<AudioEngineType>(() => getEngineType());
  const [isStreamingEngine, setIsStreamingEngine] = useState<boolean>(() => 
    shouldUseStreamingEngine(getEngineType())
  );
  
  const playStartTimeRef = useRef<number>(0);
  const isLoadingTrack = useRef<boolean>(false);
  const lastPlaylistGeneration = useRef<{ channelId: string; energyLevel: string; timestamp: number } | null>(null);
  const lastLoadedTrackId = useRef<string | null>(null);
  const shouldAutoPlayRef = useRef<boolean>(false);
  const slotStrategyCache = useRef<Record<string, any>>({});
  const backgroundLoadAbortController = useRef<AbortController | null>(null);
  const playlistGenerationId = useRef<number>(0);
  const handleTrackEndRef = useRef<(() => void) | null>(null);
  // Playback session ID for E2E test tracking - increments on each new track load
  const playbackSessionIdRef = useRef<number>(0);
  // Fast-start timing (user gesture -> first audible/playing)
  const fastStartRef = useRef<{
    requestedAt: number | null;
    requestContext: { source: string; channelId?: string; energyLevel?: 'low' | 'medium' | 'high' } | null;
    pending: { trackId?: string; playbackSessionId?: number } | null;
    last: {
      requestedAt: number;
      firstPlayingAt: number;
      firstAudioMs: number;
      trackId?: string;
      playbackSessionId?: number;
      channelId?: string;
      energyLevel?: 'low' | 'medium' | 'high';
      source: string;
    } | null;
  }>({ requestedAt: null, requestContext: null, pending: null, last: null });

  // Prefetch debug (tracks next-track prefetch requests even if the engine prewarm fails on slow networks)
  const prefetchDebugRef = useRef<{
    requestedAt: number | null;
    source: 'next-track' | null;
    trackId: string | null;
    filePath: string | null;
  }>({ requestedAt: null, source: null, trackId: null, filePath: null });

  // Next-track prefetch scheduling (prevents slot playlist growth from racing prefetch while buffering)
  const prefetchScheduledForTrackIdRef = useRef<string | null>(null);
  const prefetchCompletedForTrackIdRef = useRef<string | null>(null);
  const prefetchTimerRef = useRef<number | null>(null);

  // Keep latest state for async callbacks (avoid stale-closure bugs in effects/promises).
  const prefetchInputsRef = useRef<{
    isAdminMode: boolean;
    activeChannelId: string | null;
    playlist: typeof playlist;
    currentTrackIndex: number;
  }>({ isAdminMode: false, activeChannelId: null, playlist: [], currentTrackIndex: 0 });
  prefetchInputsRef.current = {
    isAdminMode,
    // Use playlistChannelId when available (it is set immediately after playlist generation),
    // as activeChannel can briefly be null/stale during mobile navigation and channel switches.
    activeChannelId: playlistChannelId ?? activeChannel?.id ?? null,
    playlist,
    currentTrackIndex,
  };

  const requestNextTrackPrefetch = (): boolean => {
    if (!audioEngine) return false;
    const snap = prefetchInputsRef.current;
    if (snap.isAdminMode) return false;
    if (!snap.activeChannelId) return false;
    if (snap.playlist.length === 0) return false;

    const nextTrack = snap.playlist[snap.currentTrackIndex + 1];
    if (nextTrack?.metadata?.track_id && nextTrack.file_path) {
      prefetchDebugRef.current = {
        requestedAt: performance.now(),
        source: 'next-track',
        trackId: String(nextTrack.metadata.track_id),
        filePath: nextTrack.file_path,
      };
      audioEngine.prefetchNextTrack(nextTrack.metadata.track_id, nextTrack.file_path);
      return true;
    }
    return false;
  };

  const getFastStartEnabled = (): boolean => {
    const envEnabled = (import.meta as any)?.env?.VITE_FAST_START_AUDIO;
    if (envEnabled === 'true') return true;
    if (envEnabled === 'false') return false;
    try {
      const ls = localStorage.getItem('fastStartAudio');
      // In dev, default ON (unless explicitly disabled) so localhost matches intended behavior.
      // In prod, default OFF unless explicitly enabled.
      const isDev = Boolean((import.meta as any)?.env?.DEV);
      if (isDev) {
        if (ls === '0') return false;
        if (ls === '1') return true;
        return true;
      }
      return ls === '1';
    } catch {
      return false;
    }
  };
  const fastStartEnabledRef = useRef<boolean>(getFastStartEnabled());

  // Keep fast-start flag in sync (useful on localhost when toggling localStorage).
  useEffect(() => {
    const refresh = () => {
      fastStartEnabledRef.current = getFastStartEnabled();
    };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const startFastStartTimer = (source: string, channelId?: string, energyLevel?: 'low' | 'medium' | 'high') => {
    // Only track user-gesture starts (not auto-advance, not background loads)
    fastStartRef.current.requestedAt = performance.now();
    fastStartRef.current.requestContext = { source, channelId, energyLevel };
    fastStartRef.current.pending = null;
  };

  // First-track cache for fast-start (in-memory, per-session)
  // Note: `prewarmedAt` is only set once the audio engine has actually prewarmed the HLS pipeline.
  const firstTrackCacheRef = useRef<Map<string, { track: AudioTrack; warmedAt: number; prewarmedAt: number | null }>>(new Map());
  const firstTrackWarmupInFlightRef = useRef<Map<string, Promise<void>>>(new Map());

  const firstTrackCacheKey = (channelId: string, energyLevel: 'low' | 'medium' | 'high') => `${channelId}:${energyLevel}`;

  const warmFirstTrack = async (channel: AudioChannel, energyLevel: 'low' | 'medium' | 'high') => {
    if (!user) return;
    if (!fastStartEnabledRef.current) return;

    const key = firstTrackCacheKey(channel.id, energyLevel);
    const cached = firstTrackCacheRef.current.get(key);
    const engineAny = audioEngine as any;
    // If we already have the first track cached recently, we still might need to prewarm it
    // (e.g. cache populated before the audio engine finished initializing).
    if (cached && (Date.now() - cached.warmedAt) < 5 * 60 * 1000) {
      if (!cached.prewarmedAt && engineAny && typeof engineAny.prewarmTrack === 'function') {
        try {
          await engineAny.prewarmTrack(cached.track.track_id, cached.track.file_path, { preferHLS: true, startLevel: 0 });
          firstTrackCacheRef.current.set(key, { track: cached.track, warmedAt: Date.now(), prewarmedAt: Date.now() });
        } catch {
          // ignore
        }
      }
      return;
    }

    const existingInFlight = firstTrackWarmupInFlightRef.current.get(key);
    if (existingInFlight) return existingInFlight;

    const work = (async () => {
      try {
        const strategyConfig = channel.playlist_strategy?.[energyLevel];
        const channelStrategy = strategyConfig?.strategy;

        if (channelStrategy === 'slot_based') {
          const cachedStrategy = await preloadSlotStrategy(channel.id, energyLevel);
          if (!cachedStrategy?.strategy) return;

          const numSlots = cachedStrategy.strategy.num_slots || 20;

          // Approximate the true start position (so warmed track matches what the user will hear)
          let startPosition = 0;
          const playbackContinuation = strategyConfig?.playbackContinuation || 'continue';
          if (playbackContinuation !== 'restart_login') {
            const { data: playbackState } = await supabase
              .from('user_playback_state')
              .select('last_position')
              .eq('user_id', user.id)
              .eq('channel_id', channel.id)
              .eq('energy_level', energyLevel)
              .maybeSingle();
            if (playbackState?.last_position !== undefined && playbackState?.last_position !== null) {
              startPosition = playbackState.last_position;
            }
          }

          const firstSlotIndex = getCurrentSlotIndex(startPosition, numSlots);
          const history: string[] = [];
          const firstResult = await selectNextTrackCached(supabase, {
            channelId: channel.id,
            energyTier: energyLevel,
            slotIndex: firstSlotIndex,
            history,
            cachedStrategy,
          });
          if (!firstResult) return;

          const { data: firstTrack } = await supabase
            .from('audio_tracks')
            .select('*')
            .eq('id', firstResult.id)
            .is('deleted_at', null)
            .maybeSingle();
          if (!firstTrack?.file_path) return;

          // Cache immediately (so UI can use the first track), but mark prewarm separately.
          firstTrackCacheRef.current.set(key, { track: firstTrack as AudioTrack, warmedAt: Date.now(), prewarmedAt: null });
          if (engineAny && typeof engineAny.prewarmTrack === 'function') {
            await engineAny.prewarmTrack((firstTrack as AudioTrack).track_id, firstTrack.file_path, { preferHLS: true, startLevel: 0 });
            firstTrackCacheRef.current.set(key, { track: firstTrack as AudioTrack, warmedAt: Date.now(), prewarmedAt: Date.now() });
          }
          return;
        }

        // Non-slot strategies: warm the first track via playlister service.
        const playlistResponse = await generatePlaylist({
          channelId: channel.id,
          energyLevel: energyLevel as EnergyLevel,
          userId: user.id,
          strategy: channelStrategy || 'weighted',
        });
        const firstTrackId = playlistResponse.trackIds?.[0];
        if (!firstTrackId) return;

        const { data: firstTrack } = await supabase
          .from('audio_tracks')
          .select('*')
          .eq('track_id', firstTrackId)
          .is('deleted_at', null)
          .maybeSingle();
        if (!firstTrack?.file_path) return;

        firstTrackCacheRef.current.set(key, { track: firstTrack as AudioTrack, warmedAt: Date.now(), prewarmedAt: null });
        if (engineAny && typeof engineAny.prewarmTrack === 'function') {
          await engineAny.prewarmTrack((firstTrack as AudioTrack).track_id, firstTrack.file_path, { preferHLS: true, startLevel: 0 });
          firstTrackCacheRef.current.set(key, { track: firstTrack as AudioTrack, warmedAt: Date.now(), prewarmedAt: Date.now() });
        }
      } finally {
        firstTrackWarmupInFlightRef.current.delete(key);
      }
    })();

    firstTrackWarmupInFlightRef.current.set(key, work);
    return work;
  };

  // Initialize Web Audio Engine (runs ONCE on mount, never again)
  useEffect(() => {
    const useStreaming = shouldUseStreamingEngine(engineType);
    setIsStreamingEngine(useStreaming);
    
    console.log('[AUDIO ENGINE] Creating audio engine', {
      engineType,
      useStreaming,
      shouldOnlyHappenOnce: 'once in production, twice in dev due to StrictMode'
    });

    // Create the appropriate audio engine based on configuration
    const engine = createAudioEngine(engineType);

    // Set up callbacks using refs to avoid stale closures
    engine.setCallbacks({
      onTrackLoad: (trackId, duration) => {
      },
      onTrackEnd: () => {
        if (handleTrackEndRef.current) {
          handleTrackEndRef.current();
        }
      },
      onDiagnosticsUpdate: (metrics) => {
        // Cast to AudioMetrics for state compatibility (both engine types have compatible metrics)
        setAudioMetrics(metrics as AudioMetrics);
      },
      onError: (error, category, canRetry) => {
        console.error(`Audio error [${category}]:`, error.message, canRetry ? '(retrying)' : '(fatal)');
      },
    });

    setAudioEngine(engine);

    // Subscribe to channel updates for real-time display_order changes
    const channelSubscription = supabase
      .channel('audio_channels_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'audio_channels'
        },
        () => {
          loadChannels();
        }
      )
      .subscribe();

    return () => {
      console.log('[AUDIO ENGINE] Destroying audio engine (should only happen on unmount or engine switch)');
      engine.destroy();
      channelSubscription.unsubscribe();
    };
  }, [engineType]); // Recreate engine when engineType changes

  // Load system preferences and subscribe to changes
  useEffect(() => {
    const loadSystemPreferences = async () => {
      const { data } = await supabase
        .from('system_preferences')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (data) {
        setSystemPreferences(data as SystemPreferences);
      }
    };

    loadSystemPreferences();

    // Subscribe to realtime changes
    const preferencesSubscription = supabase
      .channel('system_preferences_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'system_preferences'
        },
        (payload) => {
          setSystemPreferences(payload.new as SystemPreferences);
        }
      )
      .subscribe();

    return () => {
      preferencesSubscription.unsubscribe();
    };
  }, []);

  // Initialize app data (separate from audio engine creation)
  useEffect(() => {
    const initializeApp = async () => {
      await loadChannels();
      await loadTracks();
      if (user) {
        await loadLastChannel();
        await incrementSessionCount();
      }
    };

    initializeApp();
  }, [user]); // Re-run when user changes (login/logout)

  // Fast-start warm-up: precompute first tracks for likely actions.
  // Heuristic: active channel + first few visible cards (one energy each), limited fan-out.
  useEffect(() => {
    if (!user) return;
    if (!fastStartEnabledRef.current) return;
    if (channels.length === 0) return;
    if (!audioEngine) return;

    const warmCandidates: AudioChannel[] = [];
    if (activeChannel) warmCandidates.push(activeChannel);

    for (const ch of channels) {
      if (warmCandidates.length >= 8) break; // active + first 7 cards (covers visible grid on desktop)
      if (activeChannel && ch.id === activeChannel.id) continue;
      warmCandidates.push(ch);
    }

    (async () => {
      for (const ch of warmCandidates) {
        const energy = channelStates[ch.id]?.energyLevel ?? 'medium';
        // Sequential to avoid saturating the network on mobile/tethered connections.
        // Each warmFirstTrack has its own de-dupe via firstTrackWarmupInFlightRef anyway.
        // eslint-disable-next-line no-await-in-loop
        await warmFirstTrack(ch, energy);
      }
    })().catch(() => {});
  }, [user, channels, activeChannel, audioEngine, channelStates]);

  // Control crossfading based on admin mode
  useEffect(() => {
    if (!audioEngine) return;

    // Disable crossfading in admin mode for instant playback
    audioEngine.setCrossfadeEnabled(!isAdminMode);
  }, [audioEngine, isAdminMode]);

  // Generate new playlist when channel or tracks change
  // Note: Energy level changes are handled separately via setChannelEnergy
  useEffect(() => {
    // Playlist generation does not require `allTracks` to be loaded.
    // Waiting for the full `audio_tracks` table can delay first playback.
    if (activeChannel && user) {
      const channelState = channelStates[activeChannel.id];

      // Don't generate playlist if channel isn't turned on yet
      if (!channelState?.isOn) {
        return;
      }

      const energyLevel = channelState?.energyLevel || 'medium';
      const key = `${activeChannel.id}-${energyLevel}`;

      // Only generate if we haven't generated for this channel+energy combo in the last 1 second
      const lastGen = lastPlaylistGeneration.current;
      const now = Date.now();
      if (lastGen && lastGen.channelId === activeChannel.id && lastGen.energyLevel === energyLevel && (now - lastGen.timestamp) < 1000) {
        return;
      }

      lastPlaylistGeneration.current = { channelId: activeChannel.id, energyLevel, timestamp: now };
      generateNewPlaylist();
    }
  }, [activeChannel, user, channelStates]);

  // Load and play track when index changes or admin preview changes
  useEffect(() => {
    if (!audioEngine) return;

    const loadAndPlay = async () => {
      if (isLoadingTrack.current) {
        return;
      }

      const track = isAdminMode ? adminPreviewTrack : playlist[currentTrackIndex];
      const trackId = track?.metadata?.track_id?.toString();


      if (!trackId) {
        return;
      }

      // Skip if we're trying to load the same track that's already loaded
      if (lastLoadedTrackId.current === trackId) {
        return;
      }

      // Check if we need to load more tracks (buffer check for slot-based playlists)
      if (!isAdminMode && activeChannel && playlist.length > 0) {
        const tracksRemaining = playlist.length - currentTrackIndex;
        if (tracksRemaining <= 2) {
          loadMoreTracksForSlotPlaylist();
        }
      }

      isLoadingTrack.current = true;
      lastLoadedTrackId.current = trackId;
      // Increment playback session ID for E2E test tracking
      playbackSessionIdRef.current += 1;

      // If a user-gesture fast-start request is active, latch the next track/session.
      if (fastStartRef.current.requestedAt && !fastStartRef.current.pending) {
        fastStartRef.current.pending = {
          trackId: track.track_id,
          playbackSessionId: playbackSessionIdRef.current,
        };
      }

      try {
        // Validate track has required data before attempting to load
        if (!track.track_id) {
          isLoadingTrack.current = false;
          return;
        }

        // End previous track analytics
        if (currentPlayEventId && !isAdminMode) {
          const playDuration = (Date.now() - playStartTimeRef.current) / 1000;
          await trackPlayEnd(
            currentPlayEventId,
            playDuration,
            false,
            audioEngine.getCurrentTime()
          );
          setCurrentPlayEventId(null);
        }

        // Load new track using file_path (storage adapter will handle URL generation)
        if (!track.file_path) {
          throw new Error(`Track ${track.track_id} missing file_path`);
        }

        await audioEngine.loadTrack(track.track_id, track.file_path, {
          trackName: track.track_name,
          artistName: track.artist_name,
        });

        // Start analytics for non-admin tracks
        if (!isAdminMode && track.track_id) {
          playStartTimeRef.current = Date.now();
          const eventId = await trackPlayStart(
            track.track_id,
            track.duration_seconds || 0,
            user?.id,
            activeChannel?.id,
            currentSessionId || undefined
          );
          if (eventId) {
            setCurrentPlayEventId(eventId);
          }
        }

        // Auto-play if should be playing or if autoPlay was requested
        if (isPlaying || shouldAutoPlayRef.current) {
          shouldAutoPlayRef.current = false;
          setIsPlaying(true);
          await audioEngine.play();
        }
      } catch (error) {
        console.log('[AUDIO][CELLBUG][CONTEXT] Track load failed:', error);
        
        // [CELLBUG FIX] Don't immediately skip on load failure - may be transient network issue
        // Instead, retry the same track a few times before giving up
        if (!isAdminMode && playlist.length > 0) {
          // Track consecutive load failures for this track
          const failureKey = `loadFailures_${trackId}`;
          const currentFailures = (window as any)[failureKey] || 0;
          const maxFailures = 3;  // Allow 3 attempts before skipping
          
          console.log('[AUDIO][CELLBUG][CONTEXT] Load failure', {
            trackId,
            attempt: currentFailures + 1,
            maxAttempts: maxFailures,
          });
          
          if (currentFailures < maxFailures - 1) {
            // Retry the same track after a delay
            (window as any)[failureKey] = currentFailures + 1;
            lastLoadedTrackId.current = null;  // Allow reload
            
            const retryDelay = (currentFailures + 1) * 3000;  // 3s, 6s, 9s...
            console.log('[AUDIO][CELLBUG][CONTEXT] Retrying same track in', retryDelay, 'ms');
            
            setTimeout(() => {
              // Re-trigger load by updating a dummy state or just letting the effect re-run
              // Force re-render by toggling a ref won't work, so we clear and let effect re-run
              lastLoadedTrackId.current = null;
              isLoadingTrack.current = false;
              // The useEffect will re-run because isLoadingTrack is now false
            }, retryDelay);
          } else {
            // Exhausted retries - skip to next track
            console.log('[AUDIO][CELLBUG][CONTEXT] Exhausted retries, skipping to next track');
            (window as any)[failureKey] = 0;  // Reset for next track
            lastLoadedTrackId.current = null;

            // Move to next track after a brief delay
            setTimeout(() => {
              if (currentTrackIndex < playlist.length - 1) {
                setCurrentTrackIndex(prev => prev + 1);
              } else {
                setCurrentTrackIndex(0);
              }
            }, 1000);
          }
        }
      } finally {
        isLoadingTrack.current = false;
      }
    };

    loadAndPlay();
  }, [audioEngine, playlist, currentTrackIndex, isAdminMode, adminPreviewTrack]);

  // Handle play/pause state changes independently
  useEffect(() => {
    if (!audioEngine) return;
    if (isLoadingTrack.current) {
      return;
    }

    const currentlyPlaying = audioEngine.isPlaying();
    const hasBuffer = audioEngine.getDuration() > 0;

    console.log('[SYNC EFFECT] Checking sync:', {
      isPlaying,
      currentlyPlaying,
      hasBuffer
    });

    if (isPlaying && !currentlyPlaying && hasBuffer) {
      console.log('[SYNC EFFECT] Calling audioEngine.play()');
      audioEngine
        .play()
        .then(() => {})
        .catch(() => {});
    } else if (!isPlaying && currentlyPlaying) {
      console.log('[SYNC EFFECT] Calling audioEngine.pause()');
      audioEngine.pause();
    }
  }, [isPlaying, audioEngine]);

  // When playback is actually underway, ensure we request next-track prefetch.
  // This covers all start paths (including fast-start's playPrewarmedTrack) without relying on UI timing.
  useEffect(() => {
    if (!audioEngine) return;
    if (!isPlaying) return;
    if (!audioMetrics) return;
    // Prefetch must not run while the current track is genuinely stalled.
    // However, on mobile emulation + some slow starts, metrics can stay at "buffering"
    // even though audio is already progressing. We allow prefetch once playback is actually advancing.
    const muted = Boolean((audioMetrics as any)?.muted);
    const engineTime = (() => {
      try {
        return audioEngine.getCurrentTime?.() ?? 0;
      } catch {
        return 0;
      }
    })();
    const hasAudioProgress = engineTime > 0.5;
    const canPrefetchNow =
      audioMetrics.playbackState === 'playing' ||
      // Metrics can remain "buffering" even while audio is actually progressing (especially in mobile emulation).
      // Use "audio time is advancing" as the reliable indicator that we aren't stalled.
      (muted === false && hasAudioProgress);
    if (!canPrefetchNow) {
      if (prefetchTimerRef.current) {
        clearTimeout(prefetchTimerRef.current);
        prefetchTimerRef.current = null;
      }
      prefetchScheduledForTrackIdRef.current = null;
      return;
    }

    const currentTrackId = audioMetrics.currentTrackId ?? null;
    if (!currentTrackId) return;
    if (prefetchCompletedForTrackIdRef.current === currentTrackId) return;
    if (prefetchScheduledForTrackIdRef.current === currentTrackId) return;

    prefetchScheduledForTrackIdRef.current = currentTrackId;
    prefetchTimerRef.current = window.setTimeout(() => {
      const issued = requestNextTrackPrefetch();
      if (issued) {
        prefetchCompletedForTrackIdRef.current = currentTrackId;
      } else {
        // No next track yet (common for slot-based playlists at startup) — allow retry on subsequent renders.
        prefetchScheduledForTrackIdRef.current = null;
      }
      prefetchTimerRef.current = null;
    }, 1200);
  }, [
    audioEngine,
    isPlaying,
    audioMetrics?.playbackState,
    (audioMetrics as any)?.muted,
    // Re-run when time advances so we can schedule prefetch even if playbackState stays "buffering" on mobile.
    (audioMetrics as any)?.currentTime,
    audioMetrics?.currentTrackId,
    playlist,
    currentTrackIndex,
  ]);

  // Cleanup scheduled prefetch timer on unmount.
  useEffect(() => {
    return () => {
      if (prefetchTimerRef.current) {
        clearTimeout(prefetchTimerRef.current);
        prefetchTimerRef.current = null;
      }
    };
  }, []);

  // Finalize fast-start timing when the engine first reaches "playing" for the requested track.
  useEffect(() => {
    const requestedAt = fastStartRef.current.requestedAt;
    if (!requestedAt) return;
    if (!audioMetrics) return;
    if (audioMetrics.playbackState !== 'playing') return;

    const pendingTrackId = fastStartRef.current.pending?.trackId;
    if (pendingTrackId && audioMetrics.currentTrackId && audioMetrics.currentTrackId !== pendingTrackId) {
      return;
    }

    const firstPlayingAt = performance.now();
    const firstAudioMs = Math.max(0, firstPlayingAt - requestedAt);
    const ctx = fastStartRef.current.requestContext;

    fastStartRef.current.last = {
      requestedAt,
      firstPlayingAt,
      firstAudioMs,
      trackId: pendingTrackId ?? audioMetrics.currentTrackId ?? undefined,
      playbackSessionId: fastStartRef.current.pending?.playbackSessionId,
      channelId: ctx?.channelId,
      energyLevel: ctx?.energyLevel,
      source: ctx?.source ?? 'unknown',
    };

    // Clear the active request so stalls/rebuffer doesn't overwrite the first measurement.
    fastStartRef.current.requestedAt = null;
    fastStartRef.current.requestContext = null;
    fastStartRef.current.pending = null;
  }, [audioMetrics]);

  const handleTrackEnd = async () => {
    if (isAdminMode) return;

    // Update playback position for slot sequencer
    const energyLevel = channelStates[activeChannel?.id || '']?.energyLevel || 'medium';
    const strategyConfig = activeChannel?.playlist_strategy?.[energyLevel];
    if (strategyConfig?.strategy === 'slot_based' && user) {
      const { data: playbackState } = await supabase
        .from('user_playback_state')
        .select('last_position')
        .eq('user_id', user.id)
        .eq('channel_id', activeChannel.id)
        .eq('energy_level', channelStates[activeChannel.id]?.energyLevel || 'medium')
        .maybeSingle();

      if (playbackState) {
        const nextPosition = playbackState.last_position + 1;
        const nextTrack = playlist[currentTrackIndex + 1];

        await supabase
          .from('user_playback_state')
          .update({
            last_position: nextPosition,
            last_track_id: nextTrack?.metadata?.track_id || '',
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id)
          .eq('channel_id', activeChannel.id)
          .eq('energy_level', channelStates[activeChannel.id]?.energyLevel || 'medium');
      }
    }

    // Continuous playback code removed here - always restart playlist
    if (currentTrackIndex < playlist.length - 1) {
      // Not at end of playlist, move to next track
      setCurrentTrackIndex(prev => prev + 1);
    } else {
      // At end of playlist - restart from beginning (including single-track playlists)
      // Clear lastLoadedTrackId to allow the same track to reload
      lastLoadedTrackId.current = null;
      
      if (playlist.length === 1) {
        // Single-track playlist: force reload by triggering the loadAndPlay effect
        // Since setCurrentTrackIndex(0) won't change state (already 0), we need to
        // manually trigger the track load
        const track = playlist[0];
        if (track && audioEngine) {
          isLoadingTrack.current = true;
          playbackSessionIdRef.current += 1;
          
          audioEngine.loadTrack(track.track_id, track.file_path, {
            trackName: track.track_name,
            artistName: track.artist_name,
          }).then(() => {
            lastLoadedTrackId.current = track.metadata?.track_id?.toString() || null;
            if (isPlaying) {
              audioEngine.play();
            }
          }).finally(() => {
            isLoadingTrack.current = false;
          });
        }
      } else {
        setCurrentTrackIndex(0);
      }
    }
  };

  // Update the ref whenever handleTrackEnd changes
  useEffect(() => {
    handleTrackEndRef.current = handleTrackEnd;
  });

  const loadChannels = async () => {
    const { data } = await supabase
      .from('audio_channels')
      .select('*')
      .order('display_order');
    if (data) {
      setChannels(data);

      // If there's an active channel, update it with fresh data
      if (activeChannel) {
        const updatedActiveChannel = data.find(ch => ch.id === activeChannel.id);
        if (updatedActiveChannel) {
          setActiveChannel(updatedActiveChannel);
        }
      }
    }
  };

  const loadTracks = async () => {
    const { data, error } = await supabase
      .from('audio_tracks')
      .select('*');

    if (error) {
      return;
    }

    if (data) {
      setAllTracks(data);
    }
  };

  const loadLastChannel = async () => {
    if (!user) return;

    const { data: userPreference } = await supabase
      .from('user_preferences')
      .select('last_channel_id, channel_energy_levels, last_energy_level')
      .eq('user_id', user.id)
      .maybeSingle();

    if (userPreference?.last_channel_id) {
      const { data: channel } = await supabase
        .from('audio_channels')
        .select('*')
        .eq('id', userPreference.last_channel_id)
        .single();

      if (channel) {
        const savedEnergyLevels = userPreference.channel_energy_levels || {};
        const channelEnergy = savedEnergyLevels[channel.id] || userPreference.last_energy_level || 'medium';

        setActiveChannel(channel);
        setChannelStates(prev => ({
          ...prev,
          [channel.id]: {
            isOn: false,
            energyLevel: channelEnergy as 'low' | 'medium' | 'high'
          }
        }));
        return;
      }
    }

    const { data: firstChannel } = await supabase
      .from('audio_channels')
      .select('*')
      .order('channel_number')
      .limit(1)
      .maybeSingle();

    if (firstChannel) {
      setActiveChannel(firstChannel);
      setChannelStates(prev => ({
        ...prev,
        [firstChannel.id]: {
          isOn: false,
          energyLevel: 'medium'
        }
      }));

      await supabase
        .from('user_preferences')
        .upsert(
          {
            user_id: user.id,
            last_channel_id: firstChannel.id
          },
          {
            onConflict: 'user_id'
          }
        );
    }
  };

  const incrementSessionCount = async () => {
    if (!user) return;

    const { data: currentPrefs } = await supabase
      .from('user_preferences')
      .select('session_count')
      .eq('user_id', user.id)
      .maybeSingle();

    const currentCount = currentPrefs?.session_count || 0;

    await supabase
      .from('user_preferences')
      .upsert(
        {
          user_id: user.id,
          session_count: currentCount + 1
        },
        {
          onConflict: 'user_id'
        }
      );
  };

  const saveLastChannel = async (channelId: string) => {
    if (!user) return;

    await supabase
      .from('user_preferences')
      .upsert(
        {
          user_id: user.id,
          last_channel_id: channelId
        },
        {
          onConflict: 'user_id'
        }
      );
  };

  const loadMoreTracksForSlotPlaylist = async () => {
    if (!activeChannel || !user) return;

    const channelState = channelStates[activeChannel.id];
    const energyLevel = channelState?.energyLevel || 'medium';

    const strategyConfig = activeChannel.playlist_strategy?.[energyLevel];
    if (strategyConfig?.strategy !== 'slot_based') return;


    // Get cached strategy
    const cacheKey = `${activeChannel.id}:${energyLevel}`;
    const cachedStrategy = slotStrategyCache.current[cacheKey];
    if (!cachedStrategy?.strategy) return;

    const numSlots = cachedStrategy.strategy.num_slots || 20;

    // Get current playback state to know where we are
    const { data: playbackState } = await supabase
      .from('user_playback_state')
      .select('*')
      .eq('user_id', user.id)
      .eq('channel_id', activeChannel.id)
      .eq('energy_level', energyLevel)
      .maybeSingle();

    if (!playbackState) return;

    const currentPosition = playbackState.last_position + playlist.length;
    const history = playlist.map(t => t.metadata?.track_id).filter(Boolean) as string[];

    // Load next 3 tracks
    const newTracks: AudioTrack[] = [];
    for (let i = 0; i < 3; i++) {
      const absolutePosition = currentPosition + i;
      const slotIndex = getCurrentSlotIndex(absolutePosition, numSlots);

      const result = await selectNextTrackCached(supabase, {
        channelId: activeChannel.id,
        energyTier: energyLevel,
        slotIndex,
        history,
        cachedStrategy,
      });

      if (result) {
        const { data: track } = await supabase
          .from('audio_tracks')
          .select('*')
          .eq('id', result.id)
          .is('deleted_at', null)
          .maybeSingle();

        if (track) {
          newTracks.push(track);
          history.push(result.trackId);
        }
      }
    }

    if (newTracks.length > 0) {
      setPlaylist(prev => [...prev, ...newTracks]);
    }
  };

  const generateNewPlaylist = async (overrideEnergyLevel?: 'low' | 'medium' | 'high', forceRestart = false) => {
    if (!activeChannel || !user) return;

    const channelState = channelStates[activeChannel.id];
    const energyLevel = overrideEnergyLevel || channelState?.energyLevel || 'medium';


    // Update the ref to track this generation
    lastPlaylistGeneration.current = { channelId: activeChannel.id, energyLevel, timestamp: Date.now() };

    // Check if channel uses slot-based strategy
    const strategyConfig = activeChannel.playlist_strategy?.[energyLevel];
    const channelStrategy = strategyConfig?.strategy;

    if (channelStrategy === 'slot_based') {

      // Get strategy from cache or load it
      const cacheKey = `${activeChannel.id}:${energyLevel}`;
      let cachedStrategy = slotStrategyCache.current[cacheKey];

      // If not cached, preload it now
      if (!cachedStrategy) {
        cachedStrategy = await preloadSlotStrategy(activeChannel.id, energyLevel);
      } else {
      }

      if (!cachedStrategy?.strategy) {
        return;
      }

      const numSlots = cachedStrategy.strategy.num_slots || 20;
      const playbackContinuation = strategyConfig?.playbackContinuation || 'continue';

      // Determine starting position based on playback continuation setting
      let startPosition = 0;
      let sessionId = crypto.randomUUID();

      if (!forceRestart && playbackContinuation !== 'restart_login') {
        // Check for existing playback state
        const { data: playbackState } = await supabase
          .from('user_playback_state')
          .select('*')
          .eq('user_id', user.id)
          .eq('channel_id', activeChannel.id)
          .eq('energy_level', energyLevel)
          .maybeSingle();

        if (playbackState) {
          if (playbackContinuation === 'continue') {
            // Continue from last position across all sessions
            startPosition = playbackState.last_position;
            sessionId = playbackState.session_id;
          } else if (playbackContinuation === 'restart_session') {
            // Continue within the same session
            startPosition = playbackState.last_position;
            sessionId = playbackState.session_id;
          }
        }
      }

      // Cancel any previous background loading
      if (backgroundLoadAbortController.current) {
        backgroundLoadAbortController.current.abort();
      }

      // Create new generation ID to track this request
      const currentGenerationId = ++playlistGenerationId.current;

      const history: string[] = [];
      const generatedTracks: AudioTrack[] = [];


      // Generate ONLY the first track to start playback immediately
      const firstSlotIndex = getCurrentSlotIndex(startPosition, numSlots);
      const firstResult = await selectNextTrackCached(supabase, {
        channelId: activeChannel.id,
        energyTier: energyLevel,
        slotIndex: firstSlotIndex,
        history,
        cachedStrategy,
      });

      // Check if this generation was superseded
      if (currentGenerationId !== playlistGenerationId.current) {
        return;
      }

      if (firstResult) {
        const { data: firstTrack } = await supabase
          .from('audio_tracks')
          .select('*')
          .eq('id', firstResult.id)
          .is('deleted_at', null)
          .maybeSingle();

        if (firstTrack) {
          generatedTracks.push(firstTrack);
          history.push(firstResult.trackId);
        }
      }


      // Set up abort controller for background loading
      const abortController = new AbortController();
      backgroundLoadAbortController.current = abortController;

      // Set initial playlist with first track immediately
      setPlaylist(generatedTracks);
      setPlaylistChannelId(activeChannel.id);
      setCurrentTrackIndex(0);

      // Force track reload by clearing lastLoadedTrackId
      lastLoadedTrackId.current = null;

      // Save/update playback state
      if (generatedTracks.length > 0) {
        await supabase
          .from('user_playback_state')
          .upsert({
            user_id: user.id,
            channel_id: activeChannel.id,
            energy_level: energyLevel,
            last_track_id: generatedTracks[0].metadata?.track_id || '',
            last_position: startPosition,
            session_id: sessionId,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,channel_id,energy_level'
          });
      }

      // Load additional tracks sequentially in background
      (async () => {
        const initialBufferSize = 5;
        for (let i = 1; i < initialBufferSize; i++) {
          if (abortController.signal.aborted || currentGenerationId !== playlistGenerationId.current) break;

          const absolutePosition = startPosition + i;
          const slotIndex = getCurrentSlotIndex(absolutePosition, numSlots);

          const result = await selectNextTrackCached(supabase, {
            channelId: activeChannel.id,
            energyTier: energyLevel,
            slotIndex,
            history,
            cachedStrategy,
          });

          if (abortController.signal.aborted || currentGenerationId !== playlistGenerationId.current) break;

          if (result) {
            const { data: track } = await supabase
              .from('audio_tracks')
              .select('*')
              .eq('id', result.id)
              .is('deleted_at', null)
              .maybeSingle();

            if (track && !abortController.signal.aborted && currentGenerationId === playlistGenerationId.current) {
              generatedTracks.push(track);
              history.push(result.trackId);
              setPlaylist([...generatedTracks]);
            }
          }
        }
      })();

      await supabase.from('playlists').insert({
        user_id: user.id,
        channel_id: activeChannel.id,
        energy_level: energyLevel,
        track_sequence: generatedTracks.map(t => t.metadata?.track_id).filter(Boolean),
      });

      return;
    }

    const playlistResponse = await generatePlaylist({
      channelId: activeChannel.id,
      energyLevel: energyLevel as EnergyLevel,
      userId: user.id,
      strategy: channelStrategy || 'weighted',
    });


    // Fetch the specific tracks from the database
    const { data: playlistTracks, error } = await supabase
      .from('audio_tracks')
      .select('*')
      .in('track_id', playlistResponse.trackIds)
      .is('deleted_at', null);

    if (error || !playlistTracks || playlistTracks.length === 0) {
      return;
    }


    // Reorder tracks to match the order of trackIds
    const orderedTracks = playlistResponse.trackIds
      .map(trackId => playlistTracks.find(t => t.metadata?.track_id === trackId))
      .filter((t): t is AudioTrack => t !== undefined);

    setPlaylist(orderedTracks);
    setPlaylistChannelId(activeChannel.id);
    setCurrentTrackIndex(0);

    await supabase.from('playlists').insert({
      user_id: user.id,
      channel_id: activeChannel.id,
      energy_level: energyLevel,
      track_sequence: playlistResponse.trackIds,
    });
  };

  // Preload slot strategy data to cache for fast first track selection
  const preloadSlotStrategy = async (channelId: string, energyLevel: 'low' | 'medium' | 'high') => {
    const cacheKey = `${channelId}:${energyLevel}`;


    // Return cached data if available
    if (slotStrategyCache.current[cacheKey]) {
      return slotStrategyCache.current[cacheKey];
    }

    try {
      // First, load the strategy
      const { data: strategy, error: strategyError } = await supabase
        .from('slot_strategies')
        .select('*')
        .eq('channel_id', channelId)
        .eq('energy_tier', energyLevel)
        .maybeSingle();

      if (strategyError || !strategy) {
        return null;
      }


      // Then load all related data in parallel using the strategy_id
      const [definitionsResult, ruleGroupsResult] = await Promise.all([
        supabase
          .from('slot_definitions')
          .select('*')
          .eq('strategy_id', strategy.id)
          .order('index'),

        supabase
          .from('slot_rule_groups')
          .select(`
            *,
            rules:slot_rules(*)
          `)
          .eq('strategy_id', strategy.id)
          .order('order')
      ]);

      // Load boosts for all definitions
      const definitionIds = definitionsResult.data?.map(d => d.id) || [];
      const { data: boosts } = await supabase
        .from('slot_boosts')
        .select('*')
        .in('slot_definition_id', definitionIds);

      const cachedData = {
        strategy: {
          ...strategy,
          definitions: definitionsResult.data || [],
          boosts: boosts || []
        },
        ruleGroups: ruleGroupsResult.data || [],
        timestamp: Date.now()
      };

      slotStrategyCache.current[cacheKey] = cachedData;
      return cachedData;
    } catch (error) {
    }

    return null;
  };

  const toggleChannel = async (channel: AudioChannel, turnOn: boolean, fromPlayer: boolean = false) => {
    console.log('[DIAGNOSTIC] toggleChannel called:', {
      channelName: channel.name,
      turnOn,
      fromPlayer,
      currentIsPlaying: isPlaying,
      activeChannelId: activeChannel?.id
    });

    if (turnOn) {
      // [iOS FIX] Unlock audio context SYNCHRONOUSLY before any async operations.
      // iOS requires play() to be called directly from user gesture - this "unlocks"
      // the audio context so subsequent play() calls work even after DB queries.
      if (audioEngine?.unlockIOSAudio) {
        audioEngine.unlockIOSAudio();
      }

      // Start fast-start timer on the user gesture critical path
      startFastStartTimer(fromPlayer ? 'player' : 'channel_card', channel.id, channelStates[channel.id]?.energyLevel || 'medium');
      
      // Clear playlistChannelId immediately to prevent stale track display during transition
      setPlaylistChannelId(null);

      const newStates: Record<string, ChannelState> = {};
      Object.keys(channelStates).forEach(key => {
        newStates[key] = { ...channelStates[key], isOn: false };
      });

      newStates[channel.id] = {
        isOn: true,
        energyLevel: channelStates[channel.id]?.energyLevel || 'medium'
      };

      const selectedEnergyLevel = newStates[channel.id].energyLevel;
      let usedCachedFirstTrack = false;
      let cachedFirstTrack: AudioTrack | null = null;

      // If warm cache exists, start playback immediately from cached first track (no DB awaits).
      if (fastStartEnabledRef.current) {
        const cached = firstTrackCacheRef.current.get(firstTrackCacheKey(channel.id, selectedEnergyLevel));
        if (cached?.track) {
          usedCachedFirstTrack = true;
          cachedFirstTrack = cached.track;
          lastPlaylistGeneration.current = { channelId: channel.id, energyLevel: selectedEnergyLevel, timestamp: Date.now() };
          setPlaylist([cached.track]);
          setPlaylistChannelId(channel.id);
          setCurrentTrackIndex(0);
          lastLoadedTrackId.current = null;

          // If the cached first track has been fully prewarmed, start playback immediately
          // from the user gesture (helps mobile autoplay constraints).
          const engineAny = audioEngine as any;
          if (cached.prewarmedAt && engineAny && typeof engineAny.playPrewarmedTrack === 'function') {
            // Increment playback session id (mirrors loadAndPlay effect behavior)
            playbackSessionIdRef.current += 1;
            fastStartRef.current.pending = {
              trackId: cached.track.track_id,
              playbackSessionId: playbackSessionIdRef.current,
            };

            // Prevent the loadAndPlay effect from re-loading the same track.
            lastLoadedTrackId.current = cached.track.metadata?.track_id?.toString() || cached.track.track_id;
            shouldAutoPlayRef.current = false;

            engineAny.playPrewarmedTrack(cached.track.track_id, cached.track.file_path, {
              trackName: cached.track.track_name,
              artistName: cached.track.artist_name,
            }).catch(() => {});
          }
        } else {
          // Kick off warm-up in background so the next tap is instant.
          warmFirstTrack(channel, selectedEnergyLevel).catch(() => {});
        }
      }

      if (user) {
        const energyLevel = selectedEnergyLevel;
        const strategyConfig = channel.playlist_strategy?.[energyLevel];
        const channelStrategy = strategyConfig?.strategy;

        // Preload slot strategy data if this is a slot-based channel
        // This runs in parallel with saving preferences
        if (channelStrategy === 'slot_based') {
          preloadSlotStrategy(channel.id, energyLevel).catch(() => {});
        }

        // Fire-and-forget Supabase writes (NOT on the user-gesture critical path)
        saveLastChannel(channel.id).catch(() => {});
        supabase
          .from('listening_sessions')
          .insert({
            user_id: user.id,
            channel_id: channel.id,
            energy_level: energyLevel,
            started_at: new Date().toISOString(),
          })
          .select()
          .single()
          .then(({ data }) => {
            if (data) setCurrentSessionId(data.id);
          })
          .catch(() => {});

        // If we started from a cached first track on a non-slot strategy, build the rest of the
        // playlist in the background without changing the already-playing first track.
        if (usedCachedFirstTrack && cachedFirstTrack && channelStrategy !== 'slot_based') {
          (async () => {
            const playlistResponse = await generatePlaylist({
              channelId: channel.id,
              energyLevel: energyLevel as EnergyLevel,
              userId: user.id,
              strategy: channelStrategy || 'weighted',
            });

            const { data: playlistTracks } = await supabase
              .from('audio_tracks')
              .select('*')
              .in('track_id', playlistResponse.trackIds)
              .is('deleted_at', null);

            if (!playlistTracks || playlistTracks.length === 0) return;

            const orderedTracks = playlistResponse.trackIds
              .map(trackId => playlistTracks.find(t => t.metadata?.track_id === trackId))
              .filter((t): t is AudioTrack => t !== undefined);

            const firstId = cachedFirstTrack.metadata?.track_id;
            const deduped = [
              cachedFirstTrack,
              ...orderedTracks.filter(t => t.metadata?.track_id !== firstId),
            ];

            setPlaylist(deduped);
            setPlaylistChannelId(channel.id);
            setCurrentTrackIndex(0);
          })().catch(() => {});
        }

        // Check if channel uses restart_session mode and clear state BEFORE turning on
        const playbackContinuation = strategyConfig?.playbackContinuation;

        // If restart_session mode, delete playback state and manually trigger playlist generation
        if (playbackContinuation === 'restart_session') {
          supabase
            .from('user_playback_state')
            .delete()
            .eq('user_id', user.id)
            .eq('channel_id', channel.id)
            .eq('energy_level', energyLevel)
            .then(() => {})
            .catch(() => {});
        }
      }

      // Set state AFTER cleanup is complete (for non-restart_session modes)
      setChannelStates(newStates);
      setActiveChannel(channel);
      setIsPlaying(true);
    } else {
      // Turn off the channel
      if (activeChannel?.id === channel.id) {
        setIsPlaying(false);
        if (audioEngine) {
          // Use pause for smoother UX, but channel is still marked as off
          audioEngine.pause();
        }
      }

      setChannelStates(prev => {
        const newState = {
          ...prev,
          [channel.id]: { ...prev[channel.id], isOn: false }
        };
        return newState;
      });
    }
  };

  const setChannelEnergy = async (channelId: string, energyLevel: 'low' | 'medium' | 'high') => {
    const channel = channels.find(c => c.id === channelId);
    if (!channel) return;

    if (user) {
      // Fire-and-forget preference persistence (not on the critical path)
      (async () => {
        const { data: userPreference } = await supabase
          .from('user_preferences')
          .select('channel_energy_levels')
          .eq('user_id', user.id)
          .maybeSingle();

        const energyLevels = userPreference?.channel_energy_levels || {};
        energyLevels[channelId] = energyLevel;

        await supabase
          .from('user_preferences')
          .upsert(
            {
              user_id: user.id,
              last_channel_id: channelId,
              channel_energy_levels: energyLevels,
              last_energy_level: energyLevel
            },
            {
              onConflict: 'user_id'
            }
          );
      })().catch(() => {});
    }

    if (activeChannel?.id !== channelId) {
      // Don't stop audio immediately - let current track play until new track loads
      // The loadAndPlay function will handle the transition
      
      // Clear playlistChannelId immediately to prevent stale track display during transition
      setPlaylistChannelId(null);

      const newStates: Record<string, ChannelState> = {};
      Object.keys(channelStates).forEach(key => {
        newStates[key] = { ...channelStates[key], isOn: false };
      });

      newStates[channelId] = {
        isOn: true,
        energyLevel
      };

      setChannelStates(newStates);
      setActiveChannel(channel);
      setIsPlaying(true);

      if (user) {
        saveLastChannel(channelId).catch(() => {});
        supabase
          .from('listening_sessions')
          .insert({
            user_id: user.id,
            channel_id: channelId,
            energy_level: energyLevel,
            started_at: new Date().toISOString(),
          })
          .select()
          .single()
          .then(({ data }) => {
            if (data) setCurrentSessionId(data.id);
          })
          .catch(() => {});
      }
    } else {

      // Store the current playing state
      const wasPlaying = isPlaying;
      
      // Clear playlistChannelId to prevent stale track display during energy level change
      setPlaylistChannelId(null);

      setChannelStates(prev => ({
        ...prev,
        [channelId]: { ...prev[channelId], energyLevel }
      }));

      if (user) {
        // Clear last loaded track so new playlist starts fresh
        lastLoadedTrackId.current = null;

        // If currently playing, ensure the new track will auto-play
        if (wasPlaying) {
          shouldAutoPlayRef.current = true;
        }

        // Start fast-start timer for energy changes on the active channel
        startFastStartTimer('energy_toggle', channelId, energyLevel);

        // If cached first track exists, start immediately from it.
        if (fastStartEnabledRef.current) {
          const cached = firstTrackCacheRef.current.get(firstTrackCacheKey(channelId, energyLevel));
          if (cached?.track) {
            lastPlaylistGeneration.current = { channelId, energyLevel, timestamp: Date.now() };
            setPlaylist([cached.track]);
            setPlaylistChannelId(channelId);
            setCurrentTrackIndex(0);
            lastLoadedTrackId.current = null;
          } else {
            warmFirstTrack(channel, energyLevel).catch(() => {});
          }
        }

        // Pass energy level directly to avoid stale state (background, non-blocking)
        generateNewPlaylist(energyLevel).catch(() => {});
      }
    }
  };

  const setAdminPreview = (track: AudioTrack | null, autoPlay: boolean = false) => {
    if (track) {
      shouldAutoPlayRef.current = autoPlay;
      setIsAdminMode(true);
      setAdminPreviewTrack(track);
      if (!autoPlay) {
        setIsPlaying(false);
        if (audioEngine) {
          audioEngine.stop();
        }
      }
    } else {
      shouldAutoPlayRef.current = false;
      setIsAdminMode(false);
      setAdminPreviewTrack(null);
      setIsPlaying(false);
      if (audioEngine) {
        audioEngine.stop();
      }
    }
  };

  const toggleAdminPlayback = async () => {
    if (!audioEngine || !adminPreviewTrack) return;

    if (isPlaying) {
      // Currently playing, so pause
      audioEngine.pause();
      setIsPlaying(false);
    } else {
      // Currently paused, so play
      try {
        await audioEngine.play();
        setIsPlaying(true);
      } catch (error) {
      }
    }
  };

  const skipTrack = async () => {
    if (isAdminMode) return;

    if (currentPlayEventId && audioEngine) {
      const playDuration = (Date.now() - playStartTimeRef.current) / 1000;
      await trackPlayEnd(
        currentPlayEventId,
        playDuration,
        true,
        audioEngine.getCurrentTime()
      );
      setCurrentPlayEventId(null);
    }

    if (currentSessionId && currentTrack) {
      supabase
        .from('listening_sessions')
        .select('tracks_skipped')
        .eq('id', currentSessionId)
        .single()
        .then(({ data }) => {
          const skippedTracks = (data?.tracks_skipped as string[]) || [];
          const trackId = currentTrack.metadata?.track_id;
          if (trackId && !skippedTracks.includes(trackId)) {
            supabase
              .from('listening_sessions')
              .update({
                tracks_skipped: [...skippedTracks, trackId]
              })
              .eq('id', currentSessionId)
              .then(() => {});
          }
        });
    }

    // Clear the last loaded track so the next track will load
    lastLoadedTrackId.current = null;

    if (currentTrackIndex < playlist.length - 1) {
      setCurrentTrackIndex(prev => prev + 1);
    } else if (playlist.length === 1) {
      // Single-track playlist: manually reload the track since setCurrentTrackIndex(0) won't change state
      const track = playlist[0];
      if (track && audioEngine) {
        isLoadingTrack.current = true;
        playbackSessionIdRef.current += 1;
        
        audioEngine.loadTrack(track.track_id, track.file_path, {
          trackName: track.track_name,
          artistName: track.artist_name,
        }).then(() => {
          lastLoadedTrackId.current = track.metadata?.track_id?.toString() || null;
          if (isPlaying) {
            audioEngine.play();
          }
        }).finally(() => {
          isLoadingTrack.current = false;
        });
      }
    } else {
      setCurrentTrackIndex(0);
    }
  };

  const seek = (time: number) => {
    if (audioEngine) {
      audioEngine.seek(time);
    }
  };

  const setVolume = (volume: number) => {
    if (audioEngine) {
      audioEngine.setVolume(volume);
    }
  };

  const getVolume = (): number => {
    return audioEngine?.getVolume() || 0.7;
  };

  const setSessionTimer = (active: boolean, remaining: number) => {
    setSessionTimerActive(active);
    setSessionTimerRemaining(remaining);
  };

  /**
   * Switch between audio engine implementations.
   * Used for A/B testing and debugging.
   * Note: This will reset playback state.
   */
  const switchEngine = (type: AudioEngineType) => {
    console.log('[AUDIO ENGINE] Switching engine type to:', type);
    
    // Stop current playback
    if (audioEngine) {
      audioEngine.stop();
      audioEngine.destroy();
    }
    
    // Save preference
    try {
      localStorage.setItem('audioEngineType', type);
    } catch {}
    
    // Update state - will trigger engine recreation via useEffect
    setEngineType(type);
    setIsPlaying(false);
    lastLoadedTrackId.current = null;
    
    // Note: The useEffect will create the new engine on next render
    // This is intentional to ensure clean state
  };

  const currentTrack = isAdminMode ? (adminPreviewTrack || undefined) : playlist[currentTrackIndex];

  useEffect(() => {
    if (typeof window !== "undefined") {
      // Cache iOS WebKit info once (doesn't change during session)
      const iosInfo = getIosWebkitInfo();
      
      (window as any).__playerDebug = {
        // Existing methods
        getTrackId: () => currentTrack?.metadata?.track_id ?? null,
        getPlaylistIndex: () => currentTrackIndex,
        getTransportState: () => isPlaying ? "playing" : "paused",
        getPlaylist: () => playlist,
        getActiveChannel: () => activeChannel,
        getChannelStates: () => channelStates,
        isAdminMode: () => isAdminMode,
        getMetrics: () => ({
          ...(audioMetrics ? (audioMetrics as any) : {}),
          playbackSessionId: playbackSessionIdRef.current,
          fastStart: fastStartRef.current.last,
          fastStartEnabled: fastStartEnabledRef.current,
          prefetch: prefetchDebugRef.current,
          // Expose whether the active channel's first-track cache is fully prewarmed (for E2E/diagnostics)
          fastStartCache: activeChannel
            ? {
                channelId: activeChannel.id,
                energyLevel: channelStates[activeChannel.id]?.energyLevel ?? 'medium',
                entry: firstTrackCacheRef.current.get(
                  `${activeChannel.id}:${channelStates[activeChannel.id]?.energyLevel ?? 'medium'}`
                ) ?? null,
              }
            : null,
        }),
        getCurrentTrackUrl: () => audioMetrics?.currentTrackUrl ?? null,
        getPlaybackSessionId: () => playbackSessionIdRef.current,
        getCurrentTime: () => audioEngine?.getCurrentTime() ?? 0,
        
        // Engine type info (for A/B testing)
        getEngineType: () => engineType,
        isStreamingEngine: () => isStreamingEngine,
        switchEngine: (type: AudioEngineType) => switchEngine(type),
        
        // iOS WebKit Buffer Clamp methods (only available on legacy engine)
        isIOSWebKit: () => iosInfo.isIOSWebKit,
        isIOSClampActive: () => {
          // Only legacy engine has iOS clamp
          if (!isStreamingEngine && audioEngine && 'isIOSClampActive' in audioEngine) {
            return (audioEngine as EnterpriseAudioEngine).isIOSClampActive();
          }
          return false;
        },
        getIOSClampState: () => {
          if (!audioEngine) {
            return { 
              isIOSWebKit: iosInfo.isIOSWebKit,
              isClampActive: false,
              bufferLimitMB: 0,
              currentBufferMB: 0,
              prefetchDisabled: false,
              browserName: iosInfo.browserName,
              isCellular: iosInfo.isCellular,
            };
          }
          // Only legacy engine has getIOSClampState
          if (!isStreamingEngine && 'getIOSClampState' in audioEngine) {
            return (audioEngine as EnterpriseAudioEngine).getIOSClampState();
          }
          // Return default for streaming engine (no iOS clamp needed - HLS handles it)
          return { 
            isIOSWebKit: iosInfo.isIOSWebKit,
            isClampActive: false,
            bufferLimitMB: 0,
            currentBufferMB: 0,
            prefetchDisabled: false,
            browserName: iosInfo.browserName,
            isCellular: iosInfo.isCellular,
            hlsHandlesBuffer: true, // Streaming engine uses HLS buffer management
          };
        },
        forceIOSClampForTesting: (enable: boolean) => {
          // Only legacy engine supports this
          if (!isStreamingEngine && audioEngine && '_forceIOSClampForTesting' in audioEngine) {
            (audioEngine as EnterpriseAudioEngine)._forceIOSClampForTesting(enable);
            console.log('[IOS_CLAMP] Force-enabled for testing:', enable);
          } else {
            console.warn('[IOS_CLAMP] Not available - streaming engine uses HLS buffer management');
          }
        },
        // Expose iOS info for debugging
        getIosInfo: () => iosInfo,
        // HLS metrics (only available on streaming engine)
        getHLSMetrics: () => audioMetrics?.hls ?? null,
      };
    }
  }, [currentTrack, currentTrackIndex, isPlaying, playlist, activeChannel, channelStates, isAdminMode, audioMetrics, audioEngine, engineType, isStreamingEngine]);

  return (
    <MusicPlayerContext.Provider
      value={{
        channels,
        activeChannel,
        channelStates,
        playlist,
        currentTrackIndex,
        isPlaying,
        currentTrack,
        isAdminMode,
        adminPreviewTrack,
        audioEngine,
        audioMetrics,
        sessionTimerActive,
        sessionTimerRemaining,
        playlistChannelId,
        engineType,
        isStreamingEngine,
        setSessionTimer,
        toggleChannel,
        setChannelEnergy,
        loadChannels,
        setAdminPreview,
        toggleAdminPlayback,
        skipTrack,
        seek,
        setVolume,
        getVolume,
        switchEngine,
      }}
    >
      {children}
    </MusicPlayerContext.Provider>
  );
}

export function useMusicPlayer() {
  const context = useContext(MusicPlayerContext);
  if (context === undefined) {
    throw new Error('useMusicPlayer must be used within a MusicPlayerProvider');
  }
  return context;
}

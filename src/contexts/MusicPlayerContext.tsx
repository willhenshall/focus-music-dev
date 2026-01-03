import { createContext, useContext, useState, useEffect, ReactNode, useRef, useCallback } from 'react';
import { supabase, AudioChannel, AudioTrack, SystemPreferences } from '../lib/supabase';
import { generatePlaylist, EnergyLevel } from '../lib/playlisterService';
import { useAuth } from './AuthContext';
import { trackPlayStart, trackPlayEnd, trackTTFA, getBrowserInfo } from '../lib/analyticsService';
import { EnterpriseAudioEngine } from '../lib/enterpriseAudioEngine';
import type { AudioMetrics } from '../lib/enterpriseAudioEngine';
import { StreamingAudioEngine } from '../lib/streamingAudioEngine';
import { createStorageAdapter } from '../lib/storageAdapters';
import { selectNextTrackCached, getCurrentSlotIndex } from '../lib/slotStrategyEngine';
import { getIosWebkitInfo } from '../lib/iosWebkitDetection';
import type { IAudioEngine, AudioMetrics as StreamingAudioMetrics } from '../lib/types/audioEngine';
import {
  getAudioChannels,
  getSystemPreferences,
  getUserPreferences,
  getChannelById,
  invalidateAudioChannels,
  invalidateUserPreferences,
  updateSystemPreferencesCache,
} from '../lib/supabaseDataCache';
import {
  perfStart,
  perfMark,
  perfSuccess,
  perfFail,
  getPerfEvents,
  clearPerfEvents,
  getSummary,
  isTerminal,
  type TTFATriggerType,
} from '../lib/playerPerf';
import {
  beginTrace,
  endTrace,
} from '../lib/playbackNetworkTrace';
import {
  getOrFetch as getOrFetchAudioTracks,
  getOrFetchOne as getOrFetchOneAudioTrack,
  warmCache as warmAudioTracksCache,
  type CachedAudioTrack,
} from '../lib/audioTracksCache';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Minimal select fields for audio_tracks queries during playback.
 * [PHASE 2 OPTIMIZATION] Avoid select=* to reduce network payload.
 * These fields are required for:
 * - Playback: track_id, file_path, hls_path, hls_cdn_url
 * - Display: track_name, artist_name
 * - Analytics: duration_seconds
 * - State: metadata (contains track_id), id, channel_id
 * - Filtering: deleted_at (used in .is() clauses)
 */
const AUDIO_TRACK_PLAYBACK_FIELDS = 'id, track_id, track_name, artist_name, file_path, hls_path, hls_cdn_url, duration_seconds, metadata, channel_id, deleted_at';

// ============================================================================
// PLAYBACK LOADING STATE MACHINE (for loading modal + TTFA)
// ============================================================================

/**
 * Trigger types for playback loading state.
 */
export type PlaybackLoadingTrigger = 'channel_switch' | 'energy_change' | 'initial_play';

/**
 * Playback loading state machine states.
 */
export type PlaybackLoadingStatus = 'idle' | 'loading' | 'playing' | 'error';

/**
 * Default minimum time (ms) the loading modal must remain visible.
 * Creates a calm "ritual" transition for focus (meditation-app style).
 * This value can be overridden via system_preferences.playback_loading_modal_duration_ms
 */
const DEFAULT_MODAL_VISIBLE_MS = 4000;

/**
 * Maximum time (ms) to wait for new audio before showing error state.
 * If no new track plays within this time, show "No track available" error.
 */
const MAX_LOADING_TIMEOUT_MS = 10000;

/**
 * Playback loading state - tracks the current loading request.
 * Uses requestId to prevent stale completions from dismissing the modal.
 */
export type PlaybackLoadingState = {
  status: PlaybackLoadingStatus;
  // Set when loading
  requestId?: string;
  channelId?: string;
  channelName?: string;
  channelImageUrl?: string;
  energyLevel: 'low' | 'medium' | 'high';
  trackId?: string;
  trackName?: string;
  artistName?: string;
  startedAt?: number;
  triggerType?: PlaybackLoadingTrigger;
  // True if audio was playing when this loading state was triggered
  // Used to determine modal headline: "Changing to" (true) vs "Loading..." (false)
  fromPlaying?: boolean;
  // Set when first audible audio is detected (may be before modal dismisses)
  firstAudibleAt?: number;
  // True when first audible audio detected but modal still visible (ritual overlay mode)
  // Modal becomes non-blocking (pointer-events: none) when this is true
  audibleStarted?: boolean;
  // Set when playing (after modal actually dismisses)
  ttfaMs?: number;
  // Set on error
  errorMessage?: string;
  errorReason?: 'NO_TRACK_OR_AUDIO_TIMEOUT' | 'PLAYBACK_ERROR';
};

/**
 * Generate a unique request ID for each load attempt.
 */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Re-export for consistency - both engines produce compatible metrics
type EngineAudioMetrics = AudioMetrics | StreamingAudioMetrics;

// ============================================================================
// ENGINE SELECTION
// ============================================================================

/**
 * Audio engine type selector.
 * - 'legacy': Uses EnterpriseAudioEngine (HTML5 Audio, current production)
 * - 'streaming': Uses StreamingAudioEngine (HLS-based, new implementation)
 * - 'auto': Automatically selects based on platform (streaming for iOS, legacy for others)
 */
export type AudioEngineType = 'legacy' | 'streaming' | 'auto';

/**
 * Get the engine type from environment or local storage.
 * This allows A/B testing and gradual rollout.
 */
function getEngineType(): AudioEngineType {
  // Check environment variable first
  const envEngine = import.meta.env.VITE_AUDIO_ENGINE_TYPE as AudioEngineType;
  if (envEngine && ['legacy', 'streaming', 'auto'].includes(envEngine)) {
    return envEngine;
  }
  
  // Check local storage (for per-user override)
  try {
    const stored = localStorage.getItem('audioEngineType') as AudioEngineType;
    if (stored && ['legacy', 'streaming', 'auto'].includes(stored)) {
      return stored;
    }
  } catch {}
  
  // Default to streaming for all platforms (HLS with MP3 fallback)
  // This provides better resilience, faster starts, and lower memory usage
  return 'streaming';
}

/**
 * Determine if we should use the streaming engine based on platform.
 */
function shouldUseStreamingEngine(engineType: AudioEngineType): boolean {
  if (engineType === 'streaming') return true;
  if (engineType === 'legacy') return false;
  
  // Auto mode: use streaming on iOS (where buffer issues occur)
  const iosInfo = getIosWebkitInfo();
  return iosInfo.isIOSWebKit;
}

/**
 * Create the appropriate audio engine instance.
 */
function createAudioEngine(useStreaming: boolean): IAudioEngine {
  const storageAdapter = createStorageAdapter();
  
  if (useStreaming) {
    console.log('[AUDIO ENGINE] Creating StreamingAudioEngine (HLS-based)');
    return new StreamingAudioEngine(storageAdapter);
  } else {
    console.log('[AUDIO ENGINE] Creating EnterpriseAudioEngine (legacy)');
    return new EnterpriseAudioEngine(storageAdapter);
  }
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
  // Playback loading state (for loading modal + TTFA)
  playbackLoadingState: PlaybackLoadingState;
  dismissLoadingError: () => void;
  setSessionTimer: (active: boolean, remaining: number) => void;
  toggleChannel: (channel: AudioChannel, turnOn: boolean, fromPlayer?: boolean, channelImageUrl?: string) => Promise<void>;
  setChannelEnergy: (channelId: string, energyLevel: 'low' | 'medium' | 'high', channelImageUrl?: string) => void;
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
  const [isPlayingRaw, setIsPlayingRaw] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  
  // [RESUME BUG DEBUG] Wrapper for setIsPlaying that logs every call with reason
  const setIsPlaying = useCallback((value: boolean, reason?: string) => {
    const stack = new Error().stack?.split('\n').slice(2, 5).join('\n') || '';
    console.log('[setIsPlaying]', value, {
      reason: reason || 'no reason provided',
      stack,
    });
    setIsPlayingRaw(value);
  }, []);
  
  // Alias for reading state
  const isPlaying = isPlayingRaw;
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
  
  // Playback loading state machine (for loading modal + TTFA)
  const [playbackLoadingState, setPlaybackLoadingState] = useState<PlaybackLoadingState>({
    status: 'idle',
    energyLevel: 'medium',
  });
  
  // Ref to track the current active request ID (for stale completion protection)
  const activeLoadingRequestIdRef = useRef<string | null>(null);
  // Ref to track if TTFA has already been fired for current request
  const ttfaFiredForRequestRef = useRef<string | null>(null);
  // Timeout for error fallback if audio never starts
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Ref to track which requestId detection is currently running for (prevents duplicate detection runs)
  const detectionRequestIdRef = useRef<string | null>(null);
  // Ref to track old audio sources when entering loading state (to ignore during detection)
  const oldAudioSourcesRef = useRef<Set<string>>(new Set());
  // Timeout for minimum visible duration (anti-flicker)
  const minVisibleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Ref to track if first audible audio was detected (for delayed dismiss)
  const firstAudibleDetectedRef = useRef<{ requestId: string; timestamp: number } | null>(null);
  // Set of preloaded channel image URLs (to avoid duplicate preloading)
  const preloadedChannelImagesRef = useRef<Set<string>>(new Set());
  
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
  
  // [PHASE 3 FIX] Pending session data for deferred listening_sessions insert.
  // This stores the session data to be created AFTER first audio is detected.
  const pendingSessionRef = useRef<{
    userId: string;
    channelId: string;
    energyLevel: string;
    startedAt: string;
  } | null>(null);
  
  // [PHASE 3 FIX] Pending user_preferences write for deferred save.
  // This eliminates user_preferences writes from the TTFA critical window.
  // Stores all preference updates to be written AFTER first audio.
  const pendingUserPrefsRef = useRef<{
    userId: string;
    channelId: string;
    energyLevel?: string;
    channelEnergyLevels?: Record<string, string>;
  } | null>(null);

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
    const engine = createAudioEngine(useStreaming);

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
      // [TTFA INSTRUMENTATION] Handle perf marks from audio engine
      onPerfMark: (markType, _audioType) => {
        const requestId = activeLoadingRequestIdRef.current;
        if (requestId) {
          perfMark(requestId, markType);
        }
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
          // Invalidate cache and reload channels
          invalidateAudioChannels();
          loadChannelsFromCache();
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
    const loadSystemPreferencesFromCache = async () => {
      const data = await getSystemPreferences();
      if (data) {
        setSystemPreferences(data);
      }
    };

    loadSystemPreferencesFromCache();

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
          const prefs = payload.new as SystemPreferences;
          setSystemPreferences(prefs);
          // Update cache with realtime data
          updateSystemPreferencesCache(prefs);
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
      await loadChannelsFromCache();
      // NOTE: We do NOT load all tracks at startup anymore.
      // Track data is fetched on-demand when needed (e.g., when loading a channel's playlist).
      if (user) {
        await loadLastChannel();
        await incrementSessionCount();
      }
    };

    initializeApp();
  }, [user]); // Re-run when user changes (login/logout)

  // Control crossfading based on admin mode
  useEffect(() => {
    if (!audioEngine) return;

    // Disable crossfading in admin mode for instant playback
    audioEngine.setCrossfadeEnabled(!isAdminMode);
  }, [audioEngine, isAdminMode]);

  // Generate new playlist when channel changes or is turned on
  // Note: Energy level changes are handled separately via setChannelEnergy
  // Note: We do NOT depend on allTracks - tracks are fetched on-demand by generateNewPlaylist
  useEffect(() => {
    if (activeChannel && user) {
      const channelState = channelStates[activeChannel.id];

      // Don't generate playlist if channel isn't turned on yet
      if (!channelState?.isOn) {
        return;
      }

      const energyLevel = channelState?.energyLevel || 'medium';

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


      if (!trackId || !track) {
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

        // Prefetch next track (Spotify-style) if available
        const nextTrack = playlist[currentTrackIndex + 1];
        if (nextTrack?.metadata?.track_id && nextTrack.file_path) {
          audioEngine.prefetchNextTrack(nextTrack.metadata.track_id, nextTrack.file_path);
        }
      }

      isLoadingTrack.current = true;
      lastLoadedTrackId.current = trackId;
      // Increment playback session ID for E2E test tracking
      playbackSessionIdRef.current += 1;
      
      // Update loading modal with track info (if loading state is active)
      if (track.track_name || track.artist_name) {
        updateLoadingTrackInfo(
          trackId,
          track.track_name || 'Unknown Track',
          track.artist_name || 'Unknown Artist'
        );
      }

      try {
        // Validate track has required data before attempting to load
        if (!track.track_id) {
          isLoadingTrack.current = false;
          return;
        }

        // [PHASE 4 OPTIMIZATION] End previous track analytics - fire-and-forget
        // Deferred to not block TTFA for the new track
        if (currentPlayEventId && !isAdminMode) {
          const playDuration = (Date.now() - playStartTimeRef.current) / 1000;
          const currentTime = audioEngine.getCurrentTime();
          const eventIdToEnd = currentPlayEventId;
          setCurrentPlayEventId(null); // Clear immediately to prevent double-fire
          
          // Fire-and-forget - don't await, don't block TTFA
          trackPlayEnd(eventIdToEnd, playDuration, false, currentTime)
            .catch(error => {
              console.error('[DEFERRED_ANALYTICS] trackPlayEnd failed:', error);
            });
        }

        // Load new track using file_path (storage adapter will handle URL generation)
        if (!track.file_path) {
          throw new Error(`Track ${track.track_id} missing file_path`);
        }

        // [TTFA INSTRUMENTATION] Mark track load start
        if (activeLoadingRequestIdRef.current) {
          perfMark(activeLoadingRequestIdRef.current, 'trackLoadStartAt');
        }

        await audioEngine.loadTrack(track.track_id, track.file_path, {
          trackName: track.track_name,
          artistName: track.artist_name,
        });

        // [PHASE 2 OPTIMIZATION] Analytics is now deferred until after first audio
        // Set play start time here for accurate duration calculation, but don't call trackPlayStart yet
        if (!isAdminMode && track.track_id) {
          playStartTimeRef.current = Date.now();
        }

        // Auto-play if should be playing or if autoPlay was requested
        console.log('[loadAndPlay] Auto-play check:', {
          isPlaying,
          shouldAutoPlayRef: shouldAutoPlayRef.current,
          willAutoPlay: isPlaying || shouldAutoPlayRef.current,
          trackId,
        });
        if (isPlaying || shouldAutoPlayRef.current) {
          console.log('[loadAndPlay] Starting playback...');
          shouldAutoPlayRef.current = false;
          setIsPlaying(true, 'loadAndPlay: auto-play after track load');
          await audioEngine.play();
          console.log('[loadAndPlay] Playback started successfully');
        } else {
          console.log('[loadAndPlay] NOT auto-playing - neither isPlaying nor shouldAutoPlayRef are true');
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
      console.log('[SYNC EFFECT] Skipping - track is loading');
      return;
    }

    const currentlyPlaying = audioEngine.isPlaying();
    const hasBuffer = audioEngine.getDuration() > 0;
    
    // [RESUME BUG DEBUG] Check if we're in a loading state - if so, we should NOT resume the old track
    const isInLoadingState = playbackLoadingState.status === 'loading';
    const hasActiveLoadingRequest = !!activeLoadingRequestIdRef.current;

    console.log('[SYNC EFFECT] Checking sync:', {
      isPlaying,
      currentlyPlaying,
      hasBuffer,
      isInLoadingState,
      hasActiveLoadingRequest,
      playlistLength: playlist.length,
      currentTrackIndex,
    });

    // [RESUME BUG FIX] Don't resume old track if we're in a loading state (switching channels/energy)
    // The new track will be loaded and played by loadAndPlay effect
    if (isPlaying && !currentlyPlaying && hasBuffer) {
      if (isInLoadingState || hasActiveLoadingRequest) {
        console.log('[SYNC EFFECT] BLOCKING play() - in loading state, waiting for new track');
        return; // Don't resume old track - wait for new track to load
      }
      console.log('[SYNC EFFECT] Calling audioEngine.play()');
      audioEngine.play();
    } else if (!isPlaying && currentlyPlaying) {
      console.log('[SYNC EFFECT] Calling audioEngine.pause()');
      audioEngine.pause();
    }
  }, [isPlaying, audioEngine, playbackLoadingState.status, playlist.length, currentTrackIndex]);

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

  /**
   * Preload a single channel image to ensure instant display in loading modal.
   * Uses Image() constructor to trigger browser cache.
   * Only called when a specific channel is selected (not on startup).
   */
  const preloadSingleChannelImage = useCallback((imageUrl: string | undefined | null, channelName?: string) => {
    if (!imageUrl || preloadedChannelImagesRef.current.has(imageUrl)) {
      return;
    }
    preloadedChannelImagesRef.current.add(imageUrl);
    const img = new Image();
    img.src = imageUrl;
    // No need to handle onload/onerror - we just want browser to cache it
    if (import.meta.env.DEV) {
      console.log('[IMAGE PRELOAD] Preloading single channel image for modal:', channelName || 'unknown');
    }
  }, []);

  const loadChannelsFromCache = async () => {
    const data = await getAudioChannels();
    if (data) {
      setChannels(data);

      // DEV-ONLY: Log that we're NOT preloading all images on startup
      if (import.meta.env.DEV) {
        console.log('[IMAGE PRELOAD] Channels loaded:', data.length, '- NOT preloading all images (lazy loading)');
      }

      // If there's an active channel, update it with fresh data
      if (activeChannel) {
        const updatedActiveChannel = data.find(ch => ch.id === activeChannel.id);
        if (updatedActiveChannel) {
          setActiveChannel(updatedActiveChannel);
        }
      }
    }
  };

  // Alias for external API compatibility
  const loadChannels = loadChannelsFromCache;

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

    // Use cached user preferences
    const userPreference = await getUserPreferences(user.id);

    if (userPreference?.last_channel_id) {
      // Use getChannelById which leverages the cached channel list
      // This avoids per-ID Supabase queries - if cache is empty, it fetches ALL channels once
      const channel = await getChannelById(userPreference.last_channel_id);

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

    // Fallback: get first channel from cache
    const cachedChannels = await getAudioChannels();
    const firstChannel = cachedChannels.length > 0 
      ? cachedChannels.reduce((min, ch) => 
          (ch.channel_number || 999) < (min.channel_number || 999) ? ch : min
        )
      : null;

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
      // NOTE: Don't invalidate cache here - this is a background upsert during startup
      // The cached value is still valid for reading purposes
    }
  };

  const incrementSessionCount = async () => {
    if (!user) return;

    // Use cached user preferences (already fetched in loadLastChannel)
    const currentPrefs = await getUserPreferences(user.id);
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
    // NOTE: Don't invalidate cache here - this is a background increment during startup
    // The cache is still valid for reading purposes (session_count is display-only)
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

    // [PHASE 4 OPTIMIZATION] Load next 3 tracks with BATCHED audio_tracks fetch
    // Step 1: Run all slot selections first
    const pendingResults: { id: string; trackId: string }[] = [];
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
        pendingResults.push({ id: result.id, trackId: result.trackId });
        history.push(result.trackId);
      }
    }

    // Step 2: Batch fetch ALL pending tracks using cache
    // [PHASE 4.2 OPTIMIZATION] Use cached audio tracks fetch - returns cached tracks + fetches missing in single query
    if (pendingResults.length > 0) {
      const trackIds = pendingResults.map(r => r.id);
      const { tracks: batchedTracks } = await getOrFetchAudioTracks(trackIds, supabase);

      if (batchedTracks.length > 0) {
        // Reorder tracks to match the order from slot selection
        const orderedBatchTracks = pendingResults
          .map(r => batchedTracks.find(t => t.id === r.id))
          .filter((t): t is CachedAudioTrack => t !== undefined);
        
        if (orderedBatchTracks.length > 0) {
          setPlaylist(prev => [...prev, ...(orderedBatchTracks as unknown as AudioTrack[])]);
        }
      }
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
        // [PHASE 4.2 OPTIMIZATION] Use cached audio tracks fetch
        // This reduces duplicate /audio_tracks requests across flows
        const firstTrack = await getOrFetchOneAudioTrack(firstResult.id, supabase);

        if (firstTrack) {
          generatedTracks.push(firstTrack as unknown as AudioTrack);
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
      
      // [TTFA INSTRUMENTATION] Mark playlist ready when first track is available
      if (generatedTracks.length > 0 && activeLoadingRequestIdRef.current) {
        perfMark(activeLoadingRequestIdRef.current, 'playlistReadyAt');
      }

      // Force track reload by clearing lastLoadedTrackId
      lastLoadedTrackId.current = null;

      // [PHASE 4 OPTIMIZATION] Save/update playback state - fire-and-forget
      // This is non-critical for TTFA, can happen in background
      if (generatedTracks.length > 0) {
        (async () => {
          try {
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
          } catch (error) {
            console.error('[DEFERRED_ANALYTICS] user_playback_state upsert failed:', error);
          }
        })();
      }

      // [PHASE 4 OPTIMIZATION] Load additional tracks with BATCHED audio_tracks fetch
      // Instead of fetching each track individually, collect all IDs first then fetch in one query
      (async () => {
        const initialBufferSize = 5;
        const pendingResults: { id: string; trackId: string }[] = [];
        
        // Step 1: Run all slot selections first (still sequential due to history dependency)
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
            pendingResults.push({ id: result.id, trackId: result.trackId });
            history.push(result.trackId); // Update history for next iteration
          }
        }

        // Step 2: Batch fetch ALL pending tracks using cache
        // [PHASE 4.2 OPTIMIZATION] Use cached audio tracks fetch - returns cached tracks + fetches missing in single query
        if (pendingResults.length > 0 && !abortController.signal.aborted && currentGenerationId === playlistGenerationId.current) {
          const trackIds = pendingResults.map(r => r.id);
          const { tracks: batchedTracks } = await getOrFetchAudioTracks(trackIds, supabase);

          if (batchedTracks.length > 0 && !abortController.signal.aborted && currentGenerationId === playlistGenerationId.current) {
            // Reorder tracks to match the order from slot selection
            const orderedBatchTracks = pendingResults
              .map(r => batchedTracks.find(t => t.id === r.id))
              .filter((t): t is CachedAudioTrack => t !== undefined);
            
            generatedTracks.push(...(orderedBatchTracks as unknown as AudioTrack[]));
            setPlaylist([...generatedTracks]);
          }
        }
      })();

      // [PHASE 2 OPTIMIZATION] Defer playlist insert to background (non-blocking)
      // This removes playlists INSERT from TTFA critical path
      (async () => {
        try {
          await supabase.from('playlists').insert({
            user_id: user.id,
            channel_id: activeChannel.id,
            energy_level: energyLevel,
            track_sequence: generatedTracks.map(t => t.metadata?.track_id).filter(Boolean),
          });
        } catch (error) {
          console.error('[DEFERRED_ANALYTICS] playlists insert failed:', error);
        }
      })();

      return;
    }

    const playlistResponse = await generatePlaylist({
      channelId: activeChannel.id,
      energyLevel: energyLevel as EnergyLevel,
      userId: user.id,
      strategy: channelStrategy || 'weighted',
    });


    // Fetch the specific tracks from the database
    // [PHASE 2 OPTIMIZATION] Use minimal select instead of select('*')
    const { data: playlistTracks, error } = await supabase
      .from('audio_tracks')
      .select(AUDIO_TRACK_PLAYBACK_FIELDS)
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
    
    // [TTFA INSTRUMENTATION] Mark playlist ready when first track is available
    if (orderedTracks.length > 0 && activeLoadingRequestIdRef.current) {
      perfMark(activeLoadingRequestIdRef.current, 'playlistReadyAt');
    }

    // [PHASE 2 OPTIMIZATION] Defer playlist insert to background (non-blocking)
    // This removes playlists INSERT from TTFA critical path
    (async () => {
      try {
        await supabase.from('playlists').insert({
          user_id: user.id,
          channel_id: activeChannel.id,
          energy_level: energyLevel,
          track_sequence: playlistResponse.trackIds,
        });
      } catch (error) {
        console.error('[DEFERRED_ANALYTICS] playlists insert failed:', error);
      }
    })();
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

  /**
   * Start the loading state machine for a new playback request.
   * Returns the requestId for this loading attempt.
   * 
   * @param channelImageUrl - The resolved channel image URL from the call site.
   *   Pass this explicitly rather than relying on channel.image_url, because
   *   newer channels may have images in image_set_images but not in the channel record.
   * @param fromPlaying - Whether audio was playing when this loading was triggered.
   *   Used to determine modal headline: "Changing to" (true) vs "Loading..." (false)
   */
  const startPlaybackLoading = useCallback((
    triggerType: PlaybackLoadingTrigger,
    channel: AudioChannel,
    energyLevel: 'low' | 'medium' | 'high',
    trackInfo?: { trackId?: string; trackName?: string; artistName?: string },
    channelImageUrl?: string,
    fromPlaying?: boolean
  ): string => {
    const requestId = generateRequestId();
    const now = Date.now();
    
    // [TTFA INSTRUMENTATION] Start perf tracking for this request
    const perfTriggerType: TTFATriggerType = triggerType === 'channel_switch' 
      ? 'channel_change' 
      : triggerType === 'energy_change' 
        ? 'energy_change' 
        : fromPlaying ? 'resume' : 'play';
    
    perfStart({
      requestId,
      triggerType: perfTriggerType,
      clickAt: performance.now(),
      channelId: channel.id,
      channelName: channel.channel_name,
      energyLevel,
    });
    
    // [DEV-ONLY] Start network trace for this playback request
    beginTrace(requestId, {
      triggerType: perfTriggerType,
      channelId: channel.id,
      channelName: channel.channel_name,
      energyLevel,
      engineType: isStreamingEngine ? 'streaming' : 'enterprise',
    });
    
    // Capture current audio sources BEFORE starting load
    // These are the "old" sources that should be ignored during detection
    // [SLOT-SEQUENCE FIX] Only capture audio sources that have actually played content
    // HLS audio elements get blob URLs from attachMedia() before any track loads, causing
    // false matches. Skip these by checking for valid duration (> 0, not NaN).
    // This prevents the first track after hard reload from being falsely filtered out.
    const currentAudioSources = new Set<string>();
    document.querySelectorAll('audio').forEach(audio => {
      if (audio.src) {
        // [SLOT-SEQUENCE FIX] Only capture sources that have loaded/played actual content
        // Skip uninitialized HLS audio elements (blob URL exists but no track loaded yet)
        const hasLoadedContent = !isNaN(audio.duration) && audio.duration > 0;
        if (hasLoadedContent) {
          currentAudioSources.add(audio.src);
        }
      }
    });
    oldAudioSourcesRef.current = currentAudioSources;
    
    console.log('[LOADING MODAL] Captured old audio sources:', {
      count: currentAudioSources.size,
      sources: Array.from(currentAudioSources).map(s => s.split('/').pop()),
      note: 'Only includes audio with loaded content (duration > 0)',
    });
    
    // Resolve image URL: prefer explicit channelImageUrl, fall back to channel.image_url
    const resolvedImageUrl = channelImageUrl || channel.image_url || undefined;
    
    // DEV-ONLY: Log whether channel image URL is present
    if (import.meta.env.DEV) {
      console.log('[LOADING MODAL] channelImageUrl present:', !!resolvedImageUrl, {
        explicit: !!channelImageUrl,
        fromChannel: !!channel.image_url,
      });
    }
    
    console.log('[LOADING MODAL] Starting loading state:', {
      requestId,
      channelName: channel.channel_name,
      energyLevel,
      triggerType,
      oldAudioSources: currentAudioSources.size,
    });
    
    // Clear any existing timeouts (cleanup for new request)
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
    if (minVisibleTimeoutRef.current) {
      clearTimeout(minVisibleTimeoutRef.current);
      minVisibleTimeoutRef.current = null;
    }
    
    // Set the active request ID
    activeLoadingRequestIdRef.current = requestId;
    ttfaFiredForRequestRef.current = null;
    firstAudibleDetectedRef.current = null;
    
    // Update loading state
    setPlaybackLoadingState({
      status: 'loading',
      requestId,
      channelId: channel.id,
      channelName: channel.channel_name,
      channelImageUrl: resolvedImageUrl,
      energyLevel,
      trackId: trackInfo?.trackId,
      trackName: trackInfo?.trackName || 'Loading track...',
      artistName: trackInfo?.artistName,
      startedAt: now,
      triggerType,
      fromPlaying: fromPlaying ?? false,
    });
    
    // Set a timeout to transition to error state if audio never starts
    // This prevents the modal from being stuck forever
    loadingTimeoutRef.current = setTimeout(() => {
      // Guard 1: Check if this is still the active request
      if (activeLoadingRequestIdRef.current !== requestId) {
        return;
      }
      
      // Guard 2: Check if the event is already terminal (success was already recorded)
      // This prevents false negatives where timeout fires after audio started
      if (isTerminal(requestId)) {
        console.log('[LOADING MODAL] Timeout ignored - requestId already terminal:', requestId);
        return;
      }
      
      console.warn('[LOADING MODAL] Timeout - no new audio detected, transitioning to error');
      
      // [TTFA INSTRUMENTATION] Record timeout failure
      // perfFail also checks terminal state internally, but we check above for clarity
      perfFail(requestId, 'loading_timeout');
      
      // [DEV-ONLY] End network trace with failure
      endTrace(requestId, { outcome: 'fail', reason: 'loading_timeout' });
      
      setPlaybackLoadingState(prev => ({
        ...prev,
        status: 'error',
        errorMessage: 'No track available for this channel/energy. Try another energy level.',
        errorReason: 'NO_TRACK_OR_AUDIO_TIMEOUT',
      }));
      // Do NOT auto-dismiss - user must click dismiss button
    }, MAX_LOADING_TIMEOUT_MS);
    
    return requestId;
  }, []);

  /**
   * Actually dismiss the modal and fire TTFA analytics.
   * Called when both conditions are met:
   * 1. First audible audio detected
   * 2. MIN_VISIBLE_MS has elapsed
   */
  const dismissModal = useCallback((requestId: string, ttfaMs: number) => {
    // Validate this is still the active request (stale protection)
    if (activeLoadingRequestIdRef.current !== requestId) {
      console.log('[LOADING MODAL] Stale dismiss ignored for requestId:', requestId);
      return;
    }
    
    console.log('[LOADING MODAL] Dismissing modal:', {
      requestId,
      ttfaMs,
    });
    
    // Transition to playing state
    setPlaybackLoadingState(prev => ({
      ...prev,
      status: 'playing',
      ttfaMs,
    }));
    
    // Clear active request after a brief delay (allow state to be read by consumers)
    setTimeout(() => {
      if (activeLoadingRequestIdRef.current === requestId) {
        setPlaybackLoadingState({ status: 'idle', energyLevel: 'medium' });
        activeLoadingRequestIdRef.current = null;
      }
    }, 100);
    
    // Fire TTFA analytics (non-blocking, local-only)
    const browserInfo = getBrowserInfo();
    trackTTFA({
      requestId,
      ttfaMs,
      channelId: playbackLoadingState.channelId || '',
      channelName: playbackLoadingState.channelName || '',
      energyLevel: playbackLoadingState.energyLevel,
      trackId: playbackLoadingState.trackId,
      trackName: playbackLoadingState.trackName,
      artistName: playbackLoadingState.artistName,
      engineType: engineType,
      browser: browserInfo.browser,
      platform: browserInfo.platform,
      isMobile: browserInfo.isMobile,
      triggerType: playbackLoadingState.triggerType || 'channel_switch',
    }, user?.id);
  }, [playbackLoadingState, engineType, user?.id]);

  /**
   * Complete the loading state when first audio is detected.
   * Implements minimum visible duration (configurable via system preferences) for anti-flicker.
   * Only fires once per requestId to prevent duplicate TTFA events.
   */
  const completePlaybackLoading = useCallback((requestId: string) => {
    // Validate this is the active request (stale protection)
    if (activeLoadingRequestIdRef.current !== requestId) {
      console.log('[LOADING MODAL] Ignoring stale completion for requestId:', requestId);
      return;
    }
    
    // Prevent duplicate TTFA fires
    if (ttfaFiredForRequestRef.current === requestId) {
      console.log('[LOADING MODAL] TTFA already fired for requestId:', requestId);
      return;
    }
    
    // [FIX: TTFA FALSE NEGATIVES] Clear error timeout FIRST, before recording success
    // This ensures the timeout callback cannot fire between our checks and perfSuccess()
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
    
    // Mark TTFA as fired for this request (prevent duplicate fires)
    // Set this early to prevent any re-entrant calls
    ttfaFiredForRequestRef.current = requestId;
    
    // Get configurable modal duration from system preferences (fallback to default)
    const minVisibleMs = systemPreferences?.playback_loading_modal_duration_ms ?? DEFAULT_MODAL_VISIBLE_MS;
    
    const now = Date.now();
    const startedAt = playbackLoadingState.startedAt || now;
    const elapsedMs = now - startedAt;
    const ttfaMs = elapsedMs;
    
    // [TTFA INSTRUMENTATION] Record success with firstAudioAt mark
    // perfSuccess() will mark the event as terminal, preventing any timeout from creating a failure
    perfMark(requestId, 'firstAudioAt', performance.now());
    perfSuccess(requestId, {
      channelId: playbackLoadingState.channelId,
      channelName: playbackLoadingState.channelName,
      energyLevel: playbackLoadingState.energyLevel,
      trackId: playbackLoadingState.trackId,
      trackName: playbackLoadingState.trackName,
      artistName: playbackLoadingState.artistName,
      audioType: isStreamingEngine ? 'hls' : 'mp3',
    });
    
    // [DEV-ONLY] End network trace with success
    endTrace(requestId, { outcome: 'success', ttfaMs });
    
    console.log('[LOADING MODAL] First audio detected:', {
      requestId,
      ttfaMs,
      elapsedMs,
      minVisibleMs,
      channelName: playbackLoadingState.channelName,
    });
    
    // [PHASE 3 FIX] Save user_preferences AFTER first audio is detected
    // This completely removes user_preferences writes from TTFA window
    const pendingUserPrefs = pendingUserPrefsRef.current;
    if (pendingUserPrefs) {
      pendingUserPrefsRef.current = null; // Clear the pending prefs
      const prefsToUpsert: Record<string, unknown> = {
        user_id: pendingUserPrefs.userId,
        last_channel_id: pendingUserPrefs.channelId,
      };
      if (pendingUserPrefs.energyLevel) {
        prefsToUpsert.last_energy_level = pendingUserPrefs.energyLevel;
      }
      if (pendingUserPrefs.channelEnergyLevels) {
        prefsToUpsert.channel_energy_levels = pendingUserPrefs.channelEnergyLevels;
      }
      (async () => {
        try {
          await supabase
            .from('user_preferences')
            .upsert(prefsToUpsert, { onConflict: 'user_id' });
          invalidateUserPreferences(pendingUserPrefs.userId);
        } catch (error) {
          console.error('[DEFERRED_ANALYTICS] user_preferences upsert failed:', error);
        }
      })();
    }
    
    // [PHASE 3 FIX] Create listening session AFTER first audio is detected
    // This completely removes listening_sessions INSERT from TTFA window
    const pendingSession = pendingSessionRef.current;
    if (pendingSession) {
      pendingSessionRef.current = null; // Clear the pending session
      (async () => {
        try {
          const { data } = await supabase
            .from('listening_sessions')
            .insert({
              user_id: pendingSession.userId,
              channel_id: pendingSession.channelId,
              energy_level: pendingSession.energyLevel,
              started_at: pendingSession.startedAt,
            })
            .select()
            .single();
          if (data) setCurrentSessionId(data.id);
        } catch (error) {
          console.error('[DEFERRED_ANALYTICS] listening_sessions insert failed:', error);
        }
      })();
    }
    
    // [PHASE 2 OPTIMIZATION] Fire deferred analytics AFTER first audio
    // This removes analytics from the TTFA critical path
    if (!isAdminMode && playbackLoadingState.trackId && user?.id) {
      const currentTrackForAnalytics = playlist[currentTrackIndex];
      if (currentTrackForAnalytics?.track_id) {
        // Get the sessionId from the pending session if available
        const sessionIdForAnalytics = pendingSession ? undefined : currentSessionId;
        trackPlayStart(
          currentTrackForAnalytics.track_id,
          currentTrackForAnalytics.duration_seconds || 0,
          user.id,
          activeChannel?.id,
          sessionIdForAnalytics
        ).then(eventId => {
          if (eventId) {
            setCurrentPlayEventId(eventId);
          }
        }).catch(error => {
          console.error('[DEFERRED_ANALYTICS] trackPlayStart failed:', error);
        });
      }
    }
    
    // Record first audible timestamp and set audibleStarted for ritual overlay mode
    // Modal becomes non-blocking (pointer-events: none) when audibleStarted is true
    setPlaybackLoadingState(prev => ({
      ...prev,
      firstAudibleAt: now,
      audibleStarted: true,
    }));
    
    // Check if minimum visible time has elapsed
    if (elapsedMs >= minVisibleMs) {
      // Dismiss immediately - enough time has passed
      console.log('[LOADING MODAL] Min visible time met, dismissing immediately');
      dismissModal(requestId, ttfaMs);
    } else {
      // Schedule delayed dismiss for remaining time
      const remainingMs = minVisibleMs - elapsedMs;
      console.log('[LOADING MODAL] Scheduling delayed dismiss in', remainingMs, 'ms');
      
      // Clear any existing min visible timeout
      if (minVisibleTimeoutRef.current) {
        clearTimeout(minVisibleTimeoutRef.current);
      }
      
      minVisibleTimeoutRef.current = setTimeout(() => {
        // RequestId-safe: only dismiss if this is still the active request
        if (activeLoadingRequestIdRef.current === requestId) {
          console.log('[LOADING MODAL] Delayed dismiss firing for requestId:', requestId);
          dismissModal(requestId, ttfaMs);
        } else {
          console.log('[LOADING MODAL] Delayed dismiss cancelled - requestId changed');
        }
        minVisibleTimeoutRef.current = null;
      }, remainingMs);
    }
  }, [playbackLoadingState, dismissModal, systemPreferences]);

  /**
   * Update track info in loading state (called when track metadata becomes available).
   */
  const updateLoadingTrackInfo = useCallback((
    trackId: string,
    trackName: string,
    artistName: string
  ) => {
    setPlaybackLoadingState(prev => {
      if (prev.status !== 'loading') return prev;
      return {
        ...prev,
        trackId,
        trackName,
        artistName,
      };
    });
  }, []);

  /**
   * Dismiss the loading error modal (user-initiated).
   * Called when user clicks the dismiss button on error state.
   */
  const dismissLoadingError = useCallback(() => {
    console.log('[LOADING MODAL] User dismissed error state');
    // Clear any pending timeouts
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
    if (minVisibleTimeoutRef.current) {
      clearTimeout(minVisibleTimeoutRef.current);
      minVisibleTimeoutRef.current = null;
    }
    // Reset to idle
    setPlaybackLoadingState({ status: 'idle', energyLevel: 'medium' });
    activeLoadingRequestIdRef.current = null;
  }, []);

  // First audio detection for loading modal + TTFA
  // Monitors ALL audio elements to detect when first audible audio plays
  // Uses a stable ref-based approach to avoid useEffect dependency issues
  useEffect(() => {
    if (!audioEngine) return;
    
    // Only run detection when we're in loading state
    if (playbackLoadingState.status !== 'loading') return;
    
    const requestId = activeLoadingRequestIdRef.current;
    if (!requestId) return;
    
    // Prevent duplicate detection runs for the same requestId
    if (detectionRequestIdRef.current === requestId) {
      return; // Already detecting for this requestId
    }
    detectionRequestIdRef.current = requestId;
    
    // Capture old sources at detection start time
    const oldSources = new Set(oldAudioSourcesRef.current);
    
    console.log('[FIRST AUDIO] Starting detection for requestId:', requestId, {
      oldSourcesCount: oldSources.size,
    });
    
    let hasCompleted = false;
    let playingEventTimeouts: NodeJS.Timeout[] = [];
    
    /**
     * Check if a NEW audio element meets "first audible audio" criteria:
     * - audio.src NOT in oldSources (must be a new track)
     * - audio.paused === false
     * - audio.currentTime >= 0.05
     * - audio.readyState >= HAVE_CURRENT_DATA (2)
     * - audio.volume > 0 && !audio.muted (actually audible)
     */
    const checkForNewAudioPlaying = (): HTMLAudioElement | null => {
      const audioElements = document.querySelectorAll('audio');
      
      for (const audio of audioElements) {
        const src = audio.src;
        const isPaused = audio.paused;
        const currentTime = audio.currentTime;
        const readyState = audio.readyState;
        const volume = audio.volume;
        const muted = audio.muted;
        
        // Skip if this is an old source (the track that was playing before)
        if (oldSources.has(src)) {
          continue;
        }
        
        // New track must have a src
        if (!src) continue;
        
        // First audible audio criteria for NEW track
        const isPlaying = !isPaused;
        const hasPlayedEnough = currentTime >= 0.05;
        const hasBuffer = readyState >= 2;
        const isAudible = volume > 0 && !muted;
        
        if (isPlaying && hasPlayedEnough && hasBuffer && isAudible) {
          return audio;
        }
      }
      return null;
    };
    
    const completeDetection = (audio: HTMLAudioElement) => {
      if (hasCompleted) return;
      // Validate this is still the active request (stale protection)
      if (activeLoadingRequestIdRef.current !== requestId) {
        console.log('[FIRST AUDIO] Stale requestId, ignoring completion');
        return;
      }
      
      hasCompleted = true;
      console.log('[FIRST AUDIO] Detected! New track audio playing:', {
        requestId,
        src: audio.src.split('/').pop(),
        currentTime: audio.currentTime,
      });
      completePlaybackLoading(requestId);
    };
    
    const checkFirstAudio = () => {
      if (hasCompleted) return;
      if (activeLoadingRequestIdRef.current !== requestId) {
        // Request was superseded - stop checking
        return;
      }
      
      const newAudio = checkForNewAudioPlaying();
      if (newAudio) {
        completeDetection(newAudio);
      }
    };
    
    // Poll for first audio at 50ms intervals
    const pollInterval = setInterval(checkFirstAudio, 50);
    
    // Also set up event listeners on all audio elements as a fallback
    const handlePlaying = (event: Event) => {
      if (hasCompleted) return;
      if (activeLoadingRequestIdRef.current !== requestId) return;
      
      const audio = event.target as HTMLAudioElement;
      
      // Ignore if this is an old source
      if (oldSources.has(audio.src)) return;
      
      if (audio.currentTime >= 0.05 && audio.readyState >= 2 && audio.volume > 0 && !audio.muted) {
        completeDetection(audio);
      } else {
        // Wait up to 500ms for currentTime to advance
        const timeout = setTimeout(() => {
          if (hasCompleted) return;
          if (activeLoadingRequestIdRef.current !== requestId) return;
          if (oldSources.has(audio.src)) return;
          
          if (audio.currentTime >= 0.05 && audio.readyState >= 2 && !audio.paused && audio.volume > 0 && !audio.muted) {
            completeDetection(audio);
          }
        }, 500);
        playingEventTimeouts.push(timeout);
      }
    };
    
    // Attach listeners to all current audio elements
    const audioElements = document.querySelectorAll('audio');
    audioElements.forEach(audio => {
      audio.addEventListener('playing', handlePlaying);
    });
    
    // Also watch for new audio elements being added (MutationObserver)
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLAudioElement) {
            node.addEventListener('playing', handlePlaying);
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    
    return () => {
      clearInterval(pollInterval);
      playingEventTimeouts.forEach(t => clearTimeout(t));
      
      // Remove listeners from all audio elements
      const allAudioElements = document.querySelectorAll('audio');
      allAudioElements.forEach(audio => {
        audio.removeEventListener('playing', handlePlaying);
      });
      
      observer.disconnect();
      
      // Clear detection ref if this cleanup is for the current detection
      if (detectionRequestIdRef.current === requestId) {
        detectionRequestIdRef.current = null;
      }
    };
  }, [audioEngine, playbackLoadingState.status, completePlaybackLoading]);

  const toggleChannel = async (channel: AudioChannel, turnOn: boolean, fromPlayer: boolean = false, channelImageUrl?: string) => {
    console.log('[DIAGNOSTIC] toggleChannel called:', {
      channelName: channel.channel_name,
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
      
      // Preload only this channel's image for instant modal display (not all channels)
      preloadSingleChannelImage(channelImageUrl || channel.image_url, channel.channel_name);
      
      // Start loading state immediately for instant visual feedback
      // Pass current isPlaying state to determine modal headline ("Loading..." vs "Changing to")
      const energyLevel = channelStates[channel.id]?.energyLevel || 'medium';
      startPlaybackLoading('channel_switch', channel, energyLevel, undefined, channelImageUrl, isPlaying);
      
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

      if (user) {
        const energyLevel = newStates[channel.id].energyLevel;
        const strategyConfig = channel.playlist_strategy?.[energyLevel];
        const channelStrategy = strategyConfig?.strategy;

        // Preload slot strategy data if this is a slot-based channel
        const preloadPromise = channelStrategy === 'slot_based'
          ? preloadSlotStrategy(channel.id, energyLevel)
          : Promise.resolve(null);

        // [PHASE 3 FIX] Only run critical path items: slot strategy preload
        // Defer all user_preferences writes to after first audio
        await preloadPromise;
        
        // [PHASE 3 FIX] Store data for deferred writes AFTER first audio
        // This completely removes user_preferences and listening_sessions writes from TTFA window
        pendingUserPrefsRef.current = {
          userId: user.id,
          channelId: channel.id,
          energyLevel,
        };
        pendingSessionRef.current = {
          userId: user.id,
          channelId: channel.id,
          energyLevel,
          startedAt: new Date().toISOString(),
        };

        // Check if channel uses restart_session mode and clear state BEFORE turning on
        const playbackContinuation = strategyConfig?.playbackContinuation;

        // If restart_session mode, delete playback state and manually trigger playlist generation
        if (playbackContinuation === 'restart_session') {
          await supabase
            .from('user_playback_state')
            .delete()
            .eq('user_id', user.id)
            .eq('channel_id', channel.id)
            .eq('energy_level', energyLevel);

          // Set state first
          setChannelStates(newStates);
          setActiveChannel(channel);
          // [RESUME BUG FIX] Set shouldAutoPlayRef to ensure loadAndPlay starts playback
          // (isPlaying might be stale in loadAndPlay's closure)
          shouldAutoPlayRef.current = true;
          setIsPlaying(true, 'toggleChannel: restart_session mode');

          // Then manually generate playlist with forceRestart=true to skip playback state query
          await generateNewPlaylist(energyLevel, true);
          return;
        }
      }

      // Set state AFTER cleanup is complete (for non-restart_session modes)
      setChannelStates(newStates);
      setActiveChannel(channel);
      // [RESUME BUG FIX] Set shouldAutoPlayRef to ensure loadAndPlay starts playback
      // (isPlaying might be stale in loadAndPlay's closure)
      shouldAutoPlayRef.current = true;
      setIsPlaying(true, 'toggleChannel: turning ON channel');
    } else {
      // Turn off the channel
      if (activeChannel?.id === channel.id) {
        setIsPlaying(false, 'toggleChannel: turning OFF channel');
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

  const setChannelEnergy = async (channelId: string, energyLevel: 'low' | 'medium' | 'high', channelImageUrl?: string) => {
    const channel = channels.find(c => c.id === channelId);
    if (!channel) return;

    // Preload only this channel's image for instant modal display
    preloadSingleChannelImage(channelImageUrl || channel.image_url, channel.channel_name);
    
    // Start loading state immediately for instant visual feedback
    // Pass channelImageUrl to preserve the current channel image during energy changes
    // Pass current isPlaying state to determine modal headline ("Loading..." vs "Changing to")
    startPlaybackLoading('energy_change', channel, energyLevel, undefined, channelImageUrl, isPlaying);

    if (user) {
      // [PHASE 3 FIX] Use cached user preferences and prepare deferred write
      // This eliminates duplicate user_preferences reads AND writes from TTFA window
      const cachedPrefs = await getUserPreferences(user.id);
      const energyLevels = { ...(cachedPrefs?.channel_energy_levels || {}) };
      energyLevels[channelId] = energyLevel;

      // [PHASE 3 FIX] Store data for deferred user_preferences write AFTER first audio
      // This completely removes the write from the TTFA critical window
      pendingUserPrefsRef.current = {
        userId: user.id,
        channelId,
        energyLevel,
        channelEnergyLevels: energyLevels,
      };

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
      // [RESUME BUG FIX] Set shouldAutoPlayRef to ensure loadAndPlay starts playback
      // (isPlaying might be stale in loadAndPlay's closure)
      shouldAutoPlayRef.current = true;
      setIsPlaying(true, 'setChannelEnergy: switching to different channel');

      if (user) {
        // [PHASE 3 FIX] Store data for deferred writes AFTER first audio
        // This completely removes user_preferences and listening_sessions writes from TTFA window
        pendingUserPrefsRef.current = {
          userId: user.id,
          channelId: channelId,
          energyLevel,
        };
        pendingSessionRef.current = {
          userId: user.id,
          channelId: channelId,
          energyLevel,
          startedAt: new Date().toISOString(),
        };
      }
    } else {
      // Same channel, just changing energy level
      // [RESUME BUG FIX] User explicitly clicked energy button = intent to play
      // Always set shouldAutoPlayRef and isPlaying, regardless of previous pause state
      console.log('[setChannelEnergy] Same channel energy change:', {
        channelId,
        energyLevel,
        wasPlaying: isPlaying,
        reason: 'User clicked energy button - will start playback',
      });
      
      // Clear playlistChannelId to prevent stale track display during energy level change
      setPlaylistChannelId(null);

      setChannelStates(prev => ({
        ...prev,
        [channelId]: { ...prev[channelId], energyLevel }
      }));

      if (user) {
        // Clear last loaded track so new playlist starts fresh
        lastLoadedTrackId.current = null;

        // [RESUME BUG FIX] Always auto-play when user explicitly clicks energy button
        // This handles the case where user was paused but wants to switch energy levels
        shouldAutoPlayRef.current = true;
        setIsPlaying(true, 'setChannelEnergy: user clicked energy button (resume fix)');

        // Pass energy level directly to avoid stale state
        // Note: tracks are fetched on-demand, no need to wait for allTracks
        await generateNewPlaylist(energyLevel);
      }
    }
  };

  const setAdminPreview = (track: AudioTrack | null, autoPlay: boolean = false) => {
    if (track) {
      shouldAutoPlayRef.current = autoPlay;
      setIsAdminMode(true);
      setAdminPreviewTrack(track);
      if (!autoPlay) {
        setIsPlaying(false, 'setAdminPreview: preview without autoPlay');
        if (audioEngine) {
          audioEngine.stop();
        }
      }
    } else {
      shouldAutoPlayRef.current = false;
      setIsAdminMode(false);
      setAdminPreviewTrack(null);
      setIsPlaying(false, 'setAdminPreview: clearing preview');
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
      setIsPlaying(false, 'toggleAdminPlayback: pause');
    } else {
      // Currently paused, so play
      try {
        await audioEngine.play();
        setIsPlaying(true, 'toggleAdminPlayback: play');
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
    setIsPlaying(false, 'switchEngine: engine type changed');
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
        getMetrics: () => audioMetrics,
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
        // Playback loading state (for loading modal + TTFA testing)
        getPlaybackLoadingState: () => playbackLoadingState,
        getActiveLoadingRequestId: () => activeLoadingRequestIdRef.current,
        
        // [TTFA INSTRUMENTATION] Performance metrics API
        perf: {
          events: getPerfEvents,
          clear: clearPerfEvents,
          summary: getSummary,
        },
      };
    }
  }, [currentTrack, currentTrackIndex, isPlaying, playlist, activeChannel, channelStates, isAdminMode, audioMetrics, audioEngine, engineType, isStreamingEngine, playbackLoadingState]);

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
        playbackLoadingState,
        dismissLoadingError,
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

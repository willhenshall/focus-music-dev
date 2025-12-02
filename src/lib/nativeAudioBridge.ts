/**
 * Native Audio Bridge
 * 
 * Provides a bridge between the web audio engine and native audio players
 * (AVPlayer on iOS, ExoPlayer on Android) when running in a Capacitor app.
 * 
 * This allows for:
 * - True background audio playback
 * - Better lock screen controls
 * - Reduced battery usage
 * - No WebKit buffer limitations
 * 
 * When running in a browser, this module gracefully falls back to web-based playback.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

// ============================================================================
// TYPES
// ============================================================================

export interface NativeAudioPlayOptions {
  /** URL to the audio file or HLS manifest */
  url: string;
  /** Track metadata for lock screen display */
  metadata?: {
    title?: string;
    artist?: string;
    album?: string;
    artwork?: string;
    duration?: number;
  };
  /** Start position in seconds */
  startPosition?: number;
  /** Volume (0.0 - 1.0) */
  volume?: number;
  /** Playback rate (0.5 - 2.0) */
  playbackRate?: number;
}

export interface NativeAudioState {
  /** Current playback state */
  state: 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'error';
  /** Current position in seconds */
  position: number;
  /** Total duration in seconds */
  duration: number;
  /** Buffer progress (0.0 - 1.0) */
  buffered: number;
  /** Whether audio is currently loading */
  isLoading: boolean;
  /** Error message if state is 'error' */
  error?: string;
}

export interface NativeAudioPlugin {
  /** Load and optionally start playing audio */
  play(options: NativeAudioPlayOptions): Promise<void>;
  /** Pause playback */
  pause(): Promise<void>;
  /** Resume playback */
  resume(): Promise<void>;
  /** Stop playback and release resources */
  stop(): Promise<void>;
  /** Seek to position in seconds */
  seek(options: { position: number }): Promise<void>;
  /** Set volume (0.0 - 1.0) */
  setVolume(options: { volume: number }): Promise<void>;
  /** Set playback rate (0.5 - 2.0) */
  setPlaybackRate(options: { rate: number }): Promise<void>;
  /** Get current state */
  getState(): Promise<NativeAudioState>;
  /** Prefetch next track */
  prefetch(options: { url: string }): Promise<void>;
  /** Check if native audio is available */
  isAvailable(): Promise<{ available: boolean }>;
  /** Add listener for playback events */
  addListener(
    event: 'playbackStateChange' | 'positionUpdate' | 'trackEnd' | 'error',
    callback: (data: any) => void
  ): Promise<{ remove: () => void }>;
}

// ============================================================================
// PLUGIN REGISTRATION
// ============================================================================

// Register the native plugin (will be implemented in native code)
const NativeAudioPluginImpl = registerPlugin<NativeAudioPlugin>('NativeAudio', {
  web: () => import('./nativeAudioWeb').then(m => new m.NativeAudioWeb()),
});

// ============================================================================
// BRIDGE CLASS
// ============================================================================

/**
 * Bridge class that provides a unified API for native and web audio playback.
 */
export class NativeAudioBridge {
  private plugin: NativeAudioPlugin;
  private isNativeAvailable: boolean = false;
  private stateListeners: Set<(state: NativeAudioState) => void> = new Set();
  private trackEndListeners: Set<() => void> = new Set();
  private errorListeners: Set<(error: string) => void> = new Set();
  private positionUpdateInterval: number | null = null;
  private currentState: NativeAudioState = {
    state: 'idle',
    position: 0,
    duration: 0,
    buffered: 0,
    isLoading: false,
  };

  constructor() {
    this.plugin = NativeAudioPluginImpl;
    this.initialize();
  }

  private async initialize(): Promise<void> {
    // Check if running in Capacitor native environment
    if (Capacitor.isNativePlatform()) {
      try {
        const { available } = await this.plugin.isAvailable();
        this.isNativeAvailable = available;
        
        if (available) {
          this.setupNativeListeners();
        }
        
        console.log('[NATIVE AUDIO] Native audio available:', available);
      } catch (error) {
        console.warn('[NATIVE AUDIO] Failed to initialize native audio:', error);
        this.isNativeAvailable = false;
      }
    } else {
      console.log('[NATIVE AUDIO] Running in web mode (Capacitor not detected)');
      this.isNativeAvailable = false;
    }
  }

  private setupNativeListeners(): void {
    // Listen for playback state changes
    this.plugin.addListener('playbackStateChange', (data) => {
      this.currentState = { ...this.currentState, ...data };
      this.notifyStateListeners();
    });

    // Listen for position updates
    this.plugin.addListener('positionUpdate', (data) => {
      this.currentState.position = data.position;
      this.currentState.buffered = data.buffered || this.currentState.buffered;
      this.notifyStateListeners();
    });

    // Listen for track end
    this.plugin.addListener('trackEnd', () => {
      this.trackEndListeners.forEach(listener => listener());
    });

    // Listen for errors
    this.plugin.addListener('error', (data) => {
      this.currentState.state = 'error';
      this.currentState.error = data.message;
      this.errorListeners.forEach(listener => listener(data.message));
      this.notifyStateListeners();
    });
  }

  private notifyStateListeners(): void {
    this.stateListeners.forEach(listener => listener({ ...this.currentState }));
  }

  /**
   * Check if native audio playback is available
   */
  isNative(): boolean {
    return this.isNativeAvailable;
  }

  /**
   * Check if running on a native platform (iOS/Android)
   */
  isCapacitorNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  /**
   * Get the current platform
   */
  getPlatform(): 'ios' | 'android' | 'web' {
    if (!Capacitor.isNativePlatform()) return 'web';
    return Capacitor.getPlatform() as 'ios' | 'android';
  }

  /**
   * Play audio
   */
  async play(options: NativeAudioPlayOptions): Promise<void> {
    this.currentState.state = 'loading';
    this.currentState.isLoading = true;
    this.notifyStateListeners();

    await this.plugin.play(options);
    
    this.currentState.state = 'playing';
    this.currentState.isLoading = false;
    this.currentState.duration = options.metadata?.duration || 0;
    this.notifyStateListeners();
  }

  /**
   * Pause playback
   */
  async pause(): Promise<void> {
    await this.plugin.pause();
    this.currentState.state = 'paused';
    this.notifyStateListeners();
  }

  /**
   * Resume playback
   */
  async resume(): Promise<void> {
    await this.plugin.resume();
    this.currentState.state = 'playing';
    this.notifyStateListeners();
  }

  /**
   * Stop playback
   */
  async stop(): Promise<void> {
    await this.plugin.stop();
    this.currentState.state = 'stopped';
    this.currentState.position = 0;
    this.notifyStateListeners();
  }

  /**
   * Seek to position
   */
  async seek(position: number): Promise<void> {
    await this.plugin.seek({ position });
    this.currentState.position = position;
    this.notifyStateListeners();
  }

  /**
   * Set volume
   */
  async setVolume(volume: number): Promise<void> {
    await this.plugin.setVolume({ volume: Math.max(0, Math.min(1, volume)) });
  }

  /**
   * Set playback rate
   */
  async setPlaybackRate(rate: number): Promise<void> {
    await this.plugin.setPlaybackRate({ rate: Math.max(0.5, Math.min(2, rate)) });
  }

  /**
   * Prefetch next track
   */
  async prefetch(url: string): Promise<void> {
    await this.plugin.prefetch({ url });
  }

  /**
   * Get current state
   */
  getState(): NativeAudioState {
    return { ...this.currentState };
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(callback: (state: NativeAudioState) => void): () => void {
    this.stateListeners.add(callback);
    return () => this.stateListeners.delete(callback);
  }

  /**
   * Subscribe to track end events
   */
  onTrackEnd(callback: () => void): () => void {
    this.trackEndListeners.add(callback);
    return () => this.trackEndListeners.delete(callback);
  }

  /**
   * Subscribe to error events
   */
  onError(callback: (error: string) => void): () => void {
    this.errorListeners.add(callback);
    return () => this.errorListeners.delete(callback);
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.positionUpdateInterval) {
      clearInterval(this.positionUpdateInterval);
    }
    this.stateListeners.clear();
    this.trackEndListeners.clear();
    this.errorListeners.clear();
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let bridgeInstance: NativeAudioBridge | null = null;

/**
 * Get the native audio bridge singleton
 */
export function getNativeAudioBridge(): NativeAudioBridge {
  if (!bridgeInstance) {
    bridgeInstance = new NativeAudioBridge();
  }
  return bridgeInstance;
}

/**
 * Check if native audio is available
 */
export function isNativeAudioAvailable(): boolean {
  return getNativeAudioBridge().isNative();
}

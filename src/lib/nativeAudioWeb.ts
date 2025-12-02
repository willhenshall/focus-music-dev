/**
 * Web Implementation of Native Audio Plugin
 * 
 * This provides a fallback implementation when running in a web browser
 * instead of a native Capacitor app. It uses the HTML5 Audio API.
 */

import type { NativeAudioPlugin, NativeAudioPlayOptions, NativeAudioState } from './nativeAudioBridge';

// Event listener type
type ListenerCallback = (data: any) => void;

export class NativeAudioWeb implements NativeAudioPlugin {
  private listeners: Map<string, Set<ListenerCallback>> = new Map();
  private audio: HTMLAudioElement | null = null;
  private currentState: NativeAudioState = {
    state: 'idle',
    position: 0,
    duration: 0,
    buffered: 0,
    isLoading: false,
  };
  private positionUpdateInterval: number | null = null;

  constructor() {
    super();
    this.createAudioElement();
  }

  private createAudioElement(): void {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.crossOrigin = 'anonymous';
    
    // Event listeners
    this.audio.addEventListener('loadstart', () => {
      this.currentState.isLoading = true;
      this.notifyListeners('playbackStateChange', { ...this.currentState });
    });

    this.audio.addEventListener('loadedmetadata', () => {
      this.currentState.duration = this.audio?.duration || 0;
      this.notifyListeners('playbackStateChange', { ...this.currentState });
    });

    this.audio.addEventListener('canplay', () => {
      this.currentState.isLoading = false;
      this.notifyListeners('playbackStateChange', { ...this.currentState });
    });

    this.audio.addEventListener('play', () => {
      this.currentState.state = 'playing';
      this.startPositionUpdates();
      this.notifyListeners('playbackStateChange', { ...this.currentState });
    });

    this.audio.addEventListener('pause', () => {
      this.currentState.state = 'paused';
      this.stopPositionUpdates();
      this.notifyListeners('playbackStateChange', { ...this.currentState });
    });

    this.audio.addEventListener('ended', () => {
      this.currentState.state = 'stopped';
      this.currentState.position = 0;
      this.stopPositionUpdates();
      this.notifyListeners('trackEnd', {});
    });

    this.audio.addEventListener('error', () => {
      this.currentState.state = 'error';
      this.currentState.error = this.audio?.error?.message || 'Unknown error';
      this.stopPositionUpdates();
      this.notifyListeners('error', { message: this.currentState.error });
    });

    this.audio.addEventListener('progress', () => {
      this.updateBufferProgress();
    });
  }

  private updateBufferProgress(): void {
    if (!this.audio) return;
    
    const buffered = this.audio.buffered;
    if (buffered.length > 0 && this.audio.duration > 0) {
      const bufferedEnd = buffered.end(buffered.length - 1);
      this.currentState.buffered = bufferedEnd / this.audio.duration;
    }
  }

  private startPositionUpdates(): void {
    if (this.positionUpdateInterval) {
      clearInterval(this.positionUpdateInterval);
    }

    this.positionUpdateInterval = window.setInterval(() => {
      if (this.audio) {
        this.currentState.position = this.audio.currentTime;
        this.updateBufferProgress();
        this.notifyListeners('positionUpdate', {
          position: this.currentState.position,
          buffered: this.currentState.buffered,
        });
      }
    }, 250);
  }

  private stopPositionUpdates(): void {
    if (this.positionUpdateInterval) {
      clearInterval(this.positionUpdateInterval);
      this.positionUpdateInterval = null;
    }
  }

  async play(options: NativeAudioPlayOptions): Promise<void> {
    if (!this.audio) {
      throw new Error('Audio element not initialized');
    }

    // Set source
    this.audio.src = options.url;
    
    // Set volume if specified
    if (options.volume !== undefined) {
      this.audio.volume = Math.max(0, Math.min(1, options.volume));
    }
    
    // Set playback rate if specified
    if (options.playbackRate !== undefined) {
      this.audio.playbackRate = Math.max(0.5, Math.min(2, options.playbackRate));
    }
    
    // Set start position if specified
    if (options.startPosition !== undefined) {
      this.audio.currentTime = options.startPosition;
    }

    // Update media session metadata if available
    if ('mediaSession' in navigator && options.metadata) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: options.metadata.title || 'Unknown',
        artist: options.metadata.artist || 'Unknown Artist',
        album: options.metadata.album || 'Unknown Album',
        artwork: options.metadata.artwork 
          ? [{ src: options.metadata.artwork }] 
          : undefined,
      });
    }

    this.currentState.state = 'loading';
    this.currentState.isLoading = true;
    
    await this.audio.play();
  }

  async pause(): Promise<void> {
    if (this.audio) {
      this.audio.pause();
    }
  }

  async resume(): Promise<void> {
    if (this.audio) {
      await this.audio.play();
    }
  }

  async stop(): Promise<void> {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio.src = '';
    }
    this.currentState.state = 'stopped';
    this.currentState.position = 0;
    this.stopPositionUpdates();
  }

  async seek(options: { position: number }): Promise<void> {
    if (this.audio && isFinite(options.position)) {
      this.audio.currentTime = Math.max(0, Math.min(options.position, this.audio.duration || 0));
      this.currentState.position = this.audio.currentTime;
    }
  }

  async setVolume(options: { volume: number }): Promise<void> {
    if (this.audio) {
      this.audio.volume = Math.max(0, Math.min(1, options.volume));
    }
  }

  async setPlaybackRate(options: { rate: number }): Promise<void> {
    if (this.audio) {
      this.audio.playbackRate = Math.max(0.5, Math.min(2, options.rate));
    }
  }

  async getState(): Promise<NativeAudioState> {
    return { ...this.currentState };
  }

  async prefetch(options: { url: string }): Promise<void> {
    // Create a hidden audio element to prefetch
    const prefetchAudio = new Audio();
    prefetchAudio.preload = 'auto';
    prefetchAudio.src = options.url;
    prefetchAudio.load();
    
    // Clean up after prefetch starts
    prefetchAudio.addEventListener('canplaythrough', () => {
      // Prefetch complete - the browser has cached the audio
      console.log('[NATIVE AUDIO WEB] Prefetch complete for:', options.url);
    }, { once: true });
  }

  async isAvailable(): Promise<{ available: boolean }> {
    // Web implementation is always "available" but not native
    return { available: false };
  }

  async addListener(
    event: 'playbackStateChange' | 'positionUpdate' | 'trackEnd' | 'error',
    callback: ListenerCallback
  ): Promise<{ remove: () => void }> {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    
    return {
      remove: () => {
        this.listeners.get(event)?.delete(callback);
      }
    };
  }

  private notifyListeners(event: string, data: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }
}

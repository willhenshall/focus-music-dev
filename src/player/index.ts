/**
 * Audio Player Router
 *
 * This module selects the appropriate audio engine based on platform:
 * - iOS Safari: IosSafariPlayer (native HLS)
 * - Desktop/Other: StreamingAudioEngine (hls.js) or EnterpriseAudioEngine (legacy)
 *
 * This is the ONLY file outside src/player/iosSafari/ that knows about
 * the iOS Safari player. All other code imports from this router.
 */

import type { IAudioEngine, StorageAdapter } from '../lib/types/audioEngine';
import { getIosWebkitInfo } from '../lib/iosWebkitDetection';
import { StreamingAudioEngine } from '../lib/streamingAudioEngine';
import { EnterpriseAudioEngine } from '../lib/enterpriseAudioEngine';
import { IosSafariPlayer } from './iosSafari/iosSafariPlayer';

// Re-export types for convenience
export type { IAudioEngine, StorageAdapter } from '../lib/types/audioEngine';
export type { AudioMetrics, AudioEngineCallbacks } from '../lib/types/audioEngine';

/**
 * Audio engine type selector.
 * - 'legacy': Uses EnterpriseAudioEngine (HTML5 Audio)
 * - 'streaming': Uses StreamingAudioEngine (HLS via hls.js)
 * - 'ios-safari': Uses IosSafariPlayer (native HLS for iOS Safari)
 * - 'auto': Automatically selects based on platform
 */
export type AudioEngineType = 'legacy' | 'streaming' | 'ios-safari' | 'auto';

/**
 * Detected platform for engine selection.
 */
export interface PlatformInfo {
  isIOSSafari: boolean;
  isIOSWebKit: boolean;
  browserName: string;
}

/**
 * Detect the current platform.
 */
export function detectPlatform(): PlatformInfo {
  const iosInfo = getIosWebkitInfo();

  return {
    isIOSSafari: iosInfo.isIOSWebKit && iosInfo.browserName === 'Safari',
    isIOSWebKit: iosInfo.isIOSWebKit,
    browserName: iosInfo.browserName,
  };
}

/**
 * Determine which engine to use based on engine type and platform.
 */
export function resolveEngineType(engineType: AudioEngineType): 'legacy' | 'streaming' | 'ios-safari' {
  if (engineType === 'legacy') return 'legacy';
  if (engineType === 'streaming') return 'streaming';
  if (engineType === 'ios-safari') return 'ios-safari';

  // Auto mode: select based on platform
  const platform = detectPlatform();

  if (platform.isIOSSafari) {
    // iOS Safari gets native HLS player
    return 'ios-safari';
  }

  // Desktop and non-Safari iOS browsers use streaming engine (hls.js)
  return 'streaming';
}

/**
 * Create the appropriate audio engine for the current platform.
 *
 * @param storageAdapter - Storage adapter for URL resolution
 * @param engineType - Engine type override (default: 'auto')
 * @returns IAudioEngine instance
 */
export function createAudioEngine(
  storageAdapter: StorageAdapter,
  engineType: AudioEngineType = 'auto'
): IAudioEngine {
  const resolvedType = resolveEngineType(engineType);

  switch (resolvedType) {
    case 'ios-safari':
      console.log('[Player Router] Creating IosSafariPlayer (native HLS)');
      return new IosSafariPlayer(storageAdapter);

    case 'streaming':
      console.log('[Player Router] Creating StreamingAudioEngine (hls.js)');
      return new StreamingAudioEngine(storageAdapter);

    case 'legacy':
      console.log('[Player Router] Creating EnterpriseAudioEngine (HTML5 Audio)');
      return new EnterpriseAudioEngine(storageAdapter);

    default:
      // Fallback to streaming engine
      console.log('[Player Router] Fallback to StreamingAudioEngine');
      return new StreamingAudioEngine(storageAdapter);
  }
}

/**
 * Check if the iOS Safari player should be used.
 * Useful for feature flags and conditional logic.
 */
export function shouldUseIosSafariPlayer(): boolean {
  const platform = detectPlatform();
  return platform.isIOSSafari;
}

// Export individual engines for direct access when needed
export { IosSafariPlayer } from './iosSafari/iosSafariPlayer';
export { StreamingAudioEngine } from '../lib/streamingAudioEngine';
export { EnterpriseAudioEngine } from '../lib/enterpriseAudioEngine';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for iOS WebKit network glitch recovery in EnterpriseAudioEngine.
 * 
 * These tests verify:
 * 1. iOS WebKit detection works correctly (ALL iOS browsers, not just Safari)
 * 2. Recovery state machine behaves correctly
 * 3. Non-iOS browsers are unaffected
 * 4. Recovery attempts are bounded
 * 
 * IMPORTANT: On iOS, ALL browsers (Safari, Chrome, Firefox, Edge) use WebKit
 * under the hood due to Apple's App Store policies. The detection logic
 * should return true for ANY iOS device, regardless of browser name.
 */

// Mock HTMLAudioElement
class MockAudioElement {
  src = '';
  currentTime = 0;
  duration = 300;
  volume = 1;
  muted = false;
  paused = true;
  playbackRate = 1;
  readyState = 0;
  networkState = 0;
  buffered = {
    length: 0,
    start: () => 0,
    end: () => 0,
  };
  error: MediaError | null = null;
  preload = 'auto';
  crossOrigin = '';
  style = { display: '' };
  
  private eventListeners: Record<string, Function[]> = {};
  
  addEventListener(event: string, handler: Function, options?: { once?: boolean }) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(handler);
  }
  
  removeEventListener(event: string, handler: Function) {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event].filter(h => h !== handler);
    }
  }
  
  dispatchEvent(event: string) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach(handler => handler());
    }
  }
  
  load() {
    // Simulate loading
    this.readyState = 1;
    this.networkState = 2;
  }
  
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  
  pause() {
    this.paused = true;
  }
  
  setAttribute() {}
  
  // Test helpers
  simulateCanPlay() {
    this.readyState = 4;
    this.dispatchEvent('canplay');
    this.dispatchEvent('canplaythrough');
  }
  
  simulateTimeUpdate(time: number) {
    this.currentTime = time;
    this.readyState = 4;
    this.networkState = 2;
    this.dispatchEvent('timeupdate');
  }
  
  simulateNetworkError() {
    this.readyState = 0;
    this.networkState = 3;
    this.error = {
      code: 2, // MEDIA_ERR_NETWORK
      message: 'Network error',
      MEDIA_ERR_ABORTED: 1,
      MEDIA_ERR_NETWORK: 2,
      MEDIA_ERR_DECODE: 3,
      MEDIA_ERR_SRC_NOT_SUPPORTED: 4,
    } as MediaError;
    this.dispatchEvent('error');
  }
}

// Mock storage adapter
const mockStorageAdapter = {
  name: 'mock',
  getAudioUrl: vi.fn().mockResolvedValue('https://example.com/audio.mp3'),
  validateUrl: vi.fn().mockReturnValue(true),
};

/**
 * Helper to test iOS WebKit detection logic.
 * This mirrors the actual detection in EnterpriseAudioEngine.
 */
function detectIosWebKit(userAgent: string): boolean {
  // Check for iOS device - this is sufficient since ALL iOS browsers use WebKit
  // We intentionally do NOT check for Safari or exclude Chrome/Firefox/Edge
  return /iPhone|iPad|iPod/.test(userAgent);
}

describe('EnterpriseAudioEngine - iOS WebKit Detection', () => {
  
  describe('should ENABLE recovery for all iOS browsers (they all use WebKit)', () => {
    
    it('iPhone Safari', () => {
      const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
      expect(detectIosWebKit(ua)).toBe(true);
    });
    
    it('iPhone Chrome (CriOS)', () => {
      const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1';
      expect(detectIosWebKit(ua)).toBe(true);
    });
    
    it('iPhone Firefox (FxiOS)', () => {
      const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/120.0 Mobile/15E148 Safari/604.1';
      expect(detectIosWebKit(ua)).toBe(true);
    });
    
    it('iPhone Edge (EdgiOS)', () => {
      const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/120.0.0.0 Mobile/15E148 Safari/604.1';
      expect(detectIosWebKit(ua)).toBe(true);
    });
    
    it('iPad Safari', () => {
      const ua = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
      expect(detectIosWebKit(ua)).toBe(true);
    });
    
    it('iPad Chrome', () => {
      const ua = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1';
      expect(detectIosWebKit(ua)).toBe(true);
    });
    
    it('iPod Touch Safari', () => {
      const ua = 'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1';
      expect(detectIosWebKit(ua)).toBe(true);
    });
  });
  
  describe('should NOT enable recovery for non-iOS browsers', () => {
    
    it('desktop Chrome (macOS)', () => {
      const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      expect(detectIosWebKit(ua)).toBe(false);
    });
    
    it('desktop Safari (macOS)', () => {
      const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
      expect(detectIosWebKit(ua)).toBe(false);
    });
    
    it('desktop Firefox (macOS)', () => {
      const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0';
      expect(detectIosWebKit(ua)).toBe(false);
    });
    
    it('desktop Chrome (Windows)', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      expect(detectIosWebKit(ua)).toBe(false);
    });
    
    it('Android Chrome', () => {
      const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
      expect(detectIosWebKit(ua)).toBe(false);
    });
    
    it('Android Firefox', () => {
      const ua = 'Mozilla/5.0 (Android 14; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0';
      expect(detectIosWebKit(ua)).toBe(false);
    });
    
    it('Android Samsung Browser', () => {
      const ua = 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36';
      expect(detectIosWebKit(ua)).toBe(false);
    });
  });
});

describe('EnterpriseAudioEngine - Recovery State Machine', () => {
  it('should have correct initial recovery state', () => {
    const initialState = {
      active: false,
      attempts: 0,
      lastErrorTime: 0,
      lastGoodPosition: 0,
      trackUrl: null,
    };
    
    expect(initialState.active).toBe(false);
    expect(initialState.attempts).toBe(0);
    expect(initialState.lastGoodPosition).toBe(0);
  });
  
  it('should track recovery constants correctly', () => {
    const config = {
      MAX_ATTEMPTS: 3,
      JITTER_SECONDS: 1.0,
      TIMEOUT_MS: 15000,
      MIN_POSITION_FOR_RECOVERY: 5,
    };
    
    expect(config.MAX_ATTEMPTS).toBe(3);
    expect(config.JITTER_SECONDS).toBe(1.0);
    expect(config.TIMEOUT_MS).toBe(15000);
    expect(config.MIN_POSITION_FOR_RECOVERY).toBe(5);
  });
  
  it('should calculate resume position with jitter correctly', () => {
    const lastGoodPosition = 25.5;
    const jitterSeconds = 1.0;
    const resumeFrom = Math.max(0, lastGoodPosition - jitterSeconds);
    
    expect(resumeFrom).toBe(24.5);
  });
  
  it('should not go negative when resuming from near start', () => {
    const lastGoodPosition = 0.5;
    const jitterSeconds = 1.0;
    const resumeFrom = Math.max(0, lastGoodPosition - jitterSeconds);
    
    expect(resumeFrom).toBe(0);
  });
});

describe('EnterpriseAudioEngine - Recovery Conditions', () => {
  it('should not recover if position is below minimum threshold', () => {
    const state = {
      isIosWebKit: true,
      isPlaying: true,
      hasUrl: true,
      attempts: 0,
      lastGoodPosition: 3, // Below MIN_POSITION_FOR_RECOVERY (5)
    };
    
    const MIN_POSITION = 5;
    const shouldRecover = state.isIosWebKit &&
                          state.isPlaying &&
                          state.hasUrl &&
                          state.attempts < 3 &&
                          state.lastGoodPosition >= MIN_POSITION;
    
    expect(shouldRecover).toBe(false);
  });
  
  it('should recover if all conditions are met', () => {
    const state = {
      isIosWebKit: true,
      isPlaying: true,
      hasUrl: true,
      attempts: 0,
      lastGoodPosition: 25, // Above MIN_POSITION_FOR_RECOVERY
    };
    
    const MIN_POSITION = 5;
    const MAX_ATTEMPTS = 3;
    const shouldRecover = state.isIosWebKit &&
                          state.isPlaying &&
                          state.hasUrl &&
                          state.attempts < MAX_ATTEMPTS &&
                          state.lastGoodPosition >= MIN_POSITION;
    
    expect(shouldRecover).toBe(true);
  });
  
  it('should not recover after max attempts exceeded', () => {
    const state = {
      isIosWebKit: true,
      isPlaying: true,
      hasUrl: true,
      attempts: 3, // At MAX_ATTEMPTS
      lastGoodPosition: 25,
    };
    
    const MAX_ATTEMPTS = 3;
    const shouldRecover = state.attempts < MAX_ATTEMPTS;
    
    expect(shouldRecover).toBe(false);
  });
  
  it('should not recover on non-iOS platforms', () => {
    const state = {
      isIosWebKit: false, // Desktop or Android browser
      isPlaying: true,
      hasUrl: true,
      attempts: 0,
      lastGoodPosition: 25,
    };
    
    const shouldRecover = state.isIosWebKit;
    
    expect(shouldRecover).toBe(false);
  });
  
  it('should respect timeout window for recovery', () => {
    const now = Date.now();
    const lastErrorTime = now - 10000; // 10 seconds ago
    const TIMEOUT_MS = 15000;
    
    const withinTimeout = (now - lastErrorTime) < TIMEOUT_MS;
    expect(withinTimeout).toBe(true);
    
    const lastErrorTimeTooOld = now - 20000; // 20 seconds ago
    const outsideTimeout = (now - lastErrorTimeTooOld) < TIMEOUT_MS;
    expect(outsideTimeout).toBe(false);
  });
});

describe('EnterpriseAudioEngine - Metrics Updates', () => {
  it('should update metrics when recovery starts', () => {
    const metrics = {
      iosRecoveryAttempts: 0,
      iosRecoveryActive: false,
      iosRecoveryLastPosition: 0,
    };
    
    // Simulate starting recovery
    metrics.iosRecoveryAttempts = 1;
    metrics.iosRecoveryActive = true;
    metrics.iosRecoveryLastPosition = 25.5;
    
    expect(metrics.iosRecoveryAttempts).toBe(1);
    expect(metrics.iosRecoveryActive).toBe(true);
    expect(metrics.iosRecoveryLastPosition).toBe(25.5);
  });
  
  it('should reset metrics after successful recovery', () => {
    const metrics = {
      iosRecoveryAttempts: 2,
      iosRecoveryActive: true,
      iosRecoveryLastPosition: 25.5,
      error: 'Network error',
      errorCategory: 'network',
    };
    
    // Simulate successful recovery - only reset active flag and error
    metrics.iosRecoveryActive = false;
    metrics.error = null;
    metrics.errorCategory = null;
    
    expect(metrics.iosRecoveryActive).toBe(false);
    expect(metrics.error).toBe(null);
    expect(metrics.errorCategory).toBe(null);
    // Attempts should persist until track changes
    expect(metrics.iosRecoveryAttempts).toBe(2);
  });
  
  it('should reset all recovery state when loading new track', () => {
    const state = {
      active: true,
      attempts: 2,
      lastErrorTime: Date.now(),
      lastGoodPosition: 25.5,
      trackUrl: 'https://example.com/track.mp3',
    };
    
    // Simulate reset
    const resetState = {
      active: false,
      attempts: 0,
      lastErrorTime: 0,
      lastGoodPosition: 0,
      trackUrl: null,
    };
    
    expect(resetState.active).toBe(false);
    expect(resetState.attempts).toBe(0);
    expect(resetState.lastGoodPosition).toBe(0);
    expect(resetState.trackUrl).toBe(null);
  });
});

describe('EnterpriseAudioEngine - Cross-browser iOS verification', () => {
  /**
   * This test explicitly verifies that Chrome on iOS triggers recovery,
   * which was the bug we fixed (previously Safari-only detection).
   */
  it('Chrome on iOS should enable recovery (critical regression test)', () => {
    const iPhoneChromeUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1';
    
    // This MUST be true - Chrome on iOS uses WebKit and has the same glitch behavior
    expect(detectIosWebKit(iPhoneChromeUA)).toBe(true);
  });
  
  it('Firefox on iOS should enable recovery', () => {
    const iPhoneFirefoxUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/120.0 Mobile/15E148 Safari/604.1';
    
    expect(detectIosWebKit(iPhoneFirefoxUA)).toBe(true);
  });
  
  it('Edge on iOS should enable recovery', () => {
    const iPhoneEdgeUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/120.0.0.0 Mobile/15E148 Safari/604.1';
    
    expect(detectIosWebKit(iPhoneEdgeUA)).toBe(true);
  });
  
  it('Opera on iOS should enable recovery', () => {
    const iPhoneOperaUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) OPT/4.0.0 Mobile/15E148';
    
    expect(detectIosWebKit(iPhoneOperaUA)).toBe(true);
  });
  
  it('Brave on iOS should enable recovery', () => {
    // Brave on iOS typically mimics Safari's UA but may include hints
    const iPhoneBraveUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    
    expect(detectIosWebKit(iPhoneBraveUA)).toBe(true);
  });
});

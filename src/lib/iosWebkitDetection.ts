/**
 * iOS WebKit Detection Utility
 * 
 * Provides reliable detection of iOS WebKit browsers for buffer management.
 * On iOS, ALL browsers (Safari, Chrome, Firefox, Edge) use the WebKit engine
 * due to Apple's App Store policies, so they all share the same audio buffering
 * behavior and limitations.
 * 
 * Key detection criteria:
 * - iOS device (iPhone/iPad/iPod)
 * - WebKit engine (all iOS browsers)
 * - Distinguishes from desktop Safari/WebKit
 * - Detects cellular vs WiFi connection
 */

export interface IosWebkitInfo {
  /** True if running on ANY iOS device with WebKit */
  isIOSWebKit: boolean;
  
  /** True if likely a real device (not simulator/emulator) */
  isLikelyRealDevice: boolean;
  
  /** Detected browser name (Safari, Chrome, Firefox, Edge, etc.) */
  browserName: string;
  
  /** True if on cellular network (5G/LTE/etc.) */
  isCellular: boolean;
  
  /** Network connection type if available */
  connectionType: string | null;
  
  /** Effective connection type (4g, 3g, 2g, slow-2g) */
  effectiveType: string | null;
  
  /** True if this is an iPad */
  isIPad: boolean;
  
  /** iOS version if detectable */
  iosVersion: string | null;
}

/**
 * Get comprehensive iOS WebKit environment information.
 * Use this to determine if buffer governor should be active.
 */
export function getIosWebkitInfo(): IosWebkitInfo {
  const defaultInfo: IosWebkitInfo = {
    isIOSWebKit: false,
    isLikelyRealDevice: false,
    browserName: 'Unknown',
    isCellular: false,
    connectionType: null,
    effectiveType: null,
    isIPad: false,
    iosVersion: null,
  };

  if (typeof navigator === 'undefined') {
    return defaultInfo;
  }

  const ua = navigator.userAgent;
  const platform = navigator.platform || '';

  // Detect iOS device
  // Note: iPad on iOS 13+ may report as "MacIntel" but still be iOS
  const isIPhone = /iPhone/.test(ua);
  const isIPod = /iPod/.test(ua);
  const isIPadUA = /iPad/.test(ua);
  
  // iPad detection for iOS 13+ (reports as Mac)
  // Check for touch support + Mac platform + Safari mobile features
  const isIPadDesktopMode = platform === 'MacIntel' && 
    typeof navigator.maxTouchPoints === 'number' && 
    navigator.maxTouchPoints > 1 &&
    /Safari/.test(ua) &&
    !/Chrome/.test(ua);

  const isIPad = isIPadUA || isIPadDesktopMode;
  const isIOSDevice = isIPhone || isIPod || isIPad;

  if (!isIOSDevice) {
    return {
      ...defaultInfo,
      browserName: detectBrowserName(ua),
    };
  }

  // All iOS devices use WebKit
  const isIOSWebKit = true;

  // Detect browser name on iOS
  const browserName = detectIOSBrowserName(ua);

  // Extract iOS version
  const iosVersion = extractIOSVersion(ua);

  // Detect if likely real device (not simulator)
  // Simulators typically have specific characteristics
  const isLikelyRealDevice = !ua.includes('Simulator') && 
    !ua.includes('iPhone Simulator') &&
    !ua.includes('iPad Simulator');

  // Detect network type
  const { isCellular, connectionType, effectiveType } = detectNetworkType();

  return {
    isIOSWebKit,
    isLikelyRealDevice,
    browserName,
    isCellular,
    connectionType,
    effectiveType,
    isIPad,
    iosVersion,
  };
}

/**
 * Detect browser name from user agent string.
 */
function detectBrowserName(ua: string): string {
  if (/Edg(e|A|iOS)?\//.test(ua)) return 'Edge';
  if (/Firefox|FxiOS/.test(ua)) return 'Firefox';
  if (/OPR|Opera/.test(ua)) return 'Opera';
  if (/Chrome|CriOS/.test(ua)) return 'Chrome';
  if (/Safari/.test(ua)) return 'Safari';
  return 'Unknown';
}

/**
 * Detect browser name for iOS specifically.
 * All iOS browsers use WebKit, but we can still identify the wrapper.
 */
function detectIOSBrowserName(ua: string): string {
  // Order matters - more specific patterns first
  if (/EdgiOS/.test(ua)) return 'Edge';
  if (/FxiOS/.test(ua)) return 'Firefox';
  if (/OPiOS/.test(ua)) return 'Opera';
  if (/CriOS/.test(ua)) return 'Chrome';
  if (/Brave/.test(ua)) return 'Brave';
  if (/DuckDuckGo/.test(ua)) return 'DuckDuckGo';
  if (/Safari/.test(ua) && !/Chrome/.test(ua)) return 'Safari';
  return 'WebKit Browser';
}

/**
 * Extract iOS version from user agent.
 */
function extractIOSVersion(ua: string): string | null {
  // Match patterns like "OS 17_0" or "OS 17.0"
  const match = ua.match(/OS (\d+[._]\d+(?:[._]\d+)?)/);
  if (match) {
    return match[1].replace(/_/g, '.');
  }
  return null;
}

/**
 * Detect network connection type.
 */
function detectNetworkType(): { isCellular: boolean; connectionType: string | null; effectiveType: string | null } {
  let isCellular = false;
  let connectionType: string | null = null;
  let effectiveType: string | null = null;

  if ('connection' in navigator) {
    const connection = (navigator as any).connection;
    
    if (connection) {
      connectionType = connection.type || null;
      effectiveType = connection.effectiveType || null;
      
      // Determine if cellular
      // type can be: bluetooth, cellular, ethernet, none, wifi, wimax, other, unknown
      if (connectionType === 'cellular') {
        isCellular = true;
      } else if (connectionType === undefined || connectionType === null) {
        // If type is not available but effectiveType is, we're likely on mobile
        // This is common on iOS where the Network Information API is limited
        isCellular = effectiveType !== null;
      }
    }
  }

  return { isCellular, connectionType, effectiveType };
}

/**
 * Check if buffer governor should be active.
 * Returns true if we're on iOS WebKit and conditions warrant buffer limiting.
 */
export function shouldActivateBufferGovernor(info?: IosWebkitInfo): boolean {
  const webkitInfo = info || getIosWebkitInfo();
  
  // Buffer governor is for iOS WebKit only
  if (!webkitInfo.isIOSWebKit) {
    return false;
  }

  // Always activate on iOS WebKit - the buffer limit issue affects both
  // cellular and WiFi, but is more severe on cellular
  return true;
}

/**
 * Get cellular-specific buffer limits.
 * Returns more conservative limits when on cellular network.
 */
export function getBufferLimitsForNetwork(info?: IosWebkitInfo): {
  bufferLimitBytes: number;
  prefetchLimitBytes: number;
  isConservative: boolean;
} {
  const webkitInfo = info || getIosWebkitInfo();

  // Default (non-iOS or WiFi iOS)
  const defaultLimits = {
    bufferLimitBytes: 20 * 1024 * 1024, // 20MB
    prefetchLimitBytes: 10 * 1024 * 1024, // 10MB
    isConservative: false,
  };

  if (!webkitInfo.isIOSWebKit) {
    return defaultLimits;
  }

  // iOS WebKit on cellular - very conservative
  if (webkitInfo.isCellular) {
    return {
      bufferLimitBytes: 12 * 1024 * 1024, // 12MB - well under the ~22MB crash point
      prefetchLimitBytes: 5 * 1024 * 1024, // 5MB
      isConservative: true,
    };
  }

  // iOS WebKit on WiFi - still conservative but less so
  return {
    bufferLimitBytes: 15 * 1024 * 1024, // 15MB
    prefetchLimitBytes: 8 * 1024 * 1024, // 8MB
    isConservative: true,
  };
}

// Export for testing
export const __testing = {
  detectBrowserName,
  detectIOSBrowserName,
  extractIOSVersion,
  detectNetworkType,
};

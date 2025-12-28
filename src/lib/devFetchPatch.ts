/**
 * DEV-only Fetch Patch for Playback Network Tracing
 * 
 * This module monkeypatches the global fetch to capture network timing
 * for playback traces. It ONLY runs in DEV mode and does NOT change
 * any fetch behavior - requests pass through completely untouched.
 * 
 * IMPORTANT:
 * - This file must be imported early in the app (e.g., in App.tsx)
 * - It self-initializes on import
 * - It is a no-op in production builds
 */

import {
  hasActiveTraces,
  recordNetworkEventToAll,
  parseUrl,
  type NetworkEvent,
} from './playbackNetworkTrace';

// ============================================================================
// FETCH PATCH
// ============================================================================

/**
 * Whether the fetch patch has been installed.
 */
let patchInstalled = false;

/**
 * Reference to the original fetch function.
 */
let originalFetch: typeof fetch;

/**
 * Install the fetch patch (DEV-only).
 * Safe to call multiple times - will only install once.
 */
export function installFetchPatch(): void {
  // Only run in DEV mode
  if (!import.meta.env.DEV) return;

  // Only install once
  if (patchInstalled) return;
  patchInstalled = true;

  // Store original fetch
  originalFetch = window.fetch.bind(window);

  // Replace with instrumented version
  window.fetch = instrumentedFetch;

  if (import.meta.env.DEV) {
    console.log('[DEV] Fetch patch installed for playback network tracing');
  }
}

/**
 * Instrumented fetch that captures timing for active traces.
 * Passes through all requests untouched.
 */
async function instrumentedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  // If no active traces, just pass through
  if (!hasActiveTraces()) {
    return originalFetch(input, init);
  }

  // Capture timing
  const startTime = performance.now();
  const method = init?.method || 'GET';
  const url = typeof input === 'string' 
    ? input 
    : input instanceof URL 
      ? input.href 
      : input.url;

  const { hostname, pathname } = parseUrl(url);

  try {
    // Execute the actual fetch (completely untouched)
    const response = await originalFetch(input, init);

    // Record the event for all active traces
    const endTime = performance.now();
    const event: NetworkEvent = {
      ts: startTime,
      method,
      url,
      status: response.status,
      durationMs: Math.round(endTime - startTime),
      hostname,
      pathname,
    };

    recordNetworkEventToAll(event);

    // Return the response untouched
    return response;
  } catch (error) {
    // Record the error for all active traces
    const endTime = performance.now();
    const event: NetworkEvent = {
      ts: startTime,
      method,
      url,
      status: 'ERR',
      durationMs: Math.round(endTime - startTime),
      errorMessage: error instanceof Error ? error.message : String(error),
      hostname,
      pathname,
    };

    recordNetworkEventToAll(event);

    // Re-throw the error (don't change behavior)
    throw error;
  }
}

/**
 * Uninstall the fetch patch (for testing).
 */
export function uninstallFetchPatch(): void {
  if (!import.meta.env.DEV) return;
  if (!patchInstalled) return;

  window.fetch = originalFetch;
  patchInstalled = false;
}

/**
 * Check if patch is installed.
 */
export function isFetchPatchInstalled(): boolean {
  return patchInstalled;
}

// ============================================================================
// AUTO-INSTALL ON IMPORT (DEV-only)
// ============================================================================

// Self-install when this module is imported in DEV mode
if (import.meta.env.DEV && typeof window !== 'undefined') {
  installFetchPatch();
}


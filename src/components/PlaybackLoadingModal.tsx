import { useEffect, useRef, useState } from 'react';
import { useMusicPlayer } from '../contexts/MusicPlayerContext';

/**
 * Animation timings for smooth modal transitions.
 */
const FADE_IN_MS = 100;
const FADE_OUT_MS = 450; // Slower fade-out for smoother transition

/**
 * PlaybackLoadingModal - Global overlay shown during audio loading.
 * 
 * Appears instantly when user switches channel or changes energy level.
 * Disappears the moment first audible audio is heard (after MIN_MODAL_VISIBLE_MS).
 * 
 * This provides a "Spotify-like" feel by:
 * - Giving immediate visual feedback on user action (100ms fade-in)
 * - Covering the loading delay with a polished UI
 * - Staying visible for at least 4s to prevent flash-dismissal
 * - Smooth fade-out (450ms) when dismissing
 * - Horizontal loading indicator for visual feedback
 * - Showing a dismissible error state if no track is available
 */
export function PlaybackLoadingModal() {
  const { playbackLoadingState, dismissLoadingError } = useMusicPlayer();
  
  // Track visibility states for animations
  const [isVisible, setIsVisible] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const fadeOutTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastRequestIdRef = useRef<string | null>(null);
  
  // Cached content for fade-out (show last known state during fade)
  const cachedContentRef = useRef<{
    channelName?: string;
    channelImageUrl?: string;
    energyLevel: 'low' | 'medium' | 'high';
    trackName?: string;
    artistName?: string;
    isError: boolean;
    errorMessage?: string;
    audibleStarted?: boolean;
  } | null>(null);

  const isLoading = playbackLoadingState.status === 'loading';
  const isError = playbackLoadingState.status === 'error';
  const shouldShow = isLoading || isError;
  const currentRequestId = playbackLoadingState.requestId;

  // Handle visibility transitions with proper fade-out
  useEffect(() => {
    if (shouldShow) {
      // New loading/error state - show immediately
      // Cancel any pending fade-out timer
      if (fadeOutTimeoutRef.current) {
        clearTimeout(fadeOutTimeoutRef.current);
        fadeOutTimeoutRef.current = null;
      }
      
      // Immediately restore visibility and cancel fade
      setIsFadingOut(false);
      setIsVisible(true);
      lastRequestIdRef.current = currentRequestId || null;
      
      // Cache content for potential fade-out
      cachedContentRef.current = {
        channelName: playbackLoadingState.channelName,
        channelImageUrl: playbackLoadingState.channelImageUrl,
        energyLevel: playbackLoadingState.energyLevel,
        trackName: playbackLoadingState.trackName,
        artistName: playbackLoadingState.artistName,
        isError,
        errorMessage: playbackLoadingState.errorMessage,
        audibleStarted: playbackLoadingState.audibleStarted,
      };
    } else if (isVisible && !isFadingOut) {
      // State changed to idle/playing - start fade-out
      setIsFadingOut(true);
      
      // Schedule removal from DOM after fade-out completes
      fadeOutTimeoutRef.current = setTimeout(() => {
        setIsVisible(false);
        setIsFadingOut(false);
        cachedContentRef.current = null;
        fadeOutTimeoutRef.current = null;
      }, FADE_OUT_MS);
    }
  }, [shouldShow, currentRequestId, playbackLoadingState, isError, isVisible, isFadingOut]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (fadeOutTimeoutRef.current) {
        clearTimeout(fadeOutTimeoutRef.current);
        fadeOutTimeoutRef.current = null;
      }
    };
  }, []);

  // Dev-only: Log modal visibility for debugging
  useEffect(() => {
    if (import.meta.env.DEV && isVisible && !isFadingOut) {
      console.log('[PlaybackLoadingModal] Modal visible:', {
        requestId: currentRequestId,
        channelName: playbackLoadingState.channelName,
        status: playbackLoadingState.status,
      });
    }
  }, [isVisible, isFadingOut, currentRequestId, playbackLoadingState.channelName, playbackLoadingState.status]);

  // Don't render if not visible at all
  if (!isVisible) {
    return null;
  }

  // Use cached content during fade-out, otherwise use current state
  const displayContent = isFadingOut && cachedContentRef.current 
    ? cachedContentRef.current 
    : {
        channelName: playbackLoadingState.channelName,
        channelImageUrl: playbackLoadingState.channelImageUrl,
        energyLevel: playbackLoadingState.energyLevel,
        trackName: playbackLoadingState.trackName,
        artistName: playbackLoadingState.artistName,
        isError,
        errorMessage: playbackLoadingState.errorMessage,
        audibleStarted: playbackLoadingState.audibleStarted,
      };

  const {
    channelName,
    channelImageUrl,
    energyLevel,
    trackName,
    artistName,
    audibleStarted,
  } = displayContent;

  const hasTrackInfo = trackName && trackName !== 'Loading track...';

  // Energy level colors
  const energyColors: Record<string, { bg: string; text: string; border: string }> = {
    low: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-300' },
    medium: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300' },
    high: { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-300' },
  };

  const energyColor = energyColors[energyLevel] || energyColors.medium;

  // Determine animation class based on state
  const animationClass = isFadingOut ? 'animate-fade-out' : 'animate-fade-in';
  const contentAnimationClass = isFadingOut ? '' : 'animate-scale-in';
  
  // RITUAL OVERLAY: After first audible audio, modal becomes non-blocking
  // - Before audio: pointer-events: auto (blocks clicks - loading state)
  // - After audio starts (audibleStarted): pointer-events: none (ritual overlay - clicks pass through)
  // - During fade-out: pointer-events: none (also allows clicks)
  const pointerEventsClass = (audibleStarted || isFadingOut) ? 'pointer-events-none' : 'pointer-events-auto';

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-transparent ${animationClass} ${pointerEventsClass}`}
      data-testid="playback-loading-modal"
      data-fading-out={isFadingOut ? 'true' : 'false'}
      role="dialog"
      aria-modal="true"
      aria-label={displayContent.isError ? 'Playback error' : 'Loading playback'}
    >
      {/* Modal wrapper */}
      <div className={`relative inline-block max-w-sm mx-4 ${contentAnimationClass}`}>
        {/* Modal card */}
        <div className="relative flex flex-col items-center gap-6 p-8 rounded-2xl bg-white modal-card overflow-hidden">
        {displayContent.isError ? (
          /* Error State */
          <>
            {/* Error icon */}
            <div className="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            {/* Error message */}
            <div className="text-center">
              <h2 className="text-lg font-bold text-slate-900 mb-2">
                No Track Available
              </h2>
              <p className="text-sm text-slate-600 mb-1">
                {displayContent.errorMessage || 'Unable to load track for this selection.'}
              </p>
              <p className="text-xs text-slate-500">
                Try a different energy level or channel.
              </p>
            </div>

            {/* Dismiss button */}
            <button
              onClick={dismissLoadingError}
              className="px-6 py-2.5 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
              data-testid="loading-modal-dismiss-btn"
            >
              Dismiss
            </button>
          </>
        ) : (
          /* Loading State - Calm "focus transition" design */
          <>
            {/* Channel image / cover card - fixed 128x128, no spinner */}
            <div className="relative w-32 h-32 rounded-xl overflow-hidden shadow-lg flex-shrink-0">
              {channelImageUrl ? (
                <img 
                  src={channelImageUrl} 
                  alt={channelName || 'Channel'} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <>
                  {/* Placeholder gradient */}
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-200 to-slate-300" />
                  <div className="absolute inset-0 shimmer-animation" />
                </>
              )}
            </div>

            {/* Header: Changing to + Channel name + Energy pill */}
            <div className="flex flex-col items-center">
              <span className="text-xs text-slate-400">Changing to</span>
              <h2 className="text-lg font-bold text-slate-900 text-center truncate max-w-[250px] mt-0.5">
                {channelName || 'Loading...'}
              </h2>
              <span
                className={`mt-2 px-3 py-1 text-xs font-semibold rounded-full border ${energyColor.bg} ${energyColor.text} ${energyColor.border}`}
                data-testid="loading-modal-energy-pill"
              >
                {energyLevel.charAt(0).toUpperCase() + energyLevel.slice(1)} Energy
              </span>
            </div>

            {/* Track info - FIXED HEIGHT to prevent layout shift */}
            <div className="text-center h-10 w-[250px] flex flex-col justify-center">
              {hasTrackInfo ? (
                <>
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {trackName}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {artistName || 'Unknown Artist'}
                  </p>
                </>
              ) : (
                <>
                  {/* Skeleton placeholders - same height as real content */}
                  <div className="h-5 bg-slate-200 rounded w-40 mx-auto mb-1 shimmer-animation" />
                  <div className="h-4 bg-slate-200 rounded w-24 mx-auto shimmer-animation" />
                </>
              )}
            </div>

            {/* Ambient shimmer sweep - calming meditation-style indicator */}
            {/* Fixed height, centered, pill-shaped - no layout shift */}
            <div className="w-[70%] h-[10px] rounded-full overflow-hidden mt-3 shimmer-track" data-testid="loading-shimmer">
              <div className="w-full h-full ambient-shimmer" />
            </div>
          </>
        )}
        </div>
      </div>

      {/* CSS for animations */}
      <style>{`
        .shimmer-animation {
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.4) 50%,
            transparent 100%
          );
          animation: shimmer 1.5s infinite;
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-fade-in {
          animation: fadeIn ${FADE_IN_MS}ms ease-out forwards;
        }
        .animate-fade-out {
          animation: fadeOut ${FADE_OUT_MS}ms ease-in forwards;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        .animate-scale-in {
          animation: scaleIn 0.15s ease-out;
        }
        @keyframes scaleIn {
          from { 
            opacity: 0;
            transform: scale(0.95);
          }
          to { 
            opacity: 1;
            transform: scale(1);
          }
        }
        /* Modal card - subtle 1px border for Apple-like definition + shadow for depth */
        .modal-card {
          border: 1px solid rgba(0, 0, 0, 0.18);
          box-shadow: 
            0 4px 12px rgba(0, 0, 0, 0.08),
            0 10px 25px rgba(0, 0, 0, 0.12);
        }
        
        /* Shimmer track - neutral light gray base */
        .shimmer-track {
          background: rgba(0, 0, 0, 0.06);
        }
        
        /* Ambient shimmer sweep - calming meditation-style indicator */
        /* No progress bar ends, no "progress" implication - feels ambient */
        /* Higher contrast highlight (18-22% opacity) for visibility */
        .ambient-shimmer {
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(0, 0, 0, 0.12) 30%,
            rgba(0, 0, 0, 0.22) 50%,
            rgba(0, 0, 0, 0.12) 70%,
            transparent 100%
          );
          background-size: 200% 100%;
          animation: ambientSweep 2200ms ease-in-out infinite;
        }
        
        @keyframes ambientSweep {
          0% { 
            background-position: 100% 0;
          }
          100% { 
            background-position: -100% 0;
          }
        }
        
        /* Reduced motion: static subtle highlight instead of animation */
        @media (prefers-reduced-motion: reduce) {
          .ambient-shimmer {
            animation: none !important;
            background: rgba(0, 0, 0, 0.10);
          }
        }
      `}</style>
    </div>
  );
}


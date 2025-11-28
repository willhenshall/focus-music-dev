import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useImageSet } from '../contexts/ImageSetContext';
import { useMusicPlayer } from '../contexts/MusicPlayerContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { SlideshowDebugOverlay } from './SlideshowDebugOverlay';

type SlideshowOverlayProps = {
  onClose: () => void;
};

export function SlideshowOverlay({ onClose }: SlideshowOverlayProps) {
  const { slideshowImages, slideshowEnabled, slideshowDuration, activeImageSet, showTimerOverlay } = useImageSet();
  const { isPlaying, sessionTimerActive, sessionTimerRemaining } = useMusicPlayer();
  const { user } = useAuth();
  const [layerAIndex, setLayerAIndex] = useState(0);
  const [layerBIndex, setLayerBIndex] = useState(1);
  const [layerAVisible, setLayerAVisible] = useState(true);
  const [showDebug, setShowDebug] = useState(false);
  const [timeUntilNext, setTimeUntilNext] = useState(0);

  // Load debug preference and session timer state
  useEffect(() => {
    if (!user?.id) return;

    const loadPreferences = async () => {
      const { data } = await supabase
        .from('user_preferences')
        .select('show_slideshow_debug')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        setShowDebug(data.show_slideshow_debug || false);
      }
    };

    loadPreferences();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('slideshow_preference_updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_preferences',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new && 'show_slideshow_debug' in payload.new) {
            setShowDebug(payload.new.show_slideshow_debug);
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [user?.id]);

  // Format time for display (MM:SS)
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Slideshow logic with timing tracking
  useEffect(() => {
    if (!slideshowEnabled || !isPlaying || slideshowImages.length <= 1) {
      return;
    }

    // Initialize timer
    setTimeUntilNext(slideshowDuration);

    // Countdown timer
    const countdownInterval = setInterval(() => {
      setTimeUntilNext((prev) => Math.max(0, prev - 0.1));
    }, 100);

    let isAVisible = true; // Track which layer is visible

    // Slide transition interval
    const interval = setInterval(() => {
      setTimeUntilNext(slideshowDuration);

      // Toggle which layer is visible (crossfade)
      isAVisible = !isAVisible;
      setLayerAVisible(isAVisible);

      // After transition completes, update the now-hidden layer to prepare next image
      setTimeout(() => {
        if (isAVisible) {
          // Layer B just became hidden, update it to show next-next image
          setLayerBIndex((prev) => (prev + 2) % slideshowImages.length);
        } else {
          // Layer A just became hidden, update it to show next-next image
          setLayerAIndex((prev) => (prev + 2) % slideshowImages.length);
        }
      }, 2500);
    }, slideshowDuration * 1000);

    return () => {
      clearInterval(interval);
      clearInterval(countdownInterval);
    };
  }, [slideshowEnabled, isPlaying, slideshowImages.length, slideshowDuration]);

  if (!slideshowEnabled || slideshowImages.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all z-10"
        >
          <X size={24} />
        </button>
        <div className="text-white text-xl">No slideshow images available</div>
      </div>
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black cursor-pointer"
        onClick={onClose}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all z-10"
        >
          <X size={24} />
        </button>

        {/* Session Timer Display */}
        {sessionTimerActive && sessionTimerRemaining > 0 && showTimerOverlay && (
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 px-6 py-4 rounded-lg backdrop-blur-md bg-black/30 border border-white/20 shadow-lg z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-white/90 text-5xl font-medium tabular-nums">
              {formatTime(sessionTimerRemaining)}
            </span>
          </div>
        )}

        {/* Layer B */}
        <div
          className="absolute inset-0 transition-opacity"
          style={{
            backgroundImage: `url(${slideshowImages[layerBIndex]})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: layerAVisible ? 0 : 1,
            transitionDuration: '2500ms',
          }}
        />

        {/* Layer A */}
        <div
          className="absolute inset-0 transition-opacity"
          style={{
            backgroundImage: `url(${slideshowImages[layerAIndex]})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: layerAVisible ? 1 : 0,
            transitionDuration: '2500ms',
          }}
        />
      </div>

      {/* Debug Overlay */}
      {showDebug && (
        <SlideshowDebugOverlay
          activeImageSetName={activeImageSet?.name || 'Unknown'}
          currentImageIndex={layerAVisible ? layerAIndex : layerBIndex}
          currentImageUrl={slideshowImages[layerAVisible ? layerAIndex : layerBIndex]}
          nextImageIndex={layerAVisible ? layerBIndex : layerAIndex}
          nextImageUrl={slideshowImages[layerAVisible ? layerBIndex : layerAIndex]}
          totalImages={slideshowImages.length}
          fadeDuration={2.5}
          cycleDuration={slideshowDuration}
          isPlaying={isPlaying && slideshowEnabled}
          timeUntilNextTransition={timeUntilNext}
          isFadingOut={false}
        />
      )}
    </>
  );
}

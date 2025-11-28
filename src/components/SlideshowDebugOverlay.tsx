import { X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

type SlideshowDebugOverlayProps = {
  activeImageSetName: string;
  currentImageIndex: number;
  currentImageUrl: string;
  nextImageIndex: number;
  nextImageUrl: string;
  totalImages: number;
  fadeDuration: number;
  cycleDuration: number;
  isPlaying: boolean;
  timeUntilNextTransition: number;
  isFadingOut: boolean;
};

export function SlideshowDebugOverlay({
  activeImageSetName,
  currentImageIndex,
  currentImageUrl,
  nextImageIndex,
  nextImageUrl,
  totalImages,
  fadeDuration,
  cycleDuration,
  isPlaying,
  timeUntilNextTransition,
  isFadingOut,
}: SlideshowDebugOverlayProps) {
  const { user } = useAuth();

  const handleClose = async () => {
    if (!user?.id) return;

    await supabase
      .from('user_preferences')
      .update({ show_slideshow_debug: false })
      .eq('user_id', user.id);
  };

  const formatImageName = (url: string) => {
    if (!url) return 'None';
    const parts = url.split('/');
    const filename = parts[parts.length - 1];
    return decodeURIComponent(filename).replace(/%20/g, ' ');
  };

  const formatTime = (seconds: number) => {
    if (seconds < 0) return '0.0s';
    return `${seconds.toFixed(1)}s`;
  };

  return (
    <div className="fixed top-20 right-4 z-50 bg-slate-900/95 text-white rounded-lg shadow-2xl border-2 border-blue-500 p-4 w-96 font-mono text-xs">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
          <span className="font-bold text-sm">SLIDESHOW DEBUG</span>
        </div>
        <button
          onClick={handleClose}
          className="p-1 hover:bg-slate-700 rounded transition-colors"
          title="Close debug overlay"
        >
          <X size={16} />
        </button>
      </div>

      <div className="space-y-3">
        {/* Active Image Set */}
        <div>
          <div className="text-blue-400 font-semibold mb-1">Active Image Set</div>
          <div className="bg-slate-800 rounded p-2">
            <div className="text-green-400">{activeImageSetName}</div>
          </div>
        </div>

        {/* Current Image */}
        <div>
          <div className="text-blue-400 font-semibold mb-1">Current Image</div>
          <div className="bg-slate-800 rounded p-2 space-y-1">
            <div>
              <span className="text-slate-400">Index:</span>{' '}
              <span className="text-yellow-400">{currentImageIndex + 1}</span>
              <span className="text-slate-500"> / {totalImages}</span>
            </div>
            <div className="text-slate-300 break-all text-[10px]">
              {formatImageName(currentImageUrl)}
            </div>
          </div>
        </div>

        {/* Next Image */}
        <div>
          <div className="text-blue-400 font-semibold mb-1">Next Image (On Deck)</div>
          <div className="bg-slate-800 rounded p-2 space-y-1">
            <div>
              <span className="text-slate-400">Index:</span>{' '}
              <span className="text-yellow-400">{nextImageIndex + 1}</span>
              <span className="text-slate-500"> / {totalImages}</span>
            </div>
            <div className="text-slate-300 break-all text-[10px]">
              {formatImageName(nextImageUrl)}
            </div>
          </div>
        </div>

        {/* Timing Information */}
        <div>
          <div className="text-blue-400 font-semibold mb-1">Timing</div>
          <div className="bg-slate-800 rounded p-2 space-y-1">
            <div>
              <span className="text-slate-400">Fade Duration:</span>{' '}
              <span className="text-green-400">{formatTime(fadeDuration)}</span>
            </div>
            <div>
              <span className="text-slate-400">Cycle Duration:</span>{' '}
              <span className="text-green-400">{formatTime(cycleDuration)}</span>
            </div>
            <div>
              <span className="text-slate-400">Next Transition:</span>{' '}
              <span className="text-orange-400">{formatTime(timeUntilNextTransition)}</span>
            </div>
          </div>
        </div>

        {/* Status */}
        <div>
          <div className="text-blue-400 font-semibold mb-1">Status</div>
          <div className="bg-slate-800 rounded p-2 space-y-1">
            <div>
              <span className="text-slate-400">Playing:</span>{' '}
              <span className={isPlaying ? 'text-green-400' : 'text-red-400'}>
                {isPlaying ? 'YES' : 'NO'}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Fading:</span>{' '}
              <span className={isFadingOut ? 'text-yellow-400' : 'text-slate-500'}>
                {isFadingOut ? 'OUT' : 'STABLE'}
              </span>
            </div>
          </div>
        </div>

        {/* Total Images */}
        <div>
          <div className="text-blue-400 font-semibold mb-1">Library</div>
          <div className="bg-slate-800 rounded p-2">
            <div>
              <span className="text-slate-400">Total Images:</span>{' '}
              <span className="text-purple-400">{totalImages}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-3 pt-2 border-t border-slate-700 text-[10px] text-slate-400">
        Toggle this overlay in Dev Tools tab
      </div>
    </div>
  );
}

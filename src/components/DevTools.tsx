import { useState, useEffect } from 'react';
import { Info, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function DevTools() {
  const { user } = useAuth();
  const [showSlideshowDebug, setShowSlideshowDebug] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [debugToggleLoading, setDebugToggleLoading] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);

    try {
      if (user?.id) {
        const { data: userPrefs } = await supabase
          .from('user_preferences')
          .select('show_slideshow_debug')
          .eq('user_id', user.id)
          .maybeSingle();

        if (userPrefs) {
          setShowSlideshowDebug(userPrefs.show_slideshow_debug || false);
        }
      }
    } catch (err) {
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSlideshowDebug = async () => {
    if (!user?.id) return;

    setDebugToggleLoading(true);

    try {
      const newValue = !showSlideshowDebug;

      await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          show_slideshow_debug: newValue,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });

      setShowSlideshowDebug(newValue);
    } catch (err) {
    } finally {
      setDebugToggleLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-semibold mb-1">Developer Tools</p>
            <p className="text-blue-800">
              These settings control application behavior for testing and development purposes.
            </p>
          </div>
        </div>
      </div>

      {/* Slideshow Debug Overlay Toggle */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
        <div className="flex items-start gap-3 mb-4">
          <Eye size={24} className="text-slate-700 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-slate-900 mb-1">
              Slideshow Debug Overlay
            </h3>
            <p className="text-sm text-slate-600">
              Display diagnostic information while viewing the slideshow to debug image transitions, timing, and state.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Toggle Button */}
          <button
            onClick={toggleSlideshowDebug}
            disabled={debugToggleLoading}
            className={`w-full py-3 px-4 rounded-lg font-semibold transition-all flex items-center justify-center gap-3 ${
              showSlideshowDebug
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {debugToggleLoading ? (
              <>
                <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                Updating...
              </>
            ) : (
              <>
                {showSlideshowDebug ? (
                  <>
                    <Eye size={20} />
                    Debug Overlay Enabled
                  </>
                ) : (
                  <>
                    <EyeOff size={20} />
                    Debug Overlay Disabled
                  </>
                )}
              </>
            )}
          </button>

          {/* Status Info */}
          <div className={`flex items-start gap-2 text-sm p-3 rounded-md border ${
            showSlideshowDebug
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-slate-50 text-slate-600 border-slate-200'
          }`}>
            <Info size={16} className="flex-shrink-0 mt-0.5" />
            <div>
              {showSlideshowDebug ? (
                <span>
                  Debug overlay is <strong>active</strong>. Open the slideshow to view diagnostic information including current image, next image, timing, and status.
                </span>
              ) : (
                <span>
                  Debug overlay is <strong>disabled</strong>. Enable it to see diagnostic information while viewing the slideshow.
                </span>
              )}
            </div>
          </div>

          {/* Explanation */}
          <div className="bg-slate-50 rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium text-slate-900">Debug overlay shows:</p>
            <ul className="text-sm text-slate-600 space-y-1 ml-4 list-disc">
              <li>Active image set name</li>
              <li>Current image index and filename</li>
              <li>Next image on deck (index and filename)</li>
              <li>Fade duration and cycle duration</li>
              <li>Time until next transition (live countdown)</li>
              <li>Playing status and fading state</li>
              <li>Total images in the slideshow</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { getActiveChannelImageSet, getImageSetById, invalidateActiveChannelImageSet } from '../lib/supabaseDataCache';

type ImageSet = {
  id: string;
  name: string;
  set_type: string;
};

type ImageSetContextType = {
  selectedSlideshowSetId: string | null;
  activeChannelSetId: string | null;
  activeImageSet: ImageSet | null;
  channelImages: Record<string, string>;
  slideshowImages: string[];
  slideshowEnabled: boolean;
  slideshowDuration: number;
  loadingImages: boolean;
  showTimerOverlay: boolean;
  setShowTimerOverlay: (show: boolean) => void;
  refreshImageSets: () => Promise<void>;
};

const ImageSetContext = createContext<ImageSetContextType | undefined>(undefined);

export function ImageSetProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [selectedSlideshowSetId, setSelectedSlideshowSetId] = useState<string | null>(null);
  const [activeChannelSetId, setActiveChannelSetId] = useState<string | null>(null);
  const [activeImageSet, setActiveImageSet] = useState<ImageSet | null>(null);
  const [channelImages, setChannelImages] = useState<Record<string, string>>({});
  const [slideshowImages, setSlideshowImages] = useState<string[]>([]);
  const [slideshowEnabled, setSlideshowEnabled] = useState(false);
  const [slideshowDuration, setSlideshowDuration] = useState(30);
  const [loadingImages, setLoadingImages] = useState(false);
  const [showTimerOverlay, setShowTimerOverlay] = useState(true);

  useEffect(() => {
    // Always load active channel set (even for non-authenticated users)
    loadActiveChannelSet();

    if (user?.id) {
      loadUserPreferences();

      // Subscribe to changes in user_image_preferences
      const subscription = supabase
        .channel('user_image_preferences_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_image_preferences',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            // Reload preferences when they change
            loadUserPreferences();
          }
        )
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [user]);

  useEffect(() => {
    if (selectedSlideshowSetId) {
      loadSlideshowImages(selectedSlideshowSetId);
    }
  }, [selectedSlideshowSetId]);

  useEffect(() => {
    if (activeChannelSetId) {
      loadChannelImages(activeChannelSetId);
    }
  }, [activeChannelSetId]);

  const loadUserPreferences = async () => {
    if (!user?.id) return;

    const { data } = await supabase
      .from('user_image_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data) {
      setSelectedSlideshowSetId(data.selected_slideshow_set_id);
      setSlideshowEnabled(data.slideshow_enabled);
      setSlideshowDuration(data.slideshow_duration);

      // Load the image set details using cache to prevent duplicate calls
      if (data.selected_slideshow_set_id) {
        const imageSet = await getImageSetById(data.selected_slideshow_set_id);

        if (imageSet) {
          setActiveImageSet(imageSet);
        }
      }
    }
  };

  const loadActiveChannelSet = async () => {
    // Use cached active channel image set
    const data = await getActiveChannelImageSet();

    if (data) {
      setActiveChannelSetId(data.id);
    }
  };

  const loadChannelImages = async (setId: string) => {
    setLoadingImages(true);

    const { data } = await supabase
      .from('image_set_images')
      .select('channel_id, image_url')
      .eq('image_set_id', setId);

    if (data) {
      const imagesMap: Record<string, string> = {};
      data.forEach((img) => {
        if (img.channel_id) {
          imagesMap[img.channel_id] = img.image_url;
        }
      });
      setChannelImages(imagesMap);
    }

    setLoadingImages(false);
  };

  const loadSlideshowImages = async (setId: string) => {
    setLoadingImages(true);

    const { data } = await supabase
      .from('slideshow_images')
      .select('image_url')
      .eq('image_set_id', setId)
      .order('display_order', { ascending: true });

    if (data) {
      setSlideshowImages(data.map(img => img.image_url));
    }

    setLoadingImages(false);
  };

  const refreshImageSets = async () => {
    // Invalidate cache and reload
    invalidateActiveChannelImageSet();
    await loadActiveChannelSet();
    if (selectedSlideshowSetId) {
      await loadSlideshowImages(selectedSlideshowSetId);
    }
  };

  return (
    <ImageSetContext.Provider
      value={{
        selectedSlideshowSetId,
        activeChannelSetId,
        activeImageSet,
        channelImages,
        slideshowImages,
        slideshowEnabled,
        slideshowDuration,
        loadingImages,
        showTimerOverlay,
        setShowTimerOverlay,
        refreshImageSets,
      }}
    >
      {children}
    </ImageSetContext.Provider>
  );
}

export function useImageSet() {
  const context = useContext(ImageSetContext);
  if (context === undefined) {
    throw new Error('useImageSet must be used within an ImageSetProvider');
  }
  return context;
}

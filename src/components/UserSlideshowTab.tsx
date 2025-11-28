import { useState, useEffect } from 'react';
import { Presentation, Play, Pause, Clock, Upload, Trash2, Check, X, AlertCircle, Image as ImageIcon, HelpCircle, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useImageSet } from '../contexts/ImageSetContext';
import { resizeImage } from '../lib/imageProcessor';

type SlideshowSet = {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_by: string | null;
  image_count?: number;
};

export default function UserSlideshowTab() {
  const { user } = useAuth();
  const { showTimerOverlay, setShowTimerOverlay } = useImageSet();
  const [slideshowSets, setSlideshowSets] = useState<SlideshowSet[]>([]);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [slideshowEnabled, setSlideshowEnabled] = useState(false);
  const [slideshowDuration, setSlideshowDuration] = useState(30);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSetName, setNewSetName] = useState('');
  const [newSetDescription, setNewSetDescription] = useState('');
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    loadSlideshowSets();
    loadUserPreferences();
  }, [user]);

  useEffect(() => {
    if (selectedSetId) {
      loadPreviewImages(selectedSetId);
    }
  }, [selectedSetId]);

  const loadSlideshowSets = async () => {
    const { data: systemSets } = await supabase
      .from('image_sets')
      .select('*')
      .eq('set_type', 'slideshow')
      .eq('is_system', true)
      .eq('is_active', true)
      .order('name');

    const { data: userSets } = await supabase
      .from('image_sets')
      .select('*')
      .eq('set_type', 'slideshow')
      .eq('is_system', false)
      .eq('created_by', user?.id)
      .order('name');

    const allSets = [...(systemSets || []), ...(userSets || [])];

    const setsWithCounts = await Promise.all(
      allSets.map(async (set) => {
        const { count } = await supabase
          .from('slideshow_images')
          .select('*', { count: 'exact', head: true })
          .eq('image_set_id', set.id);
        return { ...set, image_count: count || 0 };
      })
    );

    setSlideshowSets(setsWithCounts);
    setLoading(false);
  };

  const loadUserPreferences = async () => {
    if (!user?.id) return;

    const { data } = await supabase
      .from('user_image_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data) {
      setSelectedSetId(data.selected_slideshow_set_id);
      setSlideshowEnabled(data.slideshow_enabled);
      setSlideshowDuration(data.slideshow_duration);
    }
  };

  const loadPreviewImages = async (setId: string) => {
    const { data } = await supabase
      .from('slideshow_images')
      .select('image_url')
      .eq('image_set_id', setId)
      .order('display_order')
      .limit(12);

    if (data) {
      setPreviewImages(data.map(img => img.image_url));
    }
  };

  const savePreferences = async (showSuccessMessage = true) => {
    if (!user?.id) return;

    setSaving(true);

    const { error } = await supabase
      .from('user_image_preferences')
      .upsert({
        user_id: user.id,
        selected_slideshow_set_id: selectedSetId,
        slideshow_enabled: slideshowEnabled,
        slideshow_duration: slideshowDuration,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      });

    if (error) {
      setMessage({ type: 'error', text: 'Failed to save preferences' });
    } else if (showSuccessMessage) {
      setMessage({ type: 'success', text: 'Slideshow preferences saved' });
      setTimeout(() => setMessage(null), 3000);
    }

    setSaving(false);
  };

  const handleSlideshowSelect = async (setId: string) => {
    setSelectedSetId(setId);

    // Auto-save when user selects a slideshow
    if (!user?.id) return;

    const { error } = await supabase
      .from('user_image_preferences')
      .upsert({
        user_id: user.id,
        selected_slideshow_set_id: setId,
        slideshow_enabled: slideshowEnabled,
        slideshow_duration: slideshowDuration,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      });

    if (error) {
      setMessage({ type: 'error', text: 'Failed to save slideshow selection' });
    } else {
      setMessage({ type: 'success', text: 'Slideshow selected' });
      setTimeout(() => setMessage(null), 2000);
    }
  };

  const createCustomSlideshow = async () => {
    if (!newSetName.trim()) {
      setMessage({ type: 'error', text: 'Please enter a name for your slideshow' });
      return;
    }

    const { data, error } = await supabase
      .from('image_sets')
      .insert({
        name: newSetName,
        description: newSetDescription || null,
        set_type: 'slideshow',
        is_system: false,
        created_by: user?.id,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      setMessage({ type: 'error', text: 'Failed to create slideshow' });
    } else {
      setMessage({ type: 'success', text: 'Slideshow created! Now add images below.' });
      setShowCreateModal(false);
      setNewSetName('');
      setNewSetDescription('');
      loadSlideshowSets();
      setSelectedSetId(data.id);
    }
  };

  const deleteCustomSlideshow = async (setId: string) => {
    if (!confirm('Are you sure you want to delete this slideshow? All images will be permanently removed.')) {
      return;
    }

    const { error } = await supabase
      .from('image_sets')
      .delete()
      .eq('id', setId)
      .eq('created_by', user?.id);

    if (error) {
      setMessage({ type: 'error', text: 'Failed to delete slideshow' });
    } else {
      setMessage({ type: 'success', text: 'Slideshow deleted' });
      if (selectedSetId === setId) {
        setSelectedSetId(null);
      }
      loadSlideshowSets();
    }
  };

  const uploadSlideshowImages = async (setId: string, files: FileList) => {
    if (!user?.id) return;

    const currentSet = slideshowSets.find(s => s.id === setId);
    const currentCount = currentSet?.image_count || 0;

    if (currentCount + files.length > 20) {
      setMessage({
        type: 'error',
        text: `Cannot upload ${files.length} images. Maximum 20 images per slideshow (currently ${currentCount}).`
      });
      return;
    }

    setUploadingImages(true);
    setUploadProgress(0);

    const totalFiles = files.length;
    let uploaded = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Optimize image to 1920x1080 max with 85% quality
      let processedBlob: Blob;
      try {
        processedBlob = await resizeImage(file, 1920, 1080);
      } catch (error) {
        console.error('Failed to optimize image:', error);
        continue;
      }

      const fileName = `${user.id}/${setId}/${Date.now()}_${i}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('image-sets')
        .upload(fileName, processedBlob);

      if (uploadError) {
        continue;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('image-sets')
        .getPublicUrl(fileName);

      await supabase
        .from('slideshow_images')
        .insert({
          image_set_id: setId,
          image_url: publicUrl,
          display_order: currentCount + i,
        });

      uploaded++;
      setUploadProgress(Math.round((uploaded / totalFiles) * 100));
    }

    setUploadingImages(false);
    setMessage({ type: 'success', text: `Successfully uploaded ${uploaded} images` });
    loadSlideshowSets();
    if (selectedSetId === setId) {
      loadPreviewImages(setId);
    }
  };

  const handleFileSelect = (setId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadSlideshowImages(setId, e.target.files);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-900 border-t-transparent" />
      </div>
    );
  }

  const selectedSet = slideshowSets.find(s => s.id === selectedSetId);
  const canUploadToSelected = selectedSet && !selectedSet.is_system;

  return (
    <div className="mt-6 space-y-6">
      {message && (
        <div
          className={`p-4 rounded-lg flex items-start gap-3 ${
            message.type === 'success'
              ? 'bg-green-50 text-green-900 border border-green-200'
              : 'bg-red-50 text-red-900 border border-red-200'
          }`}
        >
          {message.type === 'success' ? (
            <Check size={20} className="flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
          )}
          <p className="flex-1">{message.text}</p>
          <button onClick={() => setMessage(null)}>
            <X size={20} />
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 group">
            <h3 className="text-lg font-semibold text-slate-900">Available Slideshows</h3>
            <div className="relative">
              <HelpCircle size={18} className="text-slate-400 hover:text-slate-600 cursor-help transition-colors" />
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-3 bg-slate-900 text-white text-sm rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all pointer-events-none z-10">
                Select a slideshow to display when you expand the music player to fullscreen
                <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900"></div>
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm"
          >
            <Upload size={16} />
            Upload
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {slideshowSets.map((set) => (
            <div
              key={set.id}
              className={`relative border-2 rounded-lg p-4 transition-all cursor-pointer ${
                selectedSetId === set.id
                  ? 'border-slate-900 bg-slate-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
              onClick={() => handleSlideshowSelect(set.id)}
            >
              {selectedSetId === set.id && (
                <div className="absolute top-3 right-3 w-6 h-6 bg-slate-900 rounded-full flex items-center justify-center">
                  <Check size={14} className="text-white" strokeWidth={3} />
                </div>
              )}

              {!set.is_system && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteCustomSlideshow(set.id);
                  }}
                  className="absolute top-3 left-3 p-1 bg-white rounded shadow-sm text-red-600 hover:text-red-700 hover:shadow transition-all"
                >
                  <Trash2 size={14} />
                </button>
              )}

              <div className={`${!set.is_system ? 'mt-8' : ''}`}>
                <h4 className="font-semibold text-slate-900 mb-1">{set.name}</h4>
                {set.description && (
                  <p className="text-sm text-slate-600 mb-2">{set.description}</p>
                )}
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <ImageIcon size={14} />
                  <span>{set.image_count || 0} images</span>
                  {!set.is_system && (
                    <span className="ml-auto px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                      My Slideshow
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {canUploadToSelected && (
          <div className="mt-6 pt-6 border-t border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-slate-900">
                Manage "{selectedSet.name}" Images
              </h4>
              <label className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm cursor-pointer">
                <Upload size={16} />
                Add Images
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileSelect(selectedSetId!, e)}
                  disabled={uploadingImages}
                />
              </label>
            </div>
            <p className="text-sm text-slate-600 mb-3">
              {selectedSet.image_count || 0} of 20 images used
            </p>

            {uploadingImages && (
              <div className="mb-4">
                <div className="flex items-center justify-between text-sm text-slate-600 mb-2">
                  <span>Uploading...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className="bg-slate-900 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {selectedSetId && previewImages.length > 0 && (
          <div className="mt-6 pt-6 border-t border-slate-200">
            <h4 className="font-medium text-slate-900 mb-3">Preview</h4>
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {previewImages.map((url, idx) => (
                <div key={idx} className="relative">
                  <img
                    src={url}
                    alt={`Slide ${idx + 1}`}
                    className="w-full h-24 object-cover rounded-lg"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Slideshow Playback Settings
        </h3>
        <p className="text-sm text-slate-600 mb-4">
          When you expand the music player to fullscreen while music is playing, your selected slideshow will display.
        </p>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-3">
              {slideshowEnabled ? (
                <Play size={20} className="text-green-600" />
              ) : (
                <Pause size={20} className="text-slate-400" />
              )}
              <div>
                <p className="font-medium text-slate-900">Enable Slideshow</p>
                <p className="text-sm text-slate-600">
                  Show slideshow when player is expanded
                </p>
              </div>
            </div>
            <button
              onClick={async () => {
                const newValue = !slideshowEnabled;
                setSlideshowEnabled(newValue);

                // Auto-save when toggling
                if (!user?.id) return;

                const { error } = await supabase
                  .from('user_image_preferences')
                  .upsert({
                    user_id: user.id,
                    selected_slideshow_set_id: selectedSetId,
                    slideshow_enabled: newValue,
                    slideshow_duration: slideshowDuration,
                    updated_at: new Date().toISOString(),
                  }, {
                    onConflict: 'user_id'
                  });

                if (error) {
                  setMessage({ type: 'error', text: 'Failed to save setting' });
                }
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                slideshowEnabled ? 'bg-green-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  slideshowEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {slideshowEnabled && (
            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-3 mb-3">
                <Clock size={20} className="text-slate-600" />
                <p className="font-medium text-slate-900">Image Duration</p>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="5"
                  max="120"
                  step="5"
                  value={slideshowDuration}
                  onChange={(e) => setSlideshowDuration(parseInt(e.target.value))}
                  onMouseUp={async () => {
                    // Auto-save when user releases slider
                    if (!user?.id) return;

                    const { error } = await supabase
                      .from('user_image_preferences')
                      .upsert({
                        user_id: user.id,
                        selected_slideshow_set_id: selectedSetId,
                        slideshow_enabled: slideshowEnabled,
                        slideshow_duration: slideshowDuration,
                        updated_at: new Date().toISOString(),
                      }, {
                        onConflict: 'user_id'
                      });

                    if (error) {
                      setMessage({ type: 'error', text: 'Failed to save duration' });
                    }
                  }}
                  onTouchEnd={async () => {
                    // Auto-save on mobile when user releases slider
                    if (!user?.id) return;

                    const { error } = await supabase
                      .from('user_image_preferences')
                      .upsert({
                        user_id: user.id,
                        selected_slideshow_set_id: selectedSetId,
                        slideshow_enabled: slideshowEnabled,
                        slideshow_duration: slideshowDuration,
                        updated_at: new Date().toISOString(),
                      }, {
                        onConflict: 'user_id'
                      });

                    if (error) {
                      setMessage({ type: 'error', text: 'Failed to save duration' });
                    }
                  }}
                  className="flex-1"
                />
                <span className="text-sm font-medium text-slate-900 w-20">
                  {slideshowDuration}s
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-2">
                Each image will display for {slideshowDuration} seconds with smooth crossfade transitions
              </p>
            </div>
          )}

          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-3">
              <Eye size={20} className="text-slate-600" />
              <div>
                <p className="font-medium text-slate-900">Show Timer Overlay</p>
                <p className="text-sm text-slate-600">
                  Display session timer on slideshow when active
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowTimerOverlay(!showTimerOverlay)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                showTimerOverlay ? 'bg-green-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  showTimerOverlay ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Create My Slideshow</h3>
            <p className="text-sm text-slate-600 mb-4">
              Create your own personal slideshow with up to 20 images. Your images are saved to your account and will be available on any device you log in from.
            </p>

            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Slideshow Name</label>
                <input
                  type="text"
                  value={newSetName}
                  onChange={(e) => setNewSetName(e.target.value)}
                  placeholder="My Work Focus Images"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Description (optional)</label>
                <input
                  type="text"
                  value={newSetDescription}
                  onChange={(e) => setNewSetDescription(e.target.value)}
                  placeholder="Calming nature scenes"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={createCustomSlideshow}
                className="flex-1 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewSetName('');
                  setNewSetDescription('');
                }}
                className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Images, Play, Pause, Clock, Upload, Trash2, Check, X, AlertCircle, Edit } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import CustomImageSetEditor from './CustomImageSetEditor';

type ImageSet = {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_by: string | null;
  image_count?: number;
};

type ImagePreview = {
  channel_name: string;
  image_url: string;
};

export default function UserImagesTab() {
  const { user } = useAuth();
  const [imageSets, setImageSets] = useState<ImageSet[]>([]);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [slideshowEnabled, setSlideshowEnabled] = useState(false);
  const [slideshowDuration, setSlideshowDuration] = useState(30);
  const [previewImages, setPreviewImages] = useState<ImagePreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showCustomSetModal, setShowCustomSetModal] = useState(false);
  const [customSetName, setCustomSetName] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSet, setEditingSet] = useState<ImageSet | null>(null);
  const [channels, setChannels] = useState<any[]>([]);

  useEffect(() => {
    loadImageSets();
    loadUserPreferences();
    loadChannels();
  }, [user]);

  useEffect(() => {
    if (selectedSetId) {
      loadPreviewImages(selectedSetId);
    }
  }, [selectedSetId]);

  const loadChannels = async () => {
    const { data } = await supabase
      .from('audio_channels')
      .select('id, channel_name')
      .order('channel_name');

    if (data) {
      setChannels(data);
    }
  };

  const loadImageSets = async () => {
    const { data: systemSets } = await supabase
      .from('image_sets')
      .select('*')
      .eq('is_system', true)
      .eq('is_active', true)
      .order('name');

    const { data: userSets } = await supabase
      .from('image_sets')
      .select('*')
      .eq('is_system', false)
      .eq('created_by', user?.id)
      .order('name');

    const allSets = [...(systemSets || []), ...(userSets || [])];

    const setsWithCounts = await Promise.all(
      allSets.map(async (set) => {
        const { count } = await supabase
          .from('image_set_images')
          .select('*', { count: 'exact', head: true })
          .eq('image_set_id', set.id);
        return { ...set, image_count: count || 0 };
      })
    );

    setImageSets(setsWithCounts);
    setLoading(false);
  };

  const loadUserPreferences = async () => {
    if (!user?.id) return;

    const { data, error } = await supabase
      .from('user_image_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data && !error) {
      setSelectedSetId(data.selected_image_set_id);
      setSlideshowEnabled(data.slideshow_enabled);
      setSlideshowDuration(data.slideshow_duration);
    }
  };

  const loadPreviewImages = async (setId: string) => {
    const { data, error } = await supabase
      .from('image_set_images')
      .select(`
        image_url,
        audio_channels (channel_name)
      `)
      .eq('image_set_id', setId)
      .limit(6);

    if (data && !error) {
      const formatted = data.map((img: any) => ({
        channel_name: img.audio_channels?.channel_name || 'Unknown',
        image_url: img.image_url,
      }));
      setPreviewImages(formatted);
    }
  };

  const savePreferences = async () => {
    if (!user?.id) return;

    setSaving(true);

    const { error } = await supabase
      .from('user_image_preferences')
      .upsert({
        user_id: user.id,
        selected_image_set_id: selectedSetId,
        slideshow_enabled: slideshowEnabled,
        slideshow_duration: slideshowDuration,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      });

    if (error) {
      setMessage({ type: 'error', text: 'Failed to save preferences' });
    } else {
      setMessage({ type: 'success', text: 'Preferences saved successfully' });
    }

    setSaving(false);
  };

  const createCustomSet = async () => {
    if (!customSetName.trim()) {
      setMessage({ type: 'error', text: 'Please enter a name for your custom image set' });
      return;
    }

    const { data, error } = await supabase
      .from('image_sets')
      .insert({
        name: customSetName,
        is_system: false,
        created_by: user?.id,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      setMessage({ type: 'error', text: 'Failed to create custom image set' });
    } else {
      setMessage({ type: 'success', text: 'Custom image set created' });
      setShowCustomSetModal(false);
      setCustomSetName('');
      loadImageSets();
      setSelectedSetId(data.id);
    }
  };

  const deleteCustomSet = async (setId: string) => {
    if (!confirm('Are you sure you want to delete this custom image set?')) {
      return;
    }

    const { error } = await supabase
      .from('image_sets')
      .delete()
      .eq('id', setId)
      .eq('created_by', user?.id);

    if (error) {
      setMessage({ type: 'error', text: 'Failed to delete image set' });
    } else {
      setMessage({ type: 'success', text: 'Image set deleted' });
      if (selectedSetId === setId) {
        setSelectedSetId(null);
      }
      loadImageSets();
    }
  };

  const uploadImageForChannel = async (setId: string, channelId: string, file: File) => {
    if (!user?.id) return;

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${setId}/${channelId}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('image-sets')
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      setMessage({ type: 'error', text: `Failed to upload: ${uploadError.message}` });
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('image-sets')
      .getPublicUrl(fileName);

    const { error: dbError } = await supabase
      .from('image_set_images')
      .upsert({
        image_set_id: setId,
        channel_id: channelId,
        image_url: publicUrl,
      });

    if (dbError) {
      setMessage({ type: 'error', text: 'Failed to save image' });
    } else {
      setMessage({ type: 'success', text: 'Image uploaded successfully' });
      loadPreviewImages(setId);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-900 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Image Settings</h2>
        <p className="text-slate-600">
          Choose an image set for your channel cards and configure slideshow settings
        </p>
      </div>

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
          <h3 className="text-lg font-semibold text-slate-900">Available Image Sets</h3>
          <button
            onClick={() => setShowCustomSetModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm"
          >
            <Upload size={16} />
            Create Custom Set
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {imageSets.map((set) => (
            <div
              key={set.id}
              className={`relative border-2 rounded-lg p-4 transition-all cursor-pointer ${
                selectedSetId === set.id
                  ? 'border-slate-900 bg-slate-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
              onClick={() => setSelectedSetId(set.id)}
            >
              {selectedSetId === set.id && (
                <div className="absolute top-3 right-3 w-6 h-6 bg-slate-900 rounded-full flex items-center justify-center">
                  <Check size={14} className="text-white" strokeWidth={3} />
                </div>
              )}

              {!set.is_system && (
                <div className="absolute top-3 left-3 flex gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingSet(set);
                      setShowEditModal(true);
                    }}
                    className="p-1 bg-white rounded shadow-sm text-slate-600 hover:text-slate-900 hover:shadow transition-all"
                  >
                    <Edit size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteCustomSet(set.id);
                    }}
                    className="p-1 bg-white rounded shadow-sm text-red-600 hover:text-red-700 hover:shadow transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}

              <div className={`${!set.is_system ? 'mt-8' : ''}`}>
                <h4 className="font-semibold text-slate-900 mb-1">{set.name}</h4>
                {set.description && (
                  <p className="text-sm text-slate-600 mb-2">{set.description}</p>
                )}
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Images size={14} />
                  <span>{set.image_count || 0} images</span>
                  {!set.is_system && (
                    <span className="ml-auto px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                      Custom
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {selectedSetId && previewImages.length > 0 && (
          <div className="mt-6 pt-6 border-t border-slate-200">
            <h4 className="font-medium text-slate-900 mb-3">Preview Images</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {previewImages.map((img, idx) => (
                <div key={idx} className="group relative">
                  <img
                    src={img.image_url}
                    alt={img.channel_name}
                    className="w-full h-24 object-cover rounded-lg"
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-60 transition-all rounded-lg flex items-center justify-center">
                    <p className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity px-2 text-center">
                      {img.channel_name}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">
          Fullscreen Slideshow Settings
        </h3>
        <p className="text-sm text-slate-600 mb-4">
          When you expand the music player to fullscreen, optionally display a slideshow of images
          from your selected image set.
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
                  Show rotating images in fullscreen mode
                </p>
              </div>
            </div>
            <button
              onClick={() => setSlideshowEnabled(!slideshowEnabled)}
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
                  className="flex-1"
                />
                <span className="text-sm font-medium text-slate-900 w-20">
                  {slideshowDuration}s
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-2">
                Each image will be displayed for {slideshowDuration} seconds with smooth fade
                transitions
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={savePreferences}
          disabled={saving}
          className="px-6 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 font-medium"
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>

      {showCustomSetModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Create Custom Image Set</h3>
            <p className="text-sm text-slate-600 mb-4">
              Create your own personal image set. You'll be able to upload custom images for each
              channel.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">Set Name</label>
              <input
                type="text"
                value={customSetName}
                onChange={(e) => setCustomSetName(e.target.value)}
                placeholder="My Custom Images"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={createCustomSet}
                className="flex-1 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowCustomSetModal(false);
                  setCustomSetName('');
                }}
                className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && editingSet && (
        <CustomImageSetEditor
          imageSetId={editingSet.id}
          imageSetName={editingSet.name}
          onClose={() => {
            setShowEditModal(false);
            setEditingSet(null);
          }}
          onUpdate={() => {
            loadImageSets();
            if (selectedSetId === editingSet.id) {
              loadPreviewImages(selectedSetId);
            }
          }}
        />
      )}
    </div>
  );
}

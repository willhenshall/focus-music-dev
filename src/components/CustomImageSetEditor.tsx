import { useState, useEffect } from 'react';
import { Upload, Trash2, X, Check, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type Channel = {
  id: string;
  channel_name: string;
};

type ImageSetImage = {
  id: string;
  channel_id: string;
  image_url: string;
};

type Props = {
  imageSetId: string;
  imageSetName: string;
  onClose: () => void;
  onUpdate: () => void;
};

export default function CustomImageSetEditor({ imageSetId, imageSetName, onClose, onUpdate }: Props) {
  const { user } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [setImages, setSetImages] = useState<ImageSetImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadChannels();
    loadSetImages();
  }, []);

  const loadChannels = async () => {
    const { data } = await supabase
      .from('audio_channels')
      .select('id, channel_name')
      .order('channel_name');

    if (data) {
      setChannels(data);
    }
  };

  const loadSetImages = async () => {
    const { data } = await supabase
      .from('image_set_images')
      .select('id, channel_id, image_url')
      .eq('image_set_id', imageSetId);

    if (data) {
      setSetImages(data);
    }
  };

  const uploadImage = async (channelId: string, file: File) => {
    if (!user?.id) return;

    setUploading(true);

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/${imageSetId}/${channelId}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('image-sets')
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      setMessage({ type: 'error', text: `Upload failed: ${uploadError.message}` });
      setUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('image-sets')
      .getPublicUrl(fileName);

    const { error: dbError } = await supabase
      .from('image_set_images')
      .upsert({
        image_set_id: imageSetId,
        channel_id: channelId,
        image_url: publicUrl,
      });

    if (dbError) {
      setMessage({ type: 'error', text: 'Failed to save image reference' });
    } else {
      setMessage({ type: 'success', text: 'Image uploaded successfully' });
      loadSetImages();
      onUpdate();
    }

    setUploading(false);
  };

  const deleteImage = async (imageId: string) => {
    const { error } = await supabase
      .from('image_set_images')
      .delete()
      .eq('id', imageId);

    if (error) {
      setMessage({ type: 'error', text: 'Failed to delete image' });
    } else {
      setMessage({ type: 'success', text: 'Image deleted successfully' });
      loadSetImages();
      onUpdate();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-slate-900">Edit {imageSetName}</h3>
            <p className="text-sm text-slate-600 mt-1">
              Upload custom images for each channel
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {message && (
          <div
            className={`mx-6 mt-4 p-4 rounded-lg flex items-start gap-3 ${
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

        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-3">
            {channels.map((channel) => {
              const existingImage = setImages.find(img => img.channel_id === channel.id);

              return (
                <div
                  key={channel.id}
                  className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200"
                >
                  <div className="w-24 h-24 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                    {existingImage ? (
                      <img
                        src={existingImage.image_url}
                        alt={channel.channel_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon size={32} className="text-slate-400" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1">
                    <h4 className="font-medium text-slate-900">{channel.channel_name}</h4>
                    {existingImage && (
                      <p className="text-xs text-green-600 mt-1">Image uploaded</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="px-4 py-2 text-sm bg-slate-900 text-white rounded-lg cursor-pointer hover:bg-slate-800 transition-colors">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadImage(channel.id, file);
                        }}
                        disabled={uploading}
                      />
                      <Upload size={16} className="inline mr-2" />
                      {existingImage ? 'Replace' : 'Upload'}
                    </label>
                    {existingImage && (
                      <button
                        onClick={() => deleteImage(existingImage.id)}
                        className="p-2 text-red-600 hover:text-red-700 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-6 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Image, Plus, Trash2, Upload, Check, X, AlertCircle, CheckCircle, HelpCircle, Download, FileUp, Copy, Edit2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import JSZip from 'jszip';

type ChannelImageSet = {
  id: string;
  name: string;
  description: string | null;
  is_active_channel_set: boolean;
  created_at: string;
  image_count?: number;
};

type Channel = {
  id: string;
  channel_name: string;
};

type ChannelImage = {
  channel_id: string;
  channel_name: string;
  image_url: string | null;
};

export default function ChannelImagesTab() {
  const [imageSets, setImageSets] = useState<ChannelImageSet[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedSet, setSelectedSet] = useState<ChannelImageSet | null>(null);
  const [channelImages, setChannelImages] = useState<ChannelImage[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSetName, setNewSetName] = useState('');
  const [newSetDescription, setNewSetDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameSetId, setRenameSetId] = useState<string>('');
  const [renameName, setRenameName] = useState('');
  const [renameDescription, setRenameDescription] = useState('');

  useEffect(() => {
    loadImageSets();
    loadChannels();
  }, []);

  useEffect(() => {
    if (selectedSet) {
      loadChannelImages(selectedSet.id);
    }
  }, [selectedSet]);

  const loadImageSets = async () => {
    const { data } = await supabase
      .from('image_sets')
      .select('*')
      .eq('set_type', 'channel')
      .order('created_at', { ascending: false });

    if (data) {
      const setsWithCounts = await Promise.all(
        data.map(async (set) => {
          const { count } = await supabase
            .from('image_set_images')
            .select('*', { count: 'exact', head: true })
            .eq('image_set_id', set.id);
          return { ...set, image_count: count || 0 };
        })
      );
      setImageSets(setsWithCounts);

      const activeSet = setsWithCounts.find(s => s.is_active_channel_set);
      if (activeSet) {
        setSelectedSet(activeSet);
      }
    }
  };

  const loadChannels = async () => {
    const { data } = await supabase
      .from('audio_channels')
      .select('id, channel_name')
      .order('channel_name');

    if (data) {
      setChannels(data);
    }
  };

  const loadChannelImages = async (setId: string) => {
    const { data } = await supabase
      .from('image_set_images')
      .select(`
        channel_id,
        image_url,
        audio_channels (channel_name)
      `)
      .eq('image_set_id', setId);

    if (data) {
      const formatted = data.map((img: any) => ({
        channel_id: img.channel_id,
        channel_name: img.audio_channels?.channel_name || 'Unknown',
        image_url: img.image_url,
      }));

      const allChannels = channels.map(ch => ({
        channel_id: ch.id,
        channel_name: ch.channel_name,
        image_url: formatted.find(f => f.channel_id === ch.id)?.image_url || null,
      }));

      setChannelImages(allChannels);
    }
  };

  const createImageSet = async () => {
    if (!newSetName.trim()) {
      setMessage({ type: 'error', text: 'Please enter a name for the image set' });
      return;
    }

    const { data, error } = await supabase
      .from('image_sets')
      .insert({
        name: newSetName,
        description: newSetDescription || null,
        set_type: 'channel',
        is_system: true,
        is_active: true,
        is_active_channel_set: false,
      })
      .select()
      .single();

    if (error) {
      setMessage({ type: 'error', text: 'Failed to create image set' });
    } else {
      setMessage({ type: 'success', text: 'Image set created successfully' });
      setShowCreateModal(false);
      setNewSetName('');
      setNewSetDescription('');
      loadImageSets();
      setSelectedSet(data);
    }
  };

  const deleteImageSet = async (setId: string) => {
    if (!confirm('Are you sure you want to delete this image set? All associated images will be removed.')) {
      return;
    }

    // First delete related images
    const { error: imagesError } = await supabase
      .from('image_set_images')
      .delete()
      .eq('image_set_id', setId);

    if (imagesError) {
      setMessage({ type: 'error', text: `Failed to delete images: ${imagesError.message}` });
      return;
    }

    // Then delete the image set
    const { data: deleteData, error } = await supabase
      .from('image_sets')
      .delete()
      .eq('id', setId)
      .select();

    if (error) {
      setMessage({ type: 'error', text: `Failed to delete image set: ${error.message}` });
    } else if (!deleteData || deleteData.length === 0) {
      setMessage({ type: 'error', text: 'Failed to delete image set: Permission denied or set not found' });
    } else {
      setMessage({ type: 'success', text: 'Image set deleted successfully' });
      if (selectedSet?.id === setId) {
        setSelectedSet(null);
      }
      await loadImageSets();
    }
  };

  const setAsActive = async (setId: string) => {
    if (!confirm('Set this as the active channel image set? This will be displayed to all users on their channel cards.')) {
      return;
    }

    // First, deactivate all other sets
    await supabase
      .from('image_sets')
      .update({ is_active_channel_set: false })
      .eq('set_type', 'channel');

    // Then activate this one
    const { error } = await supabase
      .from('image_sets')
      .update({ is_active_channel_set: true })
      .eq('id', setId);

    if (error) {
      setMessage({ type: 'error', text: 'Failed to set as active' });
    } else {
      setMessage({ type: 'success', text: 'This image set is now active for all users' });
      loadImageSets();
    }
  };

  const uploadChannelImage = async (channelId: string, file: File) => {
    if (!selectedSet) return;

    setUploading(true);

    const fileExt = file.name.split('.').pop();
    const fileName = `admin/${selectedSet.id}/${channelId}.${fileExt}`;

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

    // Check if an image already exists for this channel in this set
    const { data: existingImage } = await supabase
      .from('image_set_images')
      .select('id')
      .eq('image_set_id', selectedSet.id)
      .eq('channel_id', channelId)
      .maybeSingle();

    let dbError;
    if (existingImage) {
      // Update existing record
      const result = await supabase
        .from('image_set_images')
        .update({ image_url: publicUrl })
        .eq('id', existingImage.id);
      dbError = result.error;
    } else {
      // Insert new record
      const result = await supabase
        .from('image_set_images')
        .insert({
          image_set_id: selectedSet.id,
          channel_id: channelId,
          image_url: publicUrl,
        });
      dbError = result.error;
    }

    if (dbError) {
      setMessage({ type: 'error', text: 'Failed to save image' });
    } else {
      setMessage({ type: 'success', text: 'Image uploaded successfully' });
      loadChannelImages(selectedSet.id);
      loadImageSets();
    }

    setUploading(false);
  };

  const handleExportImageSet = async (setId: string, setName: string) => {
    if (!confirm(`Export the "${setName}" image set? This will download a ZIP file containing all images and a CSV file with the mapping.`)) {
      return;
    }

    setExporting(true);

    try {
      // Fetch all images for this set
      const { data: images, error } = await supabase
        .from('image_set_images')
        .select(`
          channel_id,
          image_url,
          audio_channels (channel_name)
        `)
        .eq('image_set_id', setId);

      if (error) throw error;

      if (!images || images.length === 0) {
        setMessage({ type: 'error', text: 'No images found in this set' });
        setExporting(false);
        return;
      }

      // Create ZIP file
      const zip = new JSZip();
      const csvRows = ['channel_id,channel_name,filename'];

      // Download each image and add to ZIP
      for (let i = 0; i < images.length; i++) {
        const img = images[i] as any;
        if (!img.image_url) continue;

        try {
          const response = await fetch(img.image_url);
          const blob = await response.blob();
          const extension = img.image_url.split('.').pop()?.split('?')[0] || 'jpg';
          const filename = `${img.channel_id}.${extension}`;

          zip.file(filename, blob);
          csvRows.push(`${img.channel_id},"${img.audio_channels?.channel_name || ''}",${filename}`);
        } catch (err) {
          console.error(`Failed to download image for channel ${img.channel_id}:`, err);
        }
      }

      // Add CSV file
      zip.file('mapping.csv', csvRows.join('\n'));

      // Generate and download ZIP
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${setName.replace(/[^a-z0-9]/gi, '_')}_channel_images.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage({ type: 'success', text: `Exported ${images.length} images successfully` });
    } catch (err: any) {
      setMessage({ type: 'error', text: `Export failed: ${err.message}` });
    } finally {
      setExporting(false);
    }
  };

  const handleImportImageSet = async (file: File) => {
    if (!selectedSet) {
      setMessage({ type: 'error', text: 'Please select an image set first' });
      return;
    }

    setImporting(true);

    try {
      const zip = new JSZip();
      const contents = await zip.loadAsync(file);

      // Read the CSV mapping file
      const csvFile = contents.file('mapping.csv');
      if (!csvFile) {
        throw new Error('mapping.csv not found in ZIP file');
      }

      const csvContent = await csvFile.async('string');
      const lines = csvContent.split('\n').slice(1); // Skip header

      let uploadedCount = 0;

      for (const line of lines) {
        if (!line.trim()) continue;

        const [channelId, , filename] = line.split(',');
        const imageFile = contents.file(filename.trim());

        if (!imageFile) continue;

        // Get the image blob
        const imageBlob = await imageFile.async('blob');
        const fileExt = filename.split('.').pop()?.trim() || 'jpg';
        const storagePath = `admin/${selectedSet.id}/${channelId.trim()}.${fileExt}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('image-sets')
          .upload(storagePath, imageBlob, { upsert: true });

        if (uploadError) {
          console.error(`Failed to upload ${filename}:`, uploadError);
          continue;
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('image-sets')
          .getPublicUrl(storagePath);

        // Update/insert database record
        const { data: existingImage } = await supabase
          .from('image_set_images')
          .select('id')
          .eq('image_set_id', selectedSet.id)
          .eq('channel_id', channelId.trim())
          .maybeSingle();

        if (existingImage) {
          await supabase
            .from('image_set_images')
            .update({ image_url: publicUrl })
            .eq('id', existingImage.id);
        } else {
          await supabase
            .from('image_set_images')
            .insert({
              image_set_id: selectedSet.id,
              channel_id: channelId.trim(),
              image_url: publicUrl,
            });
        }

        uploadedCount++;
      }

      setMessage({ type: 'success', text: `Imported ${uploadedCount} images successfully` });
      loadChannelImages(selectedSet.id);
      loadImageSets();
    } catch (err: any) {
      setMessage({ type: 'error', text: `Import failed: ${err.message}` });
    } finally {
      setImporting(false);
    }
  };

  const handleDuplicateImageSet = async (setId: string, setName: string) => {
    const newName = prompt(`Enter a name for the duplicate of "${setName}":`, `${setName} (Copy)`);
    if (!newName || !newName.trim()) return;

    try {
      // Create new image set
      const { data: newSet, error: createError } = await supabase
        .from('image_sets')
        .insert({
          name: newName.trim(),
          description: `Duplicate of ${setName}`,
          set_type: 'channel',
          is_system: true,
          is_active: true,
          is_active_channel_set: false,
        })
        .select()
        .single();

      if (createError) throw createError;

      // Get all images from original set
      const { data: originalImages, error: fetchError } = await supabase
        .from('image_set_images')
        .select('channel_id, image_url')
        .eq('image_set_id', setId);

      if (fetchError) throw fetchError;

      // Copy images to new set
      if (originalImages && originalImages.length > 0) {
        const newImages = originalImages.map(img => ({
          image_set_id: newSet.id,
          channel_id: img.channel_id,
          image_url: img.image_url,
        }));

        const { error: insertError } = await supabase
          .from('image_set_images')
          .insert(newImages);

        if (insertError) throw insertError;
      }

      setMessage({ type: 'success', text: `Successfully duplicated "${setName}" to "${newName}"` });
      loadImageSets();
      setSelectedSet(newSet);
    } catch (err: any) {
      setMessage({ type: 'error', text: `Duplication failed: ${err.message}` });
    }
  };

  const handleRenameImageSet = async () => {
    if (!renameName.trim()) {
      setMessage({ type: 'error', text: 'Please enter a name' });
      return;
    }

    const { error } = await supabase
      .from('image_sets')
      .update({
        name: renameName.trim(),
        description: renameDescription.trim() || null,
      })
      .eq('id', renameSetId);

    if (error) {
      setMessage({ type: 'error', text: `Rename failed: ${error.message}` });
    } else {
      setMessage({ type: 'success', text: 'Image set renamed successfully' });
      setShowRenameModal(false);
      setRenameSetId('');
      setRenameName('');
      setRenameDescription('');
      loadImageSets();
    }
  };

  const openRenameModal = (set: ChannelImageSet) => {
    setRenameSetId(set.id);
    setRenameName(set.name);
    setRenameDescription(set.description || '');
    setShowRenameModal(true);
  };

  return (
    <div className="space-y-6">
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
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-900">Channel Image Sets</h3>
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="text-slate-400 hover:text-slate-600 transition-colors"
              title="Help"
            >
              <HelpCircle size={20} />
            </button>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm"
          >
            <Plus size={16} />
            Create New Set
          </button>
        </div>

        {showHelp && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900">
              <strong>Channel Images:</strong> These images appear on the channel cards throughout the app.
              Create image sets and upload one image per channel. Only one image set can be active at a time -
              this is the set that all users will see. Use this to refresh the app's visual style periodically.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {imageSets.map((set) => (
            <div
              key={set.id}
              className={`relative border-2 rounded-lg p-4 transition-all cursor-pointer ${
                selectedSet?.id === set.id
                  ? 'border-slate-900 bg-slate-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
              onClick={() => setSelectedSet(set)}
            >
              {set.is_active_channel_set && (
                <div className="absolute top-3 right-3 px-2 py-1 bg-green-600 text-white text-xs font-semibold rounded flex items-center gap-1">
                  <CheckCircle size={12} />
                  ACTIVE
                </div>
              )}

              {selectedSet?.id === set.id && !set.is_active_channel_set && (
                <div className="absolute top-3 right-3 w-6 h-6 bg-slate-900 rounded-full flex items-center justify-center">
                  <Check size={14} className="text-white" strokeWidth={3} />
                </div>
              )}

              <div className={set.is_active_channel_set ? 'mt-8' : ''}>
                <h4 className="font-semibold text-slate-900 mb-1">{set.name}</h4>
                {set.description && (
                  <p className="text-sm text-slate-600 mb-2">{set.description}</p>
                )}
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
                  <Image size={14} />
                  <span>{set.image_count || 0} of {channels.length} channels</span>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    {!set.is_active_channel_set && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAsActive(set.id);
                        }}
                        className="flex-1 px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 transition-colors"
                      >
                        Set as Active
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteImageSet(set.id);
                      }}
                      className="px-3 py-1.5 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 transition-colors"
                      disabled={set.is_active_channel_set}
                      title={set.is_active_channel_set ? 'Cannot delete active set' : 'Delete set'}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExportImageSet(set.id, set.name);
                      }}
                      className="flex-1 px-2 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-1"
                      disabled={exporting}
                      title="Export images and CSV"
                    >
                      <Download size={12} />
                      Export
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicateImageSet(set.id, set.name);
                      }}
                      className="flex-1 px-2 py-1.5 bg-slate-600 text-white rounded text-xs font-medium hover:bg-slate-700 transition-colors flex items-center justify-center gap-1"
                      title="Duplicate set"
                    >
                      <Copy size={12} />
                      Duplicate
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openRenameModal(set);
                      }}
                      className="px-2 py-1.5 bg-slate-600 text-white rounded text-xs font-medium hover:bg-slate-700 transition-colors flex items-center justify-center"
                      title="Rename set"
                    >
                      <Edit2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedSet && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                Manage "{selectedSet.name}" Images
              </h3>
              <p className="text-sm text-slate-600 mt-1">
                Upload one image for each channel. These will be displayed on the channel cards.
              </p>
            </div>
            <label className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium cursor-pointer">
              <FileUp size={16} />
              {importing ? 'Importing...' : 'Import ZIP'}
              <input
                type="file"
                accept=".zip"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleImportImageSet(e.target.files[0]);
                  }
                }}
                disabled={importing || uploading}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {channelImages.map((ch) => (
              <div key={ch.channel_id} className="border border-slate-200 rounded-lg p-3">
                <div className="aspect-video bg-slate-100 rounded mb-2 overflow-hidden">
                  {ch.image_url ? (
                    <img
                      src={ch.image_url}
                      alt={ch.channel_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                      <Image size={32} />
                    </div>
                  )}
                </div>

                <h4 className="font-medium text-sm text-slate-900 mb-2">{ch.channel_name}</h4>

                <label className="flex items-center justify-center gap-2 px-3 py-2 bg-slate-900 text-white rounded text-xs font-medium hover:bg-slate-800 transition-colors cursor-pointer">
                  <Upload size={14} />
                  {ch.image_url ? 'Replace' : 'Upload'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        uploadChannelImage(ch.channel_id, e.target.files[0]);
                      }
                    }}
                    disabled={uploading}
                  />
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Create Channel Image Set</h3>
            <p className="text-sm text-slate-600 mb-4">
              Create a new image set for channel cards. You'll be able to upload one image per channel.
            </p>

            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Set Name</label>
                <input
                  type="text"
                  value={newSetName}
                  onChange={(e) => setNewSetName(e.target.value)}
                  placeholder="Autumn 2025"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Description (optional)</label>
                <input
                  type="text"
                  value={newSetDescription}
                  onChange={(e) => setNewSetDescription(e.target.value)}
                  placeholder="Warm autumn colors"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={createImageSet}
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

      {showRenameModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Rename Image Set</h3>

            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Set Name</label>
                <input
                  type="text"
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Description (optional)</label>
                <input
                  type="text"
                  value={renameDescription}
                  onChange={(e) => setRenameDescription(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleRenameImageSet}
                className="flex-1 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                Rename
              </button>
              <button
                onClick={() => {
                  setShowRenameModal(false);
                  setRenameSetId('');
                  setRenameName('');
                  setRenameDescription('');
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

import { useState, useEffect } from 'react';
import { Presentation, Plus, Trash2, Upload, Check, X, AlertCircle, Image as ImageIcon, HelpCircle, Edit2, Copy, Search, ChevronUp, ChevronDown, MoreVertical } from 'lucide-react';
import { supabase } from '../lib/supabase';

type SlideshowSet = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  display_order?: number;
  image_count?: number;
};

export default function AdminSlideshowTab() {
  const [slideshowSets, setSlideshowSets] = useState<SlideshowSet[]>([]);
  const [selectedSet, setSelectedSet] = useState<SlideshowSet | null>(null);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSetName, setNewSetName] = useState('');
  const [newSetDescription, setNewSetDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editingDescriptionId, setEditingDescriptionId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSets, setSelectedSets] = useState<Set<string>>(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'created' | 'updated' | 'order'>('order');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    loadSlideshowSets();
  }, []);

  useEffect(() => {
    if (selectedSet) {
      loadPreviewImages(selectedSet.id);
    }
  }, [selectedSet]);

  const loadSlideshowSets = async () => {
    const { data } = await supabase
      .from('image_sets')
      .select('*')
      .eq('set_type', 'slideshow')
      .eq('is_system', true)
      .order('display_order', { ascending: true });

    if (data) {
      const setsWithCounts = await Promise.all(
        data.map(async (set) => {
          const { count } = await supabase
            .from('slideshow_images')
            .select('*', { count: 'exact', head: true })
            .eq('image_set_id', set.id);
          return { ...set, image_count: count || 0 };
        })
      );
      setSlideshowSets(setsWithCounts);
    }
  };

  const loadPreviewImages = async (setId: string) => {
    const { data } = await supabase
      .from('slideshow_images')
      .select('image_url')
      .eq('image_set_id', setId)
      .order('display_order')
      .limit(20);

    if (data) {
      setPreviewImages(data.map(img => img.image_url));
    }
  };

  const createSlideshowSet = async () => {
    if (!newSetName.trim()) {
      setMessage({ type: 'error', text: 'Please enter a name for the slideshow set' });
      return;
    }

    const maxOrder = Math.max(...slideshowSets.map(s => s.display_order || 0), 0);

    const { data, error } = await supabase
      .from('image_sets')
      .insert({
        name: newSetName,
        description: newSetDescription || null,
        set_type: 'slideshow',
        is_system: true,
        is_active: true,
        display_order: maxOrder + 1,
      })
      .select()
      .single();

    if (error) {
      setMessage({ type: 'error', text: 'Failed to create slideshow set' });
    } else {
      setMessage({ type: 'success', text: 'Slideshow set created successfully' });
      setShowCreateModal(false);
      setNewSetName('');
      setNewSetDescription('');
      loadSlideshowSets();
      setSelectedSet(data);
    }
  };

  const deleteSlideshowSet = async (setId: string) => {
    if (!confirm('Are you sure you want to delete this slideshow set? All images will be permanently removed.')) {
      return;
    }

    const { error } = await supabase
      .from('image_sets')
      .delete()
      .eq('id', setId);

    if (error) {
      setMessage({ type: 'error', text: 'Failed to delete slideshow set' });
    } else {
      setMessage({ type: 'success', text: 'Slideshow set deleted' });
      if (selectedSet?.id === setId) {
        setSelectedSet(null);
      }
      loadSlideshowSets();
    }
  };

  const toggleSetActive = async (setId: string, currentActive: boolean) => {
    const { error } = await supabase
      .from('image_sets')
      .update({ is_active: !currentActive })
      .eq('id', setId);

    if (error) {
      setMessage({ type: 'error', text: 'Failed to update set status' });
    } else {
      setMessage({
        type: 'success',
        text: !currentActive ? 'Slideshow set is now available to users' : 'Slideshow set hidden from users'
      });
      loadSlideshowSets();
    }
  };

  const uploadSlideshowImages = async (setId: string, files: FileList) => {
    const currentSet = slideshowSets.find(s => s.id === setId);
    const currentCount = currentSet?.image_count || 0;

    if (currentCount + files.length > 100) {
      setMessage({
        type: 'error',
        text: `Cannot upload ${files.length} images. Maximum 100 images per slideshow (currently ${currentCount}).`
      });
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    const totalFiles = files.length;
    let uploaded = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileExt = file.name.split('.').pop();
      const fileName = `admin/${setId}/${Date.now()}_${i}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('image-sets')
        .upload(fileName, file);

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

    setUploading(false);
    setMessage({ type: 'success', text: `Successfully uploaded ${uploaded} of ${totalFiles} images` });
    loadSlideshowSets();
    if (selectedSet?.id === setId) {
      loadPreviewImages(setId);
    }
  };

  const handleFileSelect = (setId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadSlideshowImages(setId, e.target.files);
    }
  };

  const deleteImage = async (setId: string, imageUrl: string) => {
    if (!confirm('Delete this image?')) {
      return;
    }

    const { error } = await supabase
      .from('slideshow_images')
      .delete()
      .eq('image_set_id', setId)
      .eq('image_url', imageUrl);

    if (error) {
      setMessage({ type: 'error', text: 'Failed to delete image' });
    } else {
      setMessage({ type: 'success', text: 'Image deleted' });
      loadSlideshowSets();
      if (selectedSet?.id === setId) {
        loadPreviewImages(setId);
      }
    }
  };

  const renameSlideshowSet = async (setId: string, newName: string) => {
    if (!newName.trim()) {
      setMessage({ type: 'error', text: 'Name cannot be empty' });
      return;
    }

    const { error } = await supabase
      .from('image_sets')
      .update({ name: newName.trim() })
      .eq('id', setId);

    if (error) {
      setMessage({ type: 'error', text: 'Failed to rename slideshow set' });
    } else {
      setMessage({ type: 'success', text: 'Slideshow renamed successfully' });
      setEditingId(null);
      loadSlideshowSets();
      if (selectedSet?.id === setId) {
        setSelectedSet({ ...selectedSet, name: newName.trim() });
      }
    }
  };

  const updateDescription = async (setId: string, newDescription: string) => {
    const { error } = await supabase
      .from('image_sets')
      .update({ description: newDescription.trim() || null })
      .eq('id', setId);

    if (error) {
      setMessage({ type: 'error', text: 'Failed to update description' });
    } else {
      setMessage({ type: 'success', text: 'Description updated successfully' });
      setEditingDescriptionId(null);
      loadSlideshowSets();
      if (selectedSet?.id === setId) {
        setSelectedSet({ ...selectedSet, description: newDescription.trim() || null });
      }
    }
  };

  const duplicateSlideshowSet = async (setId: string) => {
    const original = slideshowSets.find(s => s.id === setId);
    if (!original) return;

    const maxOrder = Math.max(...slideshowSets.map(s => s.display_order || 0), 0);

    const { data: newSet, error: createError } = await supabase
      .from('image_sets')
      .insert({
        name: `${original.name} (Copy)`,
        description: original.description,
        set_type: 'slideshow',
        is_system: true,
        is_active: false,
        display_order: maxOrder + 1,
      })
      .select()
      .single();

    if (createError || !newSet) {
      setMessage({ type: 'error', text: 'Failed to duplicate slideshow set' });
      return;
    }

    const { data: images } = await supabase
      .from('slideshow_images')
      .select('*')
      .eq('image_set_id', setId)
      .order('display_order');

    if (images && images.length > 0) {
      const newImages = images.map(img => ({
        image_set_id: newSet.id,
        image_url: img.image_url,
        display_order: img.display_order,
      }));

      await supabase.from('slideshow_images').insert(newImages);
    }

    setMessage({ type: 'success', text: `Duplicated "${original.name}" with ${images?.length || 0} images` });
    loadSlideshowSets();
  };

  const moveSet = async (setId: string, direction: 'up' | 'down') => {
    const currentIndex = slideshowSets.findIndex(s => s.id === setId);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= slideshowSets.length) return;

    const currentSet = slideshowSets[currentIndex];
    const targetSet = slideshowSets[targetIndex];

    await Promise.all([
      supabase.from('image_sets').update({ display_order: targetSet.display_order }).eq('id', currentSet.id),
      supabase.from('image_sets').update({ display_order: currentSet.display_order }).eq('id', targetSet.id),
    ]);

    loadSlideshowSets();
  };

  const bulkToggleActive = async (active: boolean) => {
    const ids = Array.from(selectedSets);
    if (ids.length === 0) return;

    const { error } = await supabase
      .from('image_sets')
      .update({ is_active: active })
      .in('id', ids);

    if (error) {
      setMessage({ type: 'error', text: 'Failed to update sets' });
    } else {
      setMessage({ type: 'success', text: `${ids.length} sets ${active ? 'activated' : 'deactivated'}` });
      setSelectedSets(new Set());
      setShowBulkActions(false);
      loadSlideshowSets();
    }
  };

  const bulkDelete = async () => {
    const ids = Array.from(selectedSets);
    if (ids.length === 0) return;

    if (!confirm(`Delete ${ids.length} slideshow sets? This will permanently remove all images.`)) {
      return;
    }

    const { error } = await supabase
      .from('image_sets')
      .delete()
      .in('id', ids);

    if (error) {
      setMessage({ type: 'error', text: 'Failed to delete sets' });
    } else {
      setMessage({ type: 'success', text: `${ids.length} sets deleted` });
      setSelectedSets(new Set());
      setShowBulkActions(false);
      if (selectedSet && ids.includes(selectedSet.id)) {
        setSelectedSet(null);
      }
      loadSlideshowSets();
    }
  };

  const toggleSetSelection = (setId: string) => {
    const newSelection = new Set(selectedSets);
    if (newSelection.has(setId)) {
      newSelection.delete(setId);
    } else {
      newSelection.add(setId);
    }
    setSelectedSets(newSelection);
  };

  const filteredAndSortedSets = slideshowSets
    .filter(set => {
      if (!searchTerm) return true;
      const search = searchTerm.toLowerCase();
      return set.name.toLowerCase().includes(search) ||
             set.description?.toLowerCase().includes(search);
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'created':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'updated':
          comparison = new Date(a.updated_at || a.created_at).getTime() - new Date(b.updated_at || b.created_at).getTime();
          break;
        case 'order':
          comparison = (a.display_order || 0) - (b.display_order || 0);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

  const startEdit = (set: SlideshowSet) => {
    setEditingId(set.id);
    setEditName(set.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const saveEdit = (setId: string) => {
    renameSlideshowSet(setId, editName);
  };

  const startEditDescription = (set: SlideshowSet) => {
    setEditingDescriptionId(set.id);
    setEditDescription(set.description || '');
  };

  const cancelEditDescription = () => {
    setEditingDescriptionId(null);
    setEditDescription('');
  };

  const saveEditDescription = (setId: string) => {
    updateDescription(setId, editDescription);
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
            <h3 className="text-lg font-semibold text-slate-900">Slideshow Sets</h3>
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="text-slate-400 hover:text-slate-600 transition-colors"
              title="Help"
            >
              <HelpCircle size={20} />
            </button>
            {selectedSets.size > 0 && (
              <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                {selectedSets.size} selected
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedSets.size > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowBulkActions(!showBulkActions)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  <MoreVertical size={16} />
                  Bulk Actions
                </button>
                {showBulkActions && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-10">
                    <button
                      onClick={() => bulkToggleActive(true)}
                      className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm transition-colors"
                    >
                      Activate Selected
                    </button>
                    <button
                      onClick={() => bulkToggleActive(false)}
                      className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm transition-colors"
                    >
                      Deactivate Selected
                    </button>
                    <div className="border-t border-slate-200"></div>
                    <button
                      onClick={bulkDelete}
                      className="w-full text-left px-4 py-2 hover:bg-red-50 text-red-600 text-sm transition-colors"
                    >
                      Delete Selected
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm"
            >
              <Plus size={16} />
              Create New
            </button>
          </div>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search slideshow sets..."
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm"
          >
            <option value="order">Display Order</option>
            <option value="name">Name</option>
            <option value="created">Created Date</option>
            <option value="updated">Last Updated</option>
          </select>
          <button
            onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
            className="px-3 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sortDirection === 'asc' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>

        {showHelp && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900">
              <strong>Slideshow Sets:</strong> These image collections are displayed in the expanded music player.
              Users can choose which slideshow to display from their settings. You can create multiple slideshow sets,
              each with up to 100 images. Toggle sets as active/inactive to control user access.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAndSortedSets.map((set, index) => (
            <div
              key={set.id}
              className={`relative border-2 rounded-lg p-4 transition-all ${
                selectedSet?.id === set.id
                  ? 'border-slate-900 bg-slate-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedSets.has(set.id)}
                  onChange={(e) => {
                    e.stopPropagation();
                    toggleSetSelection(set.id);
                  }}
                  className="w-4 h-4 text-slate-900 border-slate-300 rounded focus:ring-slate-900 cursor-pointer"
                />
                {sortBy === 'order' && (
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moveSet(set.id, 'up');
                      }}
                      disabled={index === 0}
                      className="text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Move up"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moveSet(set.id, 'down');
                      }}
                      disabled={index === filteredAndSortedSets.length - 1}
                      className="text-slate-400 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Move down"
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>
                )}
              </div>

              {selectedSet?.id === set.id && (
                <div className="absolute top-3 right-3 w-6 h-6 bg-slate-900 rounded-full flex items-center justify-center">
                  <Check size={14} className="text-white" strokeWidth={3} />
                </div>
              )}

              <div className="mt-6" onClick={() => setSelectedSet(set)}>
                {editingId === set.id ? (
                  <div className="mb-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(set.id);
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      className="w-full px-2 py-1 border border-slate-300 rounded text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-slate-900"
                      autoFocus
                    />
                    <div className="flex gap-1 mt-1">
                      <button
                        onClick={() => saveEdit(set.id)}
                        className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="px-2 py-1 bg-slate-200 text-slate-700 rounded text-xs hover:bg-slate-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-slate-900 flex-1">{set.name}</h4>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(set);
                      }}
                      className="text-slate-400 hover:text-slate-600 transition-colors"
                      title="Rename"
                    >
                      <Edit2 size={14} />
                    </button>
                  </div>
                )}
                {editingDescriptionId === set.id ? (
                  <div className="mb-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEditDescription(set.id);
                        if (e.key === 'Escape') cancelEditDescription();
                      }}
                      placeholder="Add a description (optional)"
                      className="w-full px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                      autoFocus
                    />
                    <div className="flex gap-1 mt-1">
                      <button
                        onClick={() => saveEditDescription(set.id)}
                        className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEditDescription}
                        className="px-2 py-1 bg-slate-200 text-slate-700 rounded text-xs hover:bg-slate-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 mb-2">
                    {set.description ? (
                      <>
                        <p className="text-sm text-slate-600 flex-1">{set.description}</p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditDescription(set);
                          }}
                          className="text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0 mt-0.5"
                          title="Edit description"
                        >
                          <Edit2 size={12} />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditDescription(set);
                        }}
                        className="text-xs text-slate-400 hover:text-slate-600 transition-colors italic"
                      >
                        + Add description
                      </button>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
                  <ImageIcon size={14} />
                  <span>{set.image_count || 0} of 100 images</span>
                  <span className={`ml-auto px-2 py-0.5 rounded font-medium ${
                    set.is_active
                      ? 'bg-green-100 text-green-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {set.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {set.updated_at && set.updated_at !== set.created_at && (
                  <p className="text-xs text-slate-400 mb-2">
                    Updated {new Date(set.updated_at).toLocaleDateString()}
                  </p>
                )}

                <div className="grid grid-cols-3 gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSetActive(set.id, set.is_active);
                    }}
                    className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                      set.is_active
                        ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                    title={set.is_active ? 'Hide from users' : 'Show to users'}
                  >
                    {set.is_active ? 'Hide' : 'Show'}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicateSlideshowSet(set.id);
                    }}
                    className="px-2 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-1"
                    title="Duplicate slideshow"
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSlideshowSet(set.id);
                    }}
                    className="px-2 py-1.5 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 transition-colors flex items-center justify-center"
                    title="Delete slideshow"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredAndSortedSets.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <Presentation size={48} className="mx-auto mb-3 opacity-30" />
            <p>{searchTerm ? 'No slideshows match your search.' : 'No slideshow sets yet. Create one to get started.'}</p>
          </div>
        )}
      </div>

      {selectedSet && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                Manage "{selectedSet.name}"
              </h3>
              <p className="text-sm text-slate-600">
                {selectedSet.image_count || 0} of 100 images used
              </p>
            </div>
            <label className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm cursor-pointer">
              <Upload size={16} />
              Add Images
              <input
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileSelect(selectedSet.id, e)}
                disabled={uploading}
              />
            </label>
          </div>

          {uploading && (
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

          {previewImages.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {previewImages.map((url, idx) => (
                <div key={idx} className="relative group">
                  <img
                    src={url}
                    alt={`Slide ${idx + 1}`}
                    className="w-full h-32 object-cover rounded-lg"
                  />
                  <button
                    onClick={() => deleteImage(selectedSet.id, url)}
                    className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500">
              <Presentation size={48} className="mx-auto mb-3 opacity-30" />
              <p>No images yet. Click "Add Images" to get started.</p>
            </div>
          )}
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Create Slideshow Set</h3>
            <p className="text-sm text-slate-600 mb-4">
              Create a new slideshow collection. You can add up to 100 images that users can
              select to display in their expanded music player.
            </p>

            <div className="space-y-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Set Name</label>
                <input
                  type="text"
                  value={newSetName}
                  onChange={(e) => setNewSetName(e.target.value)}
                  placeholder="Nature Landscapes"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Description (optional)</label>
                <input
                  type="text"
                  value={newSetDescription}
                  onChange={(e) => setNewSetDescription(e.target.value)}
                  placeholder="Calming nature scenes from around the world"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={createSlideshowSet}
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

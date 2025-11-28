import { useState, useEffect, useRef } from 'react';
import { Upload, Play, Pause, Trash2, Bell, GripVertical, Eye, EyeOff, Edit2, Check, X, AlertCircle, Music } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type BellSound = {
  id: string;
  name: string;
  storage_path: string | null;
  public_url: string | null;
  file_size: number | null;
  format: string | null;
  duration: number | null;
  is_visible: boolean;
  sort_order: number;
  is_default: boolean;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
};

export function BellSoundLibrary() {
  const { user } = useAuth();
  const [bellSounds, setBellSounds] = useState<BellSound[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadBellSounds();
  }, []);

  const loadBellSounds = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('timer_bell_sounds')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;

      setBellSounds(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load bell sounds');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError(null);
    setSuccess(null);

    const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    for (const file of Array.from(files)) {
      try {
        // Validate file type
        if (!validTypes.includes(file.type)) {
          setError(`${file.name}: Invalid file type. Please upload MP3, WAV, OGG, or WebM files.`);
          continue;
        }

        // Validate file size
        if (file.size > maxSize) {
          setError(`${file.name}: File size exceeds 5MB limit.`);
          continue;
        }

        setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));

        // Generate unique file name
        const fileExt = file.name.split('.').pop();
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 8);
        const fileName = `bell-${timestamp}-${randomStr}.${fileExt}`;

        // Upload file to storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('timer-bell')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) throw uploadError;

        setUploadProgress(prev => ({ ...prev, [file.name]: 50 }));

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('timer-bell')
          .getPublicUrl(fileName);

        // Extract audio duration
        const duration = await getAudioDuration(file);

        // Get highest sort order
        const maxOrder = bellSounds.length > 0 ? Math.max(...bellSounds.map(b => b.sort_order)) : -1;

        // Create database record
        const { data: newBell, error: dbError } = await supabase
          .from('timer_bell_sounds')
          .insert({
            name: file.name.replace(/\.[^/.]+$/, ''), // Remove file extension
            storage_path: fileName,
            public_url: publicUrl,
            file_size: file.size,
            format: fileExt,
            duration: duration,
            is_visible: true,
            sort_order: maxOrder + 1,
            is_default: false,
            uploaded_by: user?.id,
          })
          .select()
          .single();

        if (dbError) throw dbError;

        setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
        setBellSounds(prev => [...prev, newBell]);

        setTimeout(() => {
          setUploadProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[file.name];
            return newProgress;
          });
        }, 2000);

      } catch (err: any) {
        setError(`${file.name}: ${err.message || 'Upload failed'}`);
        setUploadProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[file.name];
          return newProgress;
        });
      }
    }

    setUploading(false);
    setSuccess('Bell sounds uploaded successfully!');
    setTimeout(() => setSuccess(null), 3000);

    // Clear file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getAudioDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.preload = 'metadata';

      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(audio.src);
        resolve(audio.duration);
      };

      audio.onerror = () => {
        resolve(0);
      };

      audio.src = URL.createObjectURL(file);
    });
  };

  const handlePlay = async (bell: BellSound) => {
    if (playingId === bell.id) {
      // Stop currently playing
      const audio = audioRefs.current[bell.id];
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      setPlayingId(null);
      return;
    }

    // Stop any other playing audio
    Object.values(audioRefs.current).forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });

    // Play this audio
    if (bell.public_url) {
      const audio = new Audio(bell.public_url);
      audioRefs.current[bell.id] = audio;

      audio.onended = () => {
        setPlayingId(null);
      };

      audio.onerror = () => {
        setPlayingId(null);
        setError('Failed to play audio');
      };

      try {
        await audio.play();
        setPlayingId(bell.id);
      } catch (err) {
        setError('Failed to play audio');
      }
    }
  };

  const handleDelete = async (bell: BellSound) => {
    if (!confirm(`Are you sure you want to delete "${bell.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      // Delete from storage if it has a storage path
      if (bell.storage_path) {
        const { error: storageError } = await supabase.storage
          .from('timer-bell')
          .remove([bell.storage_path]);

        if (storageError) throw storageError;
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from('timer_bell_sounds')
        .delete()
        .eq('id', bell.id);

      if (dbError) throw dbError;

      setBellSounds(prev => prev.filter(b => b.id !== bell.id));
      setSuccess('Bell sound deleted successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete bell sound');
    }
  };

  const handleToggleVisibility = async (bell: BellSound) => {
    try {
      const { error } = await supabase
        .from('timer_bell_sounds')
        .update({ is_visible: !bell.is_visible })
        .eq('id', bell.id);

      if (error) throw error;

      setBellSounds(prev =>
        prev.map(b => (b.id === bell.id ? { ...b, is_visible: !b.is_visible } : b))
      );
    } catch (err: any) {
      setError(err.message || 'Failed to update visibility');
    }
  };

  const handleStartEdit = (bell: BellSound) => {
    setEditingId(bell.id);
    setEditName(bell.name);
  };

  const handleSaveEdit = async (bellId: string) => {
    if (!editName.trim()) {
      setError('Name cannot be empty');
      return;
    }

    try {
      const { error } = await supabase
        .from('timer_bell_sounds')
        .update({ name: editName.trim() })
        .eq('id', bellId);

      if (error) throw error;

      setBellSounds(prev =>
        prev.map(b => (b.id === bellId ? { ...b, name: editName.trim() } : b))
      );
      setEditingId(null);
      setEditName('');
    } catch (err: any) {
      setError(err.message || 'Failed to update name');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const handleDragStart = (e: React.DragEvent, bell: BellSound) => {
    setDraggedId(bell.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetBell: BellSound) => {
    e.preventDefault();

    if (!draggedId || draggedId === targetBell.id) {
      setDraggedId(null);
      return;
    }

    const draggedIndex = bellSounds.findIndex(b => b.id === draggedId);
    const targetIndex = bellSounds.findIndex(b => b.id === targetBell.id);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Reorder locally
    const newBells = [...bellSounds];
    const [removed] = newBells.splice(draggedIndex, 1);
    newBells.splice(targetIndex, 0, removed);

    // Update sort orders
    const updates = newBells.map((bell, index) => ({
      id: bell.id,
      sort_order: index,
    }));

    setBellSounds(newBells);
    setDraggedId(null);

    // Update in database
    try {
      for (const update of updates) {
        await supabase
          .from('timer_bell_sounds')
          .update({ sort_order: update.sort_order })
          .eq('id', update.id);
      }
    } catch (err: any) {
      setError('Failed to update order');
      loadBellSounds(); // Reload to restore correct order
    }
  };

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return 'Unknown';
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Error/Success Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-800">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">
            <X size={16} />
          </button>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <Check size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-green-800">{success}</p>
          </div>
          <button onClick={() => setSuccess(null)} className="text-green-600 hover:text-green-800">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Upload Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <Bell className="text-slate-700" size={24} />
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Timer Bell Sound Library</h2>
              <p className="text-sm text-slate-600 mt-1">
                Upload and manage multiple bell sounds for users to choose from
              </p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
            <input
              ref={fileInputRef}
              type="file"
              id="bell-upload"
              accept="audio/*"
              multiple
              onChange={handleFileSelect}
              disabled={uploading}
              className="hidden"
            />
            <label
              htmlFor="bell-upload"
              className={`cursor-pointer flex flex-col items-center gap-3 ${
                uploading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <Upload className="text-slate-400" size={48} />
              <div>
                <p className="text-sm font-medium text-slate-700">
                  {uploading ? 'Uploading...' : 'Click to upload or drag and drop'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  MP3, WAV, OGG, or WebM (max 5MB per file, multiple files supported)
                </p>
              </div>
            </label>
          </div>

          {/* Upload Progress */}
          {Object.entries(uploadProgress).length > 0 && (
            <div className="mt-4 space-y-2">
              {Object.entries(uploadProgress).map(([filename, progress]) => (
                <div key={filename} className="flex items-center gap-3">
                  <Music size={16} className="text-slate-400" />
                  <span className="text-sm text-slate-600 flex-1 truncate">{filename}</span>
                  <div className="w-32 bg-slate-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-500 w-12 text-right">{progress}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bell Sounds List */}
      {bellSounds.length > 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h3 className="font-semibold text-slate-900">
              Bell Sounds ({bellSounds.length})
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              Drag to reorder • Click name to edit • Toggle visibility for users
            </p>
          </div>

          <div className="divide-y divide-slate-200">
            {bellSounds.map(bell => (
              <div
                key={bell.id}
                draggable
                onDragStart={(e) => handleDragStart(e, bell)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, bell)}
                className={`p-4 hover:bg-slate-50 transition-colors ${
                  draggedId === bell.id ? 'opacity-50' : ''
                } ${bell.is_default ? 'bg-blue-50' : ''}`}
              >
                <div className="flex items-center gap-4">
                  {/* Drag Handle */}
                  <div className="cursor-move text-slate-400 hover:text-slate-600">
                    <GripVertical size={20} />
                  </div>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    {editingId === bell.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(bell.id);
                            if (e.key === 'Escape') handleCancelEdit();
                          }}
                          className="flex-1 px-3 py-1 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveEdit(bell.id)}
                          className="p-1 text-green-600 hover:text-green-700"
                          title="Save"
                        >
                          <Check size={18} />
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="p-1 text-slate-600 hover:text-slate-700"
                          title="Cancel"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-slate-900 truncate">{bell.name}</h4>
                        <button
                          onClick={() => handleStartEdit(bell)}
                          className="text-slate-400 hover:text-slate-600"
                          title="Edit name"
                        >
                          <Edit2 size={14} />
                        </button>
                        {bell.is_default && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                            Default
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                      <span className="uppercase">{bell.format || 'Unknown'}</span>
                      <span>•</span>
                      <span>{formatFileSize(bell.file_size)}</span>
                      <span>•</span>
                      <span>{formatDuration(bell.duration)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {/* Visibility Toggle */}
                    <button
                      onClick={() => handleToggleVisibility(bell)}
                      className={`p-2 rounded-lg transition-colors ${
                        bell.is_visible
                          ? 'text-green-600 hover:bg-green-50'
                          : 'text-slate-400 hover:bg-slate-100'
                      }`}
                      title={bell.is_visible ? 'Visible to users' : 'Hidden from users'}
                    >
                      {bell.is_visible ? <Eye size={18} /> : <EyeOff size={18} />}
                    </button>

                    {/* Play/Pause */}
                    {bell.public_url && (
                      <button
                        onClick={() => handlePlay(bell)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title={playingId === bell.id ? 'Stop' : 'Play'}
                      >
                        {playingId === bell.id ? <Pause size={18} /> : <Play size={18} />}
                      </button>
                    )}

                    {/* Delete */}
                    {!bell.is_default && (
                      <button
                        onClick={() => handleDelete(bell)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <Bell size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No Bell Sounds Yet</h3>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Upload your first bell sound to get started. Users will be able to choose from your uploaded sounds
            in their timer settings.
          </p>
        </div>
      )}

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Tips:</strong> For best results, use short audio files (1-3 seconds) with a clear, pleasant sound.
          Users can select their preferred bell and adjust volume individually. Drag to reorder bells in the user selection menu.
        </p>
      </div>
    </div>
  );
}

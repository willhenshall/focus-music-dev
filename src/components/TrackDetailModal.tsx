import { useState, useEffect } from 'react';
import { X, Music2, Clock, HardDrive, Radio, FileText, Database, Settings, Play, Pause, Trash2, Edit2, Save } from 'lucide-react';
import { AudioTrack, AudioChannel } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { useMusicPlayer } from '../contexts/MusicPlayerContext';
import { useAuth } from '../contexts/AuthContext';

interface TrackDetailModalProps {
  track: AudioTrack;
  channelAssignments: Array<{ channelName: string; channelId: string; energy: string }>;
  channels: AudioChannel[];
  onClose: () => void;
  onTrackDeleted?: () => void;
  onOpenChannelEditor?: (channelId: string, energyLevel: string, trackId: string) => void;
  loadingAssignments?: boolean;
}

type TabType = 'overview' | 'descriptors' | 'metadata';

export function TrackDetailModal({ track, channelAssignments, channels, onClose, onTrackDeleted, onOpenChannelEditor, loadingAssignments = false }: TrackDetailModalProps) {
  const [sidecarMetadata, setSidecarMetadata] = useState<any>(null);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editedMetadata, setEditedMetadata] = useState<any>({});
  const [showEnergySelector, setShowEnergySelector] = useState(false);
  const [trackUpdateTrigger, setTrackUpdateTrigger] = useState(0);
  const [isPreview, setIsPreview] = useState(track.is_preview);
  const [previewChannelId, setPreviewChannelId] = useState(track.preview_channel_id || '');
  const [updatingPreview, setUpdatingPreview] = useState(false);
  const { currentTrack, isPlaying, setAdminPreview, toggleAdminPlayback } = useMusicPlayer();
  const { profile } = useAuth();

  useEffect(() => {
    loadSidecarMetadata();
    setIsEditing(false);
    setEditedMetadata({});
    setIsPreview(track.is_preview);
    setPreviewChannelId(track.preview_channel_id || '');
  }, [track]);

  const loadSidecarMetadata = async () => {
    // Merge top-level database columns with metadata JSONB
    const baseMetadata = {
      ...track.metadata,
      // Include top-level columns that were populated by backfill
      tempo: track.tempo,
      speed: track.speed,
      intensity: track.intensity,
      arousal: track.arousal,
      valence: track.valence,
      brightness: track.brightness,
      complexity: track.complexity,
      music_key_value: track.music_key_value,
      energy_set: track.energy_set,
      catalog: track.catalog,
      track_user_genre_id: track.track_user_genre_id,
      locked: track.locked,
      energy_low: track.energy_low,
      energy_medium: track.energy_medium,
      energy_high: track.energy_high,
    };

    // First, set metadata from database if available
    if (track.metadata) {
      setSidecarMetadata(baseMetadata);
      setEditedMetadata(JSON.parse(JSON.stringify(baseMetadata)));
    }

    // Then try to load from storage to get any additional fields
    if (!track.metadata?.track_id) return;

    setLoadingMetadata(true);
    try {
      const { data, error } = await supabase.storage
        .from('audio-sidecars')
        .download(`${track.metadata.track_id}.json`);

      if (!error && data) {
        const text = await data.text();
        const storageMetadata = JSON.parse(text);
        // Merge storage metadata with database columns (database takes priority)
        const merged = { ...storageMetadata, ...baseMetadata };
        setSidecarMetadata(merged);
        setEditedMetadata(JSON.parse(JSON.stringify(merged)));
      }
    } catch (err) {
    } finally {
      setLoadingMetadata(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return 'Unknown';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined || value === '') return 'N/A';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'N/A';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const isThisTrackPlaying = currentTrack?.id === track.id && isPlaying;

  const handlePlayPause = () => {
    if (currentTrack?.id === track.id) {
      toggleAdminPlayback();
    } else {
      setAdminPreview(track, true);
    }
  };

  const handleDelete = async () => {
    if (!profile?.is_admin) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('audio_tracks')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: profile.id
        })
        .eq('id', track.id);

      if (error) throw error;

      setShowDeleteConfirm(false);
      onTrackDeleted?.();
      onClose();
    } catch (error) {
      alert('Failed to delete track. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleTogglePreview = async () => {
    if (!profile?.is_admin) return;

    const newPreviewState = !isPreview;

    if (newPreviewState && !previewChannelId) {
      alert('Please select a channel first before enabling preview mode.');
      return;
    }

    setUpdatingPreview(true);
    try {
      if (newPreviewState && previewChannelId) {
        const { data: existingPreview } = await supabase
          .from('audio_tracks')
          .select('id, metadata')
          .eq('preview_channel_id', previewChannelId)
          .eq('is_preview', true)
          .maybeSingle();

        if (existingPreview && existingPreview.id !== track.id) {
          const existingTrackName = existingPreview.metadata?.track_name || 'Unknown Track';
          const selectedChannel = channelAssignments.find(a => a.channelId === previewChannelId);
          const confirmed = window.confirm(
            `"${existingTrackName}" is already the preview track for ${selectedChannel?.channelName || 'this channel'}.\n\nDo you want to replace it with "${track.metadata?.track_name || 'this track'}"?`
          );
          if (!confirmed) {
            setUpdatingPreview(false);
            return;
          }

          await supabase
            .from('audio_tracks')
            .update({ is_preview: false, preview_channel_id: null })
            .eq('id', existingPreview.id);
        }
      }

      const { error } = await supabase
        .from('audio_tracks')
        .update({
          is_preview: newPreviewState,
          preview_channel_id: newPreviewState ? previewChannelId : null
        })
        .eq('id', track.id);

      if (error) throw error;

      setIsPreview(newPreviewState);
      track.is_preview = newPreviewState;
      if (newPreviewState) {
        track.preview_channel_id = previewChannelId;
      } else {
        track.preview_channel_id = null;
      }
    } catch (error) {
      alert('Failed to update preview status. Please try again.');
    } finally {
      setUpdatingPreview(false);
    }
  };

  const handleSave = async () => {
    if (!profile?.is_admin || !sidecarMetadata) return;

    setIsSaving(true);
    try {
      // Update sidecar metadata with all edited fields
      const updatedSidecar = {
        ...editedMetadata,
        updated_at: new Date().toISOString(),
      };

      // Upload updated sidecar to storage
      const sidecarBlob = new Blob([JSON.stringify(updatedSidecar, null, 2)], {
        type: 'application/json',
      });

      const { error: uploadError } = await supabase.storage
        .from('audio-sidecars')
        .upload(`${track.metadata?.track_id}.json`, sidecarBlob, {
          upsert: true,
          contentType: 'application/json',
        });

      if (uploadError) throw uploadError;

      // Derive energy_level string from boolean fields (for Music Library list display)
      // Priority: high > medium > low
      const derivedEnergyLevel = editedMetadata.energy_high
        ? 'high'
        : editedMetadata.energy_medium
        ? 'medium'
        : editedMetadata.energy_low
        ? 'low'
        : null;

      // Update database with top-level columns and energy levels
      const { error: dbError } = await supabase
        .from('audio_tracks')
        .update({
          track_name: editedMetadata.track_name || null,
          artist_name: editedMetadata.artist_name || null,
          genre: editedMetadata.genre || null,
          tempo: editedMetadata.tempo ? Number(editedMetadata.tempo) : null,
          speed: editedMetadata.speed ? Number(editedMetadata.speed) : null,
          intensity: editedMetadata.intensity ? Number(editedMetadata.intensity) : null,
          arousal: editedMetadata.arousal ? Number(editedMetadata.arousal) : null,
          valence: editedMetadata.valence ? Number(editedMetadata.valence) : null,
          brightness: editedMetadata.brightness ? Number(editedMetadata.brightness) : null,
          complexity: editedMetadata.complexity ? Number(editedMetadata.complexity) : null,
          music_key_value: editedMetadata.music_key_value || null,
          energy_level: derivedEnergyLevel,
          energy_low: editedMetadata.energy_low || false,
          energy_medium: editedMetadata.energy_medium || false,
          energy_high: editedMetadata.energy_high || false,
          metadata: {
            ...track.metadata,
            ...editedMetadata
          },
        })
        .eq('id', track.id);

      if (dbError) throw dbError;

      // Update the track object with new values
      track.track_name = editedMetadata.track_name;
      track.artist_name = editedMetadata.artist_name;
      track.genre = editedMetadata.genre;
      track.tempo = editedMetadata.tempo;
      // Update energy level fields so the UI reflects the saved values
      track.energy_level = derivedEnergyLevel;
      track.energy_low = editedMetadata.energy_low || false;
      track.energy_medium = editedMetadata.energy_medium || false;
      track.energy_high = editedMetadata.energy_high || false;
      track.metadata = {
        ...track.metadata,
        ...editedMetadata
      };

      // Reload metadata
      setSidecarMetadata(updatedSidecar);
      setIsEditing(false);
      // Force re-render to show updated track info
      setTrackUpdateTrigger(prev => prev + 1);
      alert('Track metadata updated successfully!');
    } catch (error) {
      alert('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    // Reset to original sidecar metadata
    setEditedMetadata(JSON.parse(JSON.stringify(sidecarMetadata)));
    setIsEditing(false);
  };

  const updateMetadataField = (key: string, value: any) => {
    setEditedMetadata((prev: any) => ({
      ...prev,
      [key]: value
    }));
  };

  const renderEditableField = (label: string, key: string, value: any, type: string = 'text', suffix: string = '') => {
    const displayValue = editedMetadata?.[key] ?? value ?? '';

    return (
      <div className="flex justify-between items-center">
        <span className="text-slate-600">{label}:</span>
        {isEditing ? (
          <input
            type={type}
            step={type === 'number' ? '0.01' : undefined}
            value={displayValue}
            onChange={(e) => updateMetadataField(key, type === 'number' ? parseFloat(e.target.value) || '' : e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg font-medium text-slate-900 w-40 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        ) : (
          <span className="font-medium text-slate-900">
            {displayValue || 'N/A'}{suffix && displayValue ? ` ${suffix}` : ''}
          </span>
        )}
      </div>
    );
  };

  const renderMetadataList = () => {
    if (!editedMetadata) return null;

    const entries = Object.entries(editedMetadata)
      .filter(([key, value]) => {
        return value !== null && value !== undefined && value !== '' &&
               (typeof value !== 'object' || (Array.isArray(value) && value.length > 0));
      })
      .sort(([a], [b]) => a.localeCompare(b));

    return (
      <div className="space-y-1">
        {entries.map(([key, value]) => {
          const isNumber = typeof value === 'number';
          const isBoolean = typeof value === 'boolean';
          const isArray = Array.isArray(value);

          return (
            <div
              key={key}
              className="flex justify-between items-center py-2.5 px-3 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <span className="text-slate-600 font-medium">
                {key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}:
              </span>
              {isEditing ? (
                isBoolean ? (
                  <select
                    value={editedMetadata[key] ? 'true' : 'false'}
                    onChange={(e) => updateMetadataField(key, e.target.value === 'true')}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg font-medium text-slate-900 w-32 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                ) : isArray ? (
                  <input
                    type="text"
                    value={editedMetadata[key].join(', ')}
                    onChange={(e) => updateMetadataField(key, e.target.value.split(',').map(v => v.trim()))}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg font-medium text-slate-900 max-w-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                ) : (
                  <input
                    type={isNumber ? 'number' : 'text'}
                    step={isNumber ? '0.01' : undefined}
                    value={editedMetadata[key]}
                    onChange={(e) => updateMetadataField(key, isNumber ? parseFloat(e.target.value) || 0 : e.target.value)}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg font-medium text-slate-900 max-w-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                )
              ) : (
                <span className="font-medium text-slate-900 text-right max-w-md truncate" title={formatValue(value)}>
                  {formatValue(value)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4 pb-24"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[calc(90vh-6rem)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <h2 className="text-xl font-bold text-slate-900">Track Details</h2>
          <div className="flex items-center gap-3">
            {profile?.is_admin && !isEditing && (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  <Edit2 size={16} />
                  EDIT
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  <Trash2 size={16} />
                  DELETE
                </button>
              </>
            )}
            {profile?.is_admin && isEditing && (
              <>
                <button
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-50 rounded-lg font-medium text-slate-700 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={16} />
                      SAVE
                    </>
                  )}
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X size={20} className="text-slate-600" />
            </button>
          </div>
        </div>

        <div className="flex items-start gap-4 px-6 pt-6">
          <button
            onClick={handlePlayPause}
            className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center flex-shrink-0 hover:from-blue-600 hover:to-blue-700 transition-all"
            title={isThisTrackPlaying ? 'Pause' : 'Play'}
          >
            {isThisTrackPlaying ? (
              <Pause className="text-white" size={32} fill="currentColor" />
            ) : (
              <Play className="text-white" size={32} fill="currentColor" />
            )}
          </button>
          <div className="flex-1">
            <h3 className="text-xl font-bold text-slate-900 mb-1">
              {track.track_name || editedMetadata?.track_name || editedMetadata?.title || 'Untitled Track'}
            </h3>
            <p className="text-slate-600 mb-2">
              {track.artist_name || editedMetadata?.artist_name || editedMetadata?.artist || <><span className="font-bold">focus</span>.music</>}
            </p>
            <div className="flex items-center gap-4 text-sm text-slate-600">
              <div className="flex items-center gap-1.5">
                <Clock size={14} />
                <span className="font-medium">
                  {formatDuration(track.duration_seconds || track.metadata?.duration_seconds || sidecarMetadata?.duration_seconds || sidecarMetadata?.duration || 0)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <HardDrive size={14} />
                <span className="font-medium">
                  {track.metadata?.file_size_bytes
                    ? formatFileSize(Number(track.metadata.file_size_bytes))
                    : track.metadata?.file_size
                    ? formatFileSize(Number(track.metadata.file_size))
                    : sidecarMetadata?.file_size_bytes
                    ? formatFileSize(Number(sidecarMetadata.file_size_bytes))
                    : sidecarMetadata?.size || sidecarMetadata?.file_size || sidecarMetadata?.file_length
                    ? formatFileSize(Number(sidecarMetadata.size || sidecarMetadata.file_size || sidecarMetadata.file_length))
                    : 'Unknown'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-b border-slate-200 px-6 mt-4">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${
                activeTab === 'overview'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Music2 size={16} />
                Overview
              </div>
            </button>
            <button
              onClick={() => setActiveTab('descriptors')}
              className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${
                activeTab === 'descriptors'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Settings size={16} />
                Descriptors
              </div>
            </button>
            <button
              onClick={() => setActiveTab('metadata')}
              className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${
                activeTab === 'metadata'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Database size={16} />
                All Metadata
              </div>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div>
                <h4 className="font-semibold text-slate-900 mb-3">Basic Information</h4>
                <div className="bg-slate-50 rounded-lg p-4 space-y-3 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Track Name:</span>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editedMetadata.track_name || ''}
                        onChange={(e) => updateMetadataField('track_name', e.target.value)}
                        className="px-3 py-1.5 border border-slate-300 rounded-lg font-medium text-slate-900 w-64 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    ) : (
                      <span className="font-medium text-slate-900">
                        {track.track_name || 'N/A'}
                      </span>
                    )}
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Artist:</span>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editedMetadata.artist_name || ''}
                        onChange={(e) => updateMetadataField('artist_name', e.target.value)}
                        className="px-3 py-1.5 border border-slate-300 rounded-lg font-medium text-slate-900 w-64 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    ) : (
                      <span className="font-medium text-slate-900">
                        {track.artist_name || 'N/A'}
                      </span>
                    )}
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Album:</span>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editedMetadata.album || editedMetadata.album_name || ''}
                        onChange={(e) => updateMetadataField('album', e.target.value)}
                        className="px-3 py-1.5 border border-slate-300 rounded-lg font-medium text-slate-900 w-64 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    ) : (
                      <span className="font-medium text-slate-900">
                        {editedMetadata?.album || editedMetadata?.album_name || 'N/A'}
                      </span>
                    )}
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Genre:</span>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editedMetadata.genre || ''}
                        onChange={(e) => updateMetadataField('genre', e.target.value)}
                        className="px-3 py-1.5 border border-slate-300 rounded-lg font-medium text-slate-900 w-64 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    ) : (
                      <span className="font-medium text-slate-900">
                        {track.genre || 'N/A'}
                      </span>
                    )}
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Tempo (BPM):</span>
                    {isEditing ? (
                      <input
                        type="number"
                        step="0.01"
                        value={editedMetadata.tempo || ''}
                        onChange={(e) => updateMetadataField('tempo', e.target.value)}
                        className="px-3 py-1.5 border border-slate-300 rounded-lg font-medium text-slate-900 w-32 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    ) : (
                      <span className="font-medium text-slate-900">
                        {track.tempo || 'N/A'}
                      </span>
                    )}
                  </div>

                  <div className="flex justify-between pt-2 border-t border-slate-200">
                    <span className="text-slate-600">Track ID:</span>
                    <span className="font-medium text-slate-900">{track.track_id || track.id}</span>
                  </div>

                  {sidecarMetadata?.year && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Year:</span>
                      <span className="font-medium text-slate-900">{sidecarMetadata.year}</span>
                    </div>
                  )}

                  <div className="pt-3 border-t border-slate-200">
                    <p className="text-slate-600 text-sm font-medium mb-3">Energy Level Assignments:</p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600 text-sm">Low Energy:</span>
                        {isEditing ? (
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editedMetadata.energy_low || false}
                              onChange={(e) => updateMetadataField('energy_low', e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                          </label>
                        ) : (
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            track.energy_low ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-500'
                          }`}>
                            {track.energy_low ? 'Yes' : 'No'}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-600 text-sm">Medium Energy:</span>
                        {isEditing ? (
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editedMetadata.energy_medium || false}
                              onChange={(e) => updateMetadataField('energy_medium', e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-yellow-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-500"></div>
                          </label>
                        ) : (
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            track.energy_medium ? 'bg-yellow-100 text-yellow-800' : 'bg-slate-200 text-slate-500'
                          }`}>
                            {track.energy_medium ? 'Yes' : 'No'}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-slate-600 text-sm">High Energy:</span>
                        {isEditing ? (
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editedMetadata.energy_high || false}
                              onChange={(e) => updateMetadataField('energy_high', e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                          </label>
                        ) : (
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            track.energy_high ? 'bg-red-100 text-red-800' : 'bg-slate-200 text-slate-500'
                          }`}>
                            {track.energy_high ? 'Yes' : 'No'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {profile?.is_admin && channelAssignments.length > 0 && (
                <div>
                  <h4 className="font-semibold text-slate-900 mb-3">Preview Track Settings</h4>
                  <div className="bg-slate-50 rounded-lg p-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-900 mb-2">
                        Select Channel for Preview
                      </label>
                      <p className="text-xs text-slate-600 mb-2">
                        Choose which channel this track represents as a preview. This track is used in:
                      </p>
                      <select
                        value={previewChannelId}
                        onChange={(e) => setPreviewChannelId(e.target.value)}
                        disabled={isPreview}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                      >
                        <option value="">-- Select a channel --</option>
                        {channelAssignments.map((assignment) => (
                          <option key={assignment.channelId} value={assignment.channelId}>
                            {assignment.channelName} ({assignment.energy} energy)
                          </option>
                        ))}
                      </select>
                      {isPreview && (
                        <p className="mt-2 text-xs text-slate-500">
                          Disable preview mode to change the channel selection
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                      <div>
                        <p className="text-sm font-medium text-slate-900 mb-1">Enable as Preview Track</p>
                        <p className="text-xs text-slate-600">
                          Preview tracks are shown to non-signed in users on quiz results page
                        </p>
                      </div>
                      <button
                        onClick={handleTogglePreview}
                        disabled={updatingPreview || (!isPreview && !previewChannelId)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                          isPreview ? 'bg-blue-600' : 'bg-slate-300'
                        } ${updatingPreview || (!isPreview && !previewChannelId) ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            isPreview ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    {isPreview && previewChannelId && (
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
                        <span className="font-semibold">Active:</span> This is the preview track for{' '}
                        <span className="font-semibold">
                          {channelAssignments.find(a => a.channelId === previewChannelId)?.channelName || 'selected channel'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <h4 className="font-semibold text-slate-900 mb-3">Channel Assignments</h4>
                {loadingAssignments ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="flex flex-col items-center gap-3">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-200 border-t-blue-600"></div>
                      <p className="text-sm text-slate-600">Loading channel assignments...</p>
                    </div>
                  </div>
                ) : channelAssignments.length > 0 ? (
                  <div className="space-y-2">
                    {channelAssignments.map((assignment, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          if (onOpenChannelEditor && profile?.is_admin) {
                            onOpenChannelEditor(assignment.channelId, assignment.energy, track.metadata?.track_id || track.id);
                          }
                        }}
                        disabled={!profile?.is_admin}
                        className={`w-full flex items-center justify-between p-3 bg-slate-50 rounded-lg ${
                          profile?.is_admin ? 'hover:bg-slate-100 cursor-pointer transition-colors' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Radio size={16} className="text-blue-600" />
                          <span className="font-medium text-slate-900">{assignment.channelName}</span>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          assignment.energy === 'high'
                            ? 'bg-red-100 text-red-800'
                            : assignment.energy === 'medium'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {assignment.energy} energy
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div>
                    {profile?.is_admin ? (
                      <button
                        onClick={() => setShowEnergySelector(true)}
                        className="w-full text-left text-slate-500 text-sm py-3 bg-slate-50 hover:bg-slate-100 rounded-lg px-4 transition-colors"
                      >
                        This track is not currently assigned to any channels. Click to assign.
                      </button>
                    ) : (
                      <p className="text-slate-500 text-sm py-3 bg-slate-50 rounded-lg px-4">
                        This track is not currently assigned to any channels
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-semibold text-slate-900 mb-2">File Path</h4>
                <div className="bg-slate-50 rounded-lg p-3">
                  <code className="text-xs text-slate-600 break-all">{track.file_path}</code>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'descriptors' && (
            <div className="space-y-6">
              {sidecarMetadata && (
                <>
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-3">Musical Properties</h4>
                    <div className="bg-slate-50 rounded-lg p-4 space-y-3 text-sm">
                      {renderEditableField('Key Type', 'music_key_type', sidecarMetadata.music_key_type)}
                      {renderEditableField('Key Value', 'music_key_value', sidecarMetadata.music_key_value || sidecarMetadata.key)}
                      {renderEditableField('Speed', 'speed', sidecarMetadata.speed)}
                      {renderEditableField('Intensity', 'intensity', sidecarMetadata.intensity, 'number')}
                      {renderEditableField('Arousal', 'arousal', sidecarMetadata.arousal, 'number')}
                      {renderEditableField('Valence', 'valence', sidecarMetadata.valence, 'number')}
                      {renderEditableField('Brightness', 'brightness', sidecarMetadata.brightness, 'number')}
                      {renderEditableField('Complexity', 'complexity', sidecarMetadata.complexity, 'number')}
                      {renderEditableField('Energy', 'energy', sidecarMetadata.energy, 'number')}
                      {renderEditableField('Rating', 'rating', sidecarMetadata.rating, 'number')}
                    </div>
                  </div>

                  <div>
                    <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
                      {sidecarMetadata.created_at && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">Created:</span>
                          <span className="font-medium text-slate-900">
                            {new Date(sidecarMetadata.created_at).toLocaleString()}
                          </span>
                        </div>
                      )}
                      {sidecarMetadata.updated_at && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">Updated:</span>
                          <span className="font-medium text-slate-900">
                            {new Date(sidecarMetadata.updated_at).toLocaleString()}
                          </span>
                        </div>
                      )}
                      {sidecarMetadata.last_modified && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">Last Modified:</span>
                          <span className="font-medium text-slate-900">
                            {new Date(sidecarMetadata.last_modified).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'metadata' && (
            <div className="space-y-4">
              {loadingMetadata ? (
                <div className="flex items-center justify-center py-12">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" />
                  <span className="ml-3 text-slate-600">Loading metadata...</span>
                </div>
              ) : sidecarMetadata ? (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-blue-800">
                      <FileText size={16} className="inline mr-2" />
                      Showing all metadata fields from the JSON sidecar file
                    </p>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                    {renderMetadataList()}
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-slate-500">
                  <FileText size={48} className="mx-auto mb-3 text-slate-300" />
                  <p>No metadata file found for this track</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center z-10 rounded-xl">
          <div className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Delete Track?</h3>
            <p className="text-slate-600 mb-4">
              Are you sure you want to delete this track? It will be moved to the Deleted Tracks section and automatically removed from the system in 28 days.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-50 rounded-lg font-medium text-slate-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    Delete Track
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEnergySelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-xl font-bold text-slate-900 mb-2">
                Assign Track to Channel
              </h3>
              <p className="text-slate-600">
                Select which channel and energy level playlist you want to add this track to:
              </p>
            </div>
            <div className="overflow-y-auto flex-1 p-6">
              <div className="space-y-4">
                {channels.map(channel => (
                  <div key={channel.id} className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                      <div className="flex items-center gap-2">
                        <Radio size={16} className="text-blue-600" />
                        <span className="font-semibold text-slate-900">{channel.channel_name}</span>
                      </div>
                    </div>
                    <div className="p-2 space-y-2">
                      <button
                        onClick={() => {
                          if (onOpenChannelEditor) {
                            setShowEnergySelector(false);
                            onOpenChannelEditor(channel.id, 'low', track.metadata?.track_id || track.id);
                          }
                        }}
                        className="w-full p-3 bg-green-50 hover:bg-green-100 rounded-lg transition-colors text-left"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-900">Low Energy</span>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            low energy
                          </span>
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          if (onOpenChannelEditor) {
                            setShowEnergySelector(false);
                            onOpenChannelEditor(channel.id, 'medium', track.metadata?.track_id || track.id);
                          }
                        }}
                        className="w-full p-3 bg-yellow-50 hover:bg-yellow-100 rounded-lg transition-colors text-left"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-900">Medium Energy</span>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            medium energy
                          </span>
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          if (onOpenChannelEditor) {
                            setShowEnergySelector(false);
                            onOpenChannelEditor(channel.id, 'high', track.metadata?.track_id || track.id);
                          }
                        }}
                        className="w-full p-3 bg-red-50 hover:bg-red-100 rounded-lg transition-colors text-left"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-900">High Energy</span>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            high energy
                          </span>
                        </div>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-6 border-t border-slate-200">
              <button
                onClick={() => setShowEnergySelector(false)}
                className="w-full px-4 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
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

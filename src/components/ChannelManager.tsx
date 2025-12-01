import { useState, useEffect, useCallback } from 'react';
import { Music, Trash2, Plus, GripVertical, Database } from 'lucide-react';
import { supabase, AudioChannel } from '../lib/supabase';
import { EnergyPlaylistModal } from './EnergyPlaylistModal';
import { SearchInput } from './SearchInput';

type SortMode = 'name' | 'date' | 'custom' | 'user-order';

export function ChannelManager() {
  const [channels, setChannels] = useState<AudioChannel[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [deletingChannel, setDeletingChannel] = useState<AudioChannel | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<AudioChannel | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('user-order');
  const [customOrderState, setCustomOrderState] = useState<AudioChannel[]>([]);
  const [draggedChannel, setDraggedChannel] = useState<AudioChannel | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<AudioChannel[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [lastActiveTab, setLastActiveTab] = useState<Record<string, 'low' | 'medium' | 'high'>>({});
  const [showExportButton, setShowExportButton] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadChannels();

    // Check for channel query parameter immediately on mount
    const urlParams = new URLSearchParams(window.location.search);
    const channelId = urlParams.get('channel');

    if (channelId) {
      // Load the specific channel directly
      const loadChannelById = async () => {
        const { data: freshChannel } = await supabase
          .from('audio_channels')
          .select('*')
          .eq('id', channelId)
          .maybeSingle();

        if (freshChannel) {
          setSelectedChannel(freshChannel);
          // Clear the query parameter from URL
          window.history.replaceState({}, '', '/admin');
        }
      };
      loadChannelById();
    }
  }, []);

  const loadChannels = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('audio_channels')
      .select('*')
      .order('display_order');

    if (data) {
      setChannels(data);

      // Update selectedChannel if it's currently being edited
      if (selectedChannel) {
        const updatedChannel = data.find(c => c.id === selectedChannel.id);
        if (updatedChannel) {
          setSelectedChannel(updatedChannel);
        }
      }
    }
    setLoading(false);
  };

  const startDeleteChannel = (channel: AudioChannel) => {
    setDeletingChannel(channel);
    setDeleteConfirmText('');
  };

  const cancelDelete = () => {
    setDeletingChannel(null);
    setDeleteConfirmText('');
  };

  const confirmDeleteChannel = async () => {
    if (!deletingChannel || deleteConfirmText !== 'DELETE') {
      return;
    }

    setDeleting(true);
    try {
      const { error } = await supabase
        .from('audio_channels')
        .delete()
        .eq('id', deletingChannel.id);

      if (error) throw error;

      alert(`Channel "${deletingChannel.channel_name}" has been deleted successfully`);
      await loadChannels();
      setDeletingChannel(null);
      setDeleteConfirmText('');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete channel');
    } finally {
      setDeleting(false);
    }
  };


  const getSortedChannels = () => {
    // For custom mode, use custom order state if available
    if (sortMode === 'custom' && customOrderState.length > 0) {
      return customOrderState;
    }

    // If we have pending changes in user-order mode, use pending order
    if (pendingOrder.length > 0 && sortMode === 'user-order') {
      return pendingOrder;
    }

    let sorted = [...channels];

    if (sortMode === 'user-order') {
      // Sort by display_order (user view)
      sorted.sort((a, b) => (a.display_order || 999) - (b.display_order || 999));
    } else if (sortMode === 'name') {
      sorted.sort((a, b) => a.channel_name.localeCompare(b.channel_name));
    } else if (sortMode === 'date') {
      sorted.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
    } else {
      // Custom sort by channel_number
      sorted.sort((a, b) => a.channel_number - b.channel_number);
    }

    return sorted;
  };

  const filteredChannels = getSortedChannels().filter(channel => {
    if (!searchQuery) return true;

    const searchTerms = searchQuery.trim().split(/\s+/).filter(term => term.length > 0);
    const channelNameLower = channel.channel_name.toLowerCase();
    const channelNumberStr = channel.channel_number.toString();

    return searchTerms.every(term => {
      const termLower = term.toLowerCase();
      return channelNameLower.includes(termLower) || channelNumberStr.includes(termLower);
    });
  });

  const handleDragStart = (channel: AudioChannel) => {
    if (sortMode === 'user-order' || sortMode === 'custom') {
      setDraggedChannel(channel);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetChannel: AudioChannel) => {
    if (!draggedChannel || (sortMode !== 'user-order' && sortMode !== 'custom')) return;

    const currentOrder = sortMode === 'custom'
      ? (customOrderState.length > 0 ? customOrderState : getSortedChannels())
      : (pendingOrder.length > 0 ? pendingOrder : channels);
    const newChannels = [...currentOrder];
    const draggedIndex = newChannels.findIndex(c => c.id === draggedChannel.id);
    const targetIndex = newChannels.findIndex(c => c.id === targetChannel.id);

    if (draggedIndex === targetIndex) {
      setDraggedChannel(null);
      return;
    }

    // Remove dragged item
    const [removed] = newChannels.splice(draggedIndex, 1);
    // Insert at target position
    newChannels.splice(targetIndex, 0, removed);

    if (sortMode === 'custom') {
      // For custom mode, just update the temporary custom order state
      setCustomOrderState(newChannels);
    } else {
      // For user-order mode, set pending order and mark as having unsaved changes
      setPendingOrder(newChannels);
      setHasUnsavedChanges(true);
    }
    setDraggedChannel(null);
  };

  const handleExportAllChannels = async () => {
    if (!confirm('Export all channel data including configurations and slot sequences? This comprehensive export is designed for migrating to a new app version.')) {
      return;
    }

    setExporting(true);

    try {
      // Fetch all channels with full data
      const { data: allChannels, error: channelsError } = await supabase
        .from('audio_channels')
        .select('*')
        .order('channel_number');

      if (channelsError) throw channelsError;

      if (!allChannels || allChannels.length === 0) {
        alert('No channels found to export.');
        setExporting(false);
        return;
      }

      // Fetch all slot strategies
      const { data: slotStrategies, error: strategiesError } = await supabase
        .from('slot_strategies')
        .select('*')
        .order('channel_id, energy_tier');

      if (strategiesError) throw strategiesError;

      // Fetch all saved sequences
      const { data: savedSequences, error: sequencesError } = await supabase
        .from('saved_slot_sequences')
        .select('*')
        .order('name');

      if (sequencesError) throw sequencesError;

      // Create comprehensive export object
      const exportData = {
        version: '1.0',
        exported_at: new Date().toISOString(),
        channel_count: allChannels.length,
        channels: allChannels,
        slot_strategies: slotStrategies || [],
        saved_sequences: savedSequences || [],
        metadata: {
          total_channels: allChannels.length,
          total_strategies: (slotStrategies || []).length,
          total_sequences: (savedSequences || []).length,
          export_type: 'full_channel_configuration'
        }
      };

      // Create JSON blob and download
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `channels_full_export_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert(`Successfully exported ${allChannels.length} channels with ${(slotStrategies || []).length} strategies and ${(savedSequences || []).length} sequences`);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  const handleSaveOrder = async () => {
    setShowSaveConfirm(false);
    setSaving(true);

    try {
      // Update display_order for all channels
      const updates = pendingOrder.map((channel, index) => ({
        id: channel.id,
        display_order: index + 1
      }));

      for (const update of updates) {
        await supabase
          .from('audio_channels')
          .update({ display_order: update.display_order })
          .eq('id', update.id);
      }

      await loadChannels();
      setPendingOrder([]);
      setHasUnsavedChanges(false);
      alert('Channel order has been updated for all users');
    } catch (error) {
      alert('Failed to update channel order');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelChanges = () => {
    setPendingOrder([]);
    setHasUnsavedChanges(false);
  };

  // Reset custom order state when switching away from custom mode
  useEffect(() => {
    if (sortMode !== 'custom') {
      setCustomOrderState([]);
    }
  }, [sortMode]);

  const getTrackCount = (channel: AudioChannel, energy: string): number | string => {
    // Check if this energy level uses slot-based strategy
    const strategyConfig = channel.playlist_strategy?.[energy];
    if (strategyConfig && strategyConfig.strategy === 'slot_based') {
      return '🎰'; // Slot dice emoji to indicate slot-based
    }

    // Fall back to playlist_data for track_id_order strategy
    const playlistData = channel.playlist_data;
    if (!playlistData || !playlistData[energy]) {
      return 0;
    }
    const energyData = playlistData[energy];
    if (Array.isArray(energyData)) {
      return energyData.length;
    }
    if (energyData.tracks && Array.isArray(energyData.tracks)) {
      return energyData.tracks.length;
    }
    if (energyData.files && Array.isArray(energyData.files)) {
      return energyData.files.length;
    }
    return 0;
  };

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-lg shadow-sm p-3 space-y-3">
        <div
          className="flex items-center gap-3"
          onContextMenu={(e) => {
            e.preventDefault();
            setShowExportButton(prev => !prev);
          }}
        >
          <SearchInput
            onSearch={handleSearch}
            placeholder="Search channels by name or number... (Press Enter to search)"
            data-testid="channels-search-input"
          />

          {showExportButton && (
            <button
              onClick={handleExportAllChannels}
              disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap disabled:opacity-50"
              title="Export all channel data (right-click to toggle)"
            >
              <Database size={18} />
              {exporting ? 'Exporting...' : 'Export All Data'}
            </button>
          )}

          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600">Sort by:</span>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="user-order">User View</option>
              <option value="name">Name</option>
              <option value="date">Date Created</option>
              <option value="custom">Custom (Channel #)</option>
            </select>
          </div>

          {sortMode === 'user-order' && !hasUnsavedChanges && (
            <div className="text-sm text-slate-600 bg-blue-50 px-3 py-2 rounded-lg whitespace-nowrap">
              Drag to reorder for end users
            </div>
          )}
          {sortMode === 'custom' && !hasUnsavedChanges && (
            <div className="text-sm text-slate-600 bg-slate-100 px-3 py-2 rounded-lg whitespace-nowrap">
              Drag to manually reorder (temporary view)
            </div>
          )}

          <div className="flex items-center gap-2">
            {hasUnsavedChanges && sortMode === 'user-order' && (
              <>
                <div className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg font-medium whitespace-nowrap">
                  You have unsaved changes
                </div>
                <button
                  onClick={handleCancelChanges}
                  disabled={saving}
                  className="px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setShowSaveConfirm(true)}
                  disabled={saving}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 font-medium"
                >
                  Save Order
                </button>
              </>
            )}
            {!hasUnsavedChanges && (
              <button
                onClick={() => setIsCreatingNew(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                data-testid="add-channel-button"
              >
                <Plus size={20} />
                Add Channel
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {filteredChannels.map((channel, index) => (
          <div
            key={channel.id}
            draggable={sortMode === 'user-order' || sortMode === 'custom'}
            onDragStart={() => handleDragStart(channel)}
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(channel)}
            className={`bg-white rounded-lg shadow-sm p-3 transition-shadow ${
              (sortMode === 'user-order' || sortMode === 'custom') ? 'cursor-move hover:shadow-md' : 'cursor-pointer hover:shadow-md'
            } ${draggedChannel?.id === channel.id ? 'opacity-50' : ''}`}
            onClick={() => (sortMode !== 'user-order' && sortMode !== 'custom') && setSelectedChannel(channel)}
            data-testid={`channel-card-${channel.id}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {(sortMode === 'user-order' || sortMode === 'custom') && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <GripVertical className="text-slate-400" size={18} />
                    <span className="text-sm font-bold text-slate-500 w-6">{index + 1}</span>
                  </div>
                )}
                <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Music className="text-blue-600" size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-slate-900">{channel.channel_name}</h3>
                  {channel.description && (
                    <p className="text-xs text-slate-500 truncate">{channel.description}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 ml-4">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-600 font-medium">Low:</span>
                    <span className="text-slate-900 font-bold">{getTrackCount(channel, 'low')}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-600 font-medium">Med:</span>
                    <span className="text-slate-900 font-bold">{getTrackCount(channel, 'medium')}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-600 font-medium">High:</span>
                    <span className="text-slate-900 font-bold">{getTrackCount(channel, 'high')}</span>
                  </div>
                </div>
                {(sortMode !== 'user-order' && sortMode !== 'custom') && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startDeleteChannel(channel);
                    }}
                    className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
                {(sortMode === 'user-order' || sortMode === 'custom') && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedChannel(channel);
                    }}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredChannels.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm">
          <Music className="mx-auto text-slate-300 mb-4" size={48} />
          <p className="text-slate-600">No channels found matching your search</p>
        </div>
      )}

      {showSaveConfirm && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4 pb-24"
          onClick={() => setShowSaveConfirm(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4 mb-4">
              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-900 mb-2">Save Channel Order</h3>
                <p className="text-slate-600 text-sm mb-4">
                  Are you sure you want to update the channel order for all users?
                </p>
                <p className="text-slate-700 text-sm bg-blue-50 p-3 rounded-lg">
                  This will change the order in which channels appear to users on their dashboard (after the top 3 recommended channels from their quiz results).
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowSaveConfirm(false)}
                disabled={saving}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveOrder}
                disabled={saving}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Yes, Update Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingChannel && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4 pb-24"
          onClick={() => setDeletingChannel(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Trash2 className="text-red-600" size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-900 mb-2">Delete Channel</h3>
                <p className="text-slate-600 text-sm mb-4">
                  You are about to permanently delete the channel:
                </p>
                <p className="text-slate-900 font-semibold mb-4">
                  {deletingChannel.channel_name}
                </p>
                <p className="text-slate-600 text-sm mb-4">
                  This action cannot be undone. To confirm, please type <span className="font-mono font-bold text-red-600">DELETE</span> below:
                </p>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-mono"
                  placeholder="Type DELETE to confirm"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelDelete}
                disabled={deleting}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteChannel}
                disabled={deleteConfirmText !== 'DELETE' || deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting...' : 'Delete Channel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedChannel && (
        <EnergyPlaylistModal
          channel={selectedChannel}
          onClose={() => setSelectedChannel(null)}
          onUpdate={() => {
            loadChannels();
          }}
          initialEnergyLevel={lastActiveTab[selectedChannel.id]}
          onTabChange={(tab) => {
            setLastActiveTab(prev => ({
              ...prev,
              [selectedChannel.id]: tab
            }));
          }}
        />
      )}

      {isCreatingNew && (
        <EnergyPlaylistModal
          onClose={() => setIsCreatingNew(false)}
          onUpdate={() => {
            loadChannels();
            setIsCreatingNew(false);
          }}
        />
      )}
    </div>
  );
}

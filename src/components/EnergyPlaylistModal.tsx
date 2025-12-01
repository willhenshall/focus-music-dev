import { useState, useEffect, useMemo, useRef } from 'react';
import { X, Plus, Trash2, Play, Pause, CreditCard as Edit2, Save, Settings, Music, ChevronUp, ChevronDown, Activity, Loader2 } from 'lucide-react';
import { supabase, AudioChannel, AudioTrack, PlaylistStrategy } from '../lib/supabase';
import { useMusicPlayer } from '../contexts/MusicPlayerContext';
import { useAuth } from '../contexts/AuthContext';
import { SearchInput } from './SearchInput';
import { StrategyEditModal } from './StrategyEditModal';
import { TrackDetailModal } from './TrackDetailModal';
import { EnergyLevel, generatePlaylist, generatePlaylistSequence } from '../lib/playlisterService';

type PlaybackContinuation = 'restart_login' | 'restart_session' | 'continue';

type StrategyConfig = {
  strategy: PlaylistStrategy;
  playbackContinuation: PlaybackContinuation;
  noRepeatWindow?: number;
};

type PlaylistTrack = {
  track_id: string;
  weight?: number;
  bpm?: number;
  valence?: number;
  energy?: number;
  [key: string]: any;
};

type SortField = 'track_id' | 'track_name' | 'artist' | 'energy_level' | 'file_size' | 'duration' | 'bpm';
type SortDirection = 'asc' | 'desc';

type Props = {
  channel?: AudioChannel;
  onClose: () => void;
  onUpdate: () => void;
  onClearSearch?: () => void;
  initialEnergyLevel?: EnergyLevel;
  initialSearchQuery?: string;
  initialShowLibrary?: boolean;
  onTabChange?: (tab: EnergyLevel) => void;
};

export function EnergyPlaylistModal({ channel, onClose, onUpdate, onClearSearch, initialEnergyLevel, initialSearchQuery, initialShowLibrary, onTabChange }: Props) {
  const isNewChannel = !channel;
  const [activeTab, setActiveTab] = useState<EnergyLevel>(initialEnergyLevel || 'low');
  const [tracks, setTracks] = useState<Record<string, AudioTrack>>({});
  const [loading, setLoading] = useState(true);
  const [showLibrary, setShowLibrary] = useState(initialShowLibrary || false);
  const openedFromExternalWorkflowRef = useRef(initialShowLibrary || false);
  const hasClosedLibraryRef = useRef(false);
  const [libraryTracks, setLibraryTracks] = useState<AudioTrack[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery || '');
  const [removingTrack, setRemovingTrack] = useState<string | null>(null);
  const [addingTrack, setAddingTrack] = useState<AudioTrack | null>(null);
  const [trackParams, setTrackParams] = useState<PlaylistTrack | null>(null);
  const [isEditing, setIsEditing] = useState(isNewChannel);
  const [editForm, setEditForm] = useState({
    channel_name: channel?.channel_name || '',
    description: channel?.description || '',
    intensity: (channel as any)?.intensity || 'medium',
    about_channel: channel?.about_channel || '',
    about_image_url: channel?.about_image_url || '',
    about_external_link: channel?.about_external_link || '',
    collection: channel?.collection || null,
    hide_skip_button: channel?.hide_skip_button || false
  });
  const [saving, setSaving] = useState(false);
  const [showPlaylistConfig, setShowPlaylistConfig] = useState(false);
  const [updatingPlaylist, setUpdatingPlaylist] = useState(false);
  const [noRepeatWindows, setNoRepeatWindows] = useState<Record<EnergyLevel, number>>({
    low: channel?.playlist_strategy?.low.noRepeatWindow || 0,
    medium: channel?.playlist_strategy?.medium.noRepeatWindow || 0,
    high: channel?.playlist_strategy?.high.noRepeatWindow || 0
  });
  const [selectedTracks, setSelectedTracks] = useState<string[]>([]);
  const [selectedLibraryTracks, setSelectedLibraryTracks] = useState<string[]>([]);
  const [playlistSearchQuery, setPlaylistSearchQuery] = useState('');
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [sortField, setSortField] = useState<SortField>('track_id');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [customOrderMode, setCustomOrderMode] = useState(false);
  const [customOrderedTracks, setCustomOrderedTracks] = useState<PlaylistTrack[]>([]);
  const [draggedTrackIndex, setDraggedTrackIndex] = useState<number | null>(null);
  const [customOrderSaved, setCustomOrderSaved] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateCheck, setDuplicateCheck] = useState<{
    duplicates: AudioTrack[];
    newTracks: AudioTrack[];
    trackIdsToAdd: string[];
  } | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<PlaylistStrategy | null>(null);
  const [editingTrack, setEditingTrack] = useState<AudioTrack | null>(null);
  const [allChannels, setAllChannels] = useState<AudioChannel[]>([]);
  const [trackChannelAssignments, setTrackChannelAssignments] = useState<Array<{ channelName: string; channelId: string; energy: string }>>([]);
  const [showMonitor, setShowMonitor] = useState(false);
  const [monitorTrackCount, setMonitorTrackCount] = useState(100);
  const [monitorPreview, setMonitorPreview] = useState<AudioTrack[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [strategyConfigs, setStrategyConfigs] = useState<Record<EnergyLevel, StrategyConfig>>({
    low: {
      strategy: channel?.playlist_strategy?.low.strategy || 'track_id_order',
      playbackContinuation: (channel?.playlist_strategy?.low as any)?.playbackContinuation || 'continue',
      noRepeatWindow: channel?.playlist_strategy?.low.noRepeatWindow || 0
    },
    medium: {
      strategy: channel?.playlist_strategy?.medium.strategy || 'track_id_order',
      playbackContinuation: (channel?.playlist_strategy?.medium as any)?.playbackContinuation || 'continue',
      noRepeatWindow: channel?.playlist_strategy?.medium.noRepeatWindow || 0
    },
    high: {
      strategy: channel?.playlist_strategy?.high.strategy || 'track_id_order',
      playbackContinuation: (channel?.playlist_strategy?.high as any)?.playbackContinuation || 'continue',
      noRepeatWindow: channel?.playlist_strategy?.high.noRepeatWindow || 0
    }
  });
  const [savedStrategyConfigs, setSavedStrategyConfigs] = useState<Record<EnergyLevel, StrategyConfig>>({
    low: {
      strategy: channel?.playlist_strategy?.low.strategy || 'track_id_order',
      playbackContinuation: (channel?.playlist_strategy?.low as any)?.playbackContinuation || 'continue',
      noRepeatWindow: channel?.playlist_strategy?.low.noRepeatWindow || 0
    },
    medium: {
      strategy: channel?.playlist_strategy?.medium.strategy || 'track_id_order',
      playbackContinuation: (channel?.playlist_strategy?.medium as any)?.playbackContinuation || 'continue',
      noRepeatWindow: channel?.playlist_strategy?.medium.noRepeatWindow || 0
    },
    high: {
      strategy: channel?.playlist_strategy?.high.strategy || 'track_id_order',
      playbackContinuation: (channel?.playlist_strategy?.high as any)?.playbackContinuation || 'continue',
      noRepeatWindow: channel?.playlist_strategy?.high.noRepeatWindow || 0
    }
  });
  const { setAdminPreview, toggleAdminPlayback, isPlaying, adminPreviewTrack, playlist, currentTrackIndex } = useMusicPlayer();
  const { user } = useAuth();

  // Slot-based sequencer state
  const [slotStrategies, setSlotStrategies] = useState<Record<EnergyLevel, any>>({
    low: null,
    medium: null,
    high: null
  });
  const [slotPreviewSequences, setSlotPreviewSequences] = useState<Record<EnergyLevel, AudioTrack[]>>({
    low: [],
    medium: [],
    high: []
  });
  const [slotTrackPools, setSlotTrackPools] = useState<Record<EnergyLevel, number>>({
    low: 0,
    medium: 0,
    high: 0
  });
  const [slotFullTrackPools, setSlotFullTrackPools] = useState<Record<EnergyLevel, AudioTrack[]>>({
    low: [],
    medium: [],
    high: []
  });

  // Sync strategy configs when channel updates
  useEffect(() => {
    if (channel?.playlist_strategy) {
      const newConfigs = {
        low: {
          strategy: channel.playlist_strategy.low.strategy || 'track_id_order',
          playbackContinuation: (channel.playlist_strategy.low as any)?.playbackContinuation || 'continue',
          noRepeatWindow: channel.playlist_strategy.low.noRepeatWindow || 0
        },
        medium: {
          strategy: channel.playlist_strategy.medium.strategy || 'track_id_order',
          playbackContinuation: (channel.playlist_strategy.medium as any)?.playbackContinuation || 'continue',
          noRepeatWindow: channel.playlist_strategy.medium.noRepeatWindow || 0
        },
        high: {
          strategy: channel.playlist_strategy.high.strategy || 'track_id_order',
          playbackContinuation: (channel.playlist_strategy.high as any)?.playbackContinuation || 'continue',
          noRepeatWindow: channel.playlist_strategy.high.noRepeatWindow || 0
        }
      };
      setStrategyConfigs(newConfigs);
    }
  }, [channel?.playlist_strategy, channel?.id]);

  useEffect(() => {
    if (channel?.id) {
      // Load slot strategy data for all energy levels first
      loadSlotStrategyData('low');
      loadSlotStrategyData('medium');
      loadSlotStrategyData('high');
    } else {
      setLoading(false);
    }
  }, [channel?.id, JSON.stringify(channel?.playlist_strategy)]);

  // Reload tracks when slot full track pools change
  useEffect(() => {
    if (channel?.id) {
      loadTracks();
    }
  }, [channel?.id, channel?.playlist_data, slotFullTrackPools]);

  useEffect(() => {
    if (showLibrary && libraryTracks.length === 0) {
      loadLibraryTracks();
    }
  }, [showLibrary]);

  useEffect(() => {
    loadAllChannels();
  }, []);

  // Reload channel when window regains focus (user returns from slot editor)
  useEffect(() => {
    const handleFocus = async () => {
      if (channel?.id) {
        // Reload the fresh channel from database
        const { data: freshChannel } = await supabase
          .from('audio_channels')
          .select('*')
          .eq('id', channel.id)
          .maybeSingle();

        if (freshChannel) {
          // Update the channel prop by calling onUpdate which will trigger parent reload
          onUpdate();
          // Also reload slot strategies with fresh data
          if (freshChannel.playlist_strategy) {
            ['low', 'medium', 'high'].forEach(energy => {
              const strategyConfig = freshChannel.playlist_strategy?.[energy as EnergyLevel];
              if (strategyConfig?.strategy === 'slot_based') {
                loadSlotStrategyData(energy as EnergyLevel);
              }
            });
          }
        }
      }
    };

    const handleSlotStrategySaved = (event: any) => {
      const { channelId, energyTier } = event.detail;
      if (channelId === channel?.id) {
        // Reload the specific energy tier that was saved
        loadSlotStrategyData(energyTier);
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('slot-strategy-saved', handleSlotStrategySaved as EventListener);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('slot-strategy-saved', handleSlotStrategySaved as EventListener);
    };
  }, [channel?.id, onUpdate]);

  useEffect(() => {
    if (editingTrack) {
      loadTrackChannelAssignments(editingTrack);
    }
  }, [editingTrack]);

  useEffect(() => {
    setSelectedTracks([]);
    setCustomOrderMode(strategyConfigs[activeTab].strategy === 'custom');
    setCustomOrderSaved(false);
  }, [activeTab, strategyConfigs]);

  useEffect(() => {
    if (strategyConfigs[activeTab].strategy === 'custom') {
      setCustomOrderMode(true);
      const currentTracks = getPlaylistTracks(activeTab);
      if (currentTracks.length > 0) {
        setCustomOrderedTracks([...currentTracks]);
        setCustomOrderSaved(true);
      }
    } else {
      setCustomOrderMode(false);
      setCustomOrderSaved(false);
    }
  }, [strategyConfigs, activeTab, channel?.playlist_data]);

  const loadTracks = async () => {
    setLoading(true);
    const trackIds = new Set<string>();

    ['low', 'medium', 'high'].forEach(energy => {
      const energyLevel = energy as EnergyLevel;

      // Check if this energy level uses slot-based sequencer
      const strategyConfig = channel?.playlist_strategy?.[energyLevel];
      if (strategyConfig?.strategy === 'slot_based') {
        // Add track IDs from slot preview sequence
        const previewSequence = slotPreviewSequences[energyLevel];
        previewSequence.forEach(track => {
          const trackId = track.metadata?.track_id || track.id;
          if (trackId) {
            trackIds.add(String(trackId));
          }
        });
      } else {
        // Normal playlist data handling
        const energyData = channel.playlist_data[energyLevel];
        let tracksArray: any[] = [];

        if (energyData) {
          if (Array.isArray(energyData)) {
            tracksArray = energyData;
          } else if (energyData.tracks && Array.isArray(energyData.tracks)) {
            tracksArray = energyData.tracks;
          } else if (energyData.files && Array.isArray(energyData.files)) {
            // Handle imported format with 'files' array (e.g., ["169444.mp3", "169454.mp3"])
            tracksArray = energyData.files.map((file: string) => {
              // Strip .mp3 extension to get track_id
              return file.replace(/\.mp3$/, '');
            });
          }
        }

        tracksArray.forEach(item => {
          if (typeof item === 'string') {
            // Remove .mp3 extension if present
            const trackId = item.replace(/\.mp3$/, '');
            trackIds.add(trackId);
          } else if (typeof item === 'object' && item.track_id) {
            trackIds.add(String(item.track_id));
          }
        });
      }
    });

    if (trackIds.size > 0) {
      const { data } = await supabase
        .from('audio_tracks')
        .select('*')
        .in('track_id', Array.from(trackIds))
        .is('deleted_at', null);

      if (data) {
        const trackMap: Record<string, AudioTrack> = {};
        data.forEach(track => {
          if (track.track_id) {
            trackMap[track.track_id] = track;
          }
        });
        setTracks(trackMap);
      }
    } else {
      setTracks({});
    }
    setLoading(false);
  };

  const loadLibraryTracks = async () => {
    setLoadingLibrary(true);
    // Supabase has a max of 1000 rows per request, need to paginate
    let allTracks: AudioTrack[] = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('audio_tracks')
        .select('*')
        .is('deleted_at', null)
        .order('track_name')
        .range(from, from + pageSize - 1);

      if (error) {
        break;
      }

      if (data) {
        allTracks = [...allTracks, ...data];
        hasMore = data.length === pageSize;
        from += pageSize;
      } else {
        hasMore = false;
      }
    }

    setLibraryTracks(allTracks);
    setLoadingLibrary(false);
  };

  const loadAllChannels = async () => {
    const { data } = await supabase
      .from('audio_channels')
      .select('*')
      .order('channel_name');

    if (data) {
      setAllChannels(data);
    }
  };

  const loadSlotStrategyData = async (energyLevel: EnergyLevel) => {
    if (!channel) {
      return;
    }

    // Fetch fresh channel data to ensure we have the latest strategyId
    const { data: freshChannel } = await supabase
      .from('audio_channels')
      .select('*')
      .eq('id', channel.id)
      .maybeSingle();

    if (!freshChannel) {
      return;
    }

    const strategyConfig = freshChannel.playlist_strategy?.[energyLevel];

    if (!strategyConfig || strategyConfig.strategy !== 'slot_based') {
      return;
    }

    const strategyId = (strategyConfig as any).strategyId;
    if (!strategyId) {
      return;
    }


    try {
      // Load slot strategy with all related data
      const { data: strategy, error: strategyError } = await supabase
        .from('slot_strategies')
        .select(`
          *,
          slot_definitions (
            *,
            slot_boosts (*)
          ),
          slot_rule_groups (
            *,
            slot_rules (*)
          )
        `)
        .eq('id', strategyId)
        .single();

      if (strategyError || !strategy) {
        return;
      }

      // Store the strategy
      setSlotStrategies(prev => ({ ...prev, [energyLevel]: strategy }));

      // Now generate a preview sequence
      // First, load all tracks matching global filters
      let query = supabase
        .from('audio_tracks')
        .select('*')
        .is('deleted_at', null);

      // Apply global filters from slot_rule_groups (same logic as SlotStrategyEditor)
      if (strategy.slot_rule_groups && Array.isArray(strategy.slot_rule_groups)) {
        strategy.slot_rule_groups.forEach((group: any) => {
          if (group.slot_rules && Array.isArray(group.slot_rules)) {
            group.slot_rules.forEach((rule: any) => {
              if (rule.field && rule.value !== '') {
                const isMetadataField = rule.field.includes('->') || rule.field.includes('#>');

                if (isMetadataField) {
                  const cleanField = rule.field.replace(/['"]/g, '');

                  switch (rule.operator) {
                    case 'eq':
                      query = query.filter(cleanField, 'eq', rule.value);
                      break;
                    case 'neq':
                      query = query.filter(cleanField, 'neq', rule.value);
                      break;
                    case 'in':
                      if (Array.isArray(rule.value)) {
                        query = query.filter(cleanField, 'in', `(${rule.value.join(',')})`);
                      }
                      break;
                    case 'gte':
                      query = query.filter(cleanField, 'gte', rule.value);
                      break;
                    case 'lte':
                      query = query.filter(cleanField, 'lte', rule.value);
                      break;
                  }
                } else {
                  // Regular column fields use standard query methods
                  switch (rule.operator) {
                    case 'eq':
                      query = query.eq(rule.field, rule.value);
                      break;
                    case 'neq':
                      query = query.neq(rule.field, rule.value);
                      break;
                    case 'in':
                      if (Array.isArray(rule.value)) {
                        query = query.in(rule.field, rule.value);
                      }
                      break;
                    case 'gte':
                      query = query.gte(rule.field, rule.value);
                      break;
                    case 'lte':
                      query = query.lte(rule.field, rule.value);
                      break;
                  }
                }
              }
            });
          }
        });
      }

      const { data: allTracks, error: tracksError } = await query;

      if (tracksError || !allTracks) {
        return;
      }

      // Ensure metadata is parsed as object (Supabase sometimes returns it as string)
      const tracksWithParsedMetadata = allTracks.map(track => ({
        ...track,
        metadata: typeof track.metadata === 'string' ? JSON.parse(track.metadata) : track.metadata
      }));

      // Store pool size AND full track pool
      setSlotTrackPools(prev => ({ ...prev, [energyLevel]: tracksWithParsedMetadata.length }));
      setSlotFullTrackPools(prev => ({ ...prev, [energyLevel]: tracksWithParsedMetadata }));

      // Generate preview sequence (20 tracks)
      const previewLength = 20;
      const generatedSequence: AudioTrack[] = [];
      const usedTracks = new Set<string>();
      const slotDefinitions = strategy.slot_definitions || [];

      for (let i = 0; i < previewLength && tracksWithParsedMetadata.length > 0; i++) {
        const slotIndex = i % slotDefinitions.length;
        const slotDef = slotDefinitions[slotIndex];

        if (!slotDef || !slotDef.targets) continue;

        // Find best matching track for this slot
        const candidates = tracksWithParsedMetadata.filter(t => !usedTracks.has(t.id));

        if (candidates.length === 0) {
          usedTracks.clear();
          candidates.push(...tracksWithParsedMetadata);
        }

        // Sort by distance to slot targets
        const sorted = candidates.sort((a, b) => {
          let scoreA = 0;
          let scoreB = 0;

          Object.entries(slotDef.targets).forEach(([field, target]: [string, any]) => {
            const valueA = a.metadata?.[field] ?? a[field] ?? 0;
            const valueB = b.metadata?.[field] ?? b[field] ?? 0;
            const boost = slotDef.slot_boosts?.find((b: any) => b.field === field)?.weight || 1;
            scoreA += Math.abs(valueA - target) * boost;
            scoreB += Math.abs(valueB - target) * boost;
          });

          return scoreA - scoreB;
        });

        if (sorted.length > 0) {
          generatedSequence.push(sorted[0]);
          usedTracks.add(sorted[0].id);
        }
      }

      setSlotPreviewSequences(prev => ({ ...prev, [energyLevel]: generatedSequence }));
    } catch (error) {
    }
  };

  const loadTrackChannelAssignments = async (track: AudioTrack) => {
    const trackId = track.metadata?.track_id || track.id;

    const { data: channels } = await supabase
      .from('audio_channels')
      .select('id, channel_name, playlist_data');

    if (!channels) {
      setTrackChannelAssignments([]);
      return;
    }

    const assignments: Array<{ channelName: string; channelId: string; energy: string }> = [];

    channels.forEach(ch => {
      ['low', 'medium', 'high'].forEach(energy => {
        const energyData = ch.playlist_data[energy as EnergyLevel];
        let trackIds: string[] = [];

        if (Array.isArray(energyData)) {
          trackIds = energyData.map(t => typeof t === 'string' ? t : t.track_id);
        } else if (energyData?.tracks && Array.isArray(energyData.tracks)) {
          trackIds = energyData.tracks.map((t: any) => typeof t === 'string' ? t : t.track_id);
        }

        if (trackIds.includes(trackId)) {
          assignments.push({
            channelName: ch.channel_name,
            channelId: ch.id,
            energy: energy
          });
        }
      });
    });

    setTrackChannelAssignments(assignments);
  };

  const getPlaylistTracks = (energy: EnergyLevel): PlaylistTrack[] => {
    if (!channel) return [];

    // If this energy level uses slot-based sequencer, return the FULL track pool
    const strategyConfig = channel.playlist_strategy?.[energy];
    if (strategyConfig?.strategy === 'slot_based') {
      const fullPool = slotFullTrackPools[energy];
      return fullPool.map(track => ({
        track_id: track.metadata?.track_id || track.id,
        ...track.metadata,
        ...track
      }));
    }

    // Otherwise, return normal playlist data
    const energyData = channel.playlist_data[energy];
    let tracksArray: any[] = [];

    if (energyData) {
      if (Array.isArray(energyData)) {
        tracksArray = energyData;
      } else if (energyData.tracks && Array.isArray(energyData.tracks)) {
        tracksArray = energyData.tracks;
      } else if (energyData.files && Array.isArray(energyData.files)) {
        // Handle imported format with 'files' array (e.g., ["169444.mp3", "169454.mp3"])
        tracksArray = energyData.files.map((file: string) => {
          // Strip .mp3 extension to get track_id
          return file.replace(/\.mp3$/, '');
        });
      }
    }

    return tracksArray.map(item => {
      if (typeof item === 'string') {
        // Remove .mp3 extension if present
        const trackId = item.replace(/\.mp3$/, '');
        return { track_id: trackId };
      }
      if (typeof item === 'object' && item.track_id) {
        return { ...item, track_id: String(item.track_id) };
      }
      return item as PlaylistTrack;
    });
  };

  const getTrackInfo = (trackId: string) => {
    const track = tracks[trackId];
    if (!track) return { name: 'Unknown', artist: 'Unknown' };

    return {
      name: track.track_name || 'Unknown',
      artist: track.artist_name || 'Unknown'
    };
  };

  const reorderEnergyLevel = (energy: EnergyLevel, strategy: PlaylistStrategy) => {
    const playlistTracks = getPlaylistTracks(energy);
    if (playlistTracks.length === 0) return null;

    let reorderedTracks = [...playlistTracks];

    switch (strategy) {
      case 'track_id_order':
        reorderedTracks.sort((a, b) => {
          const trackIdA = parseInt(a.track_id) || 0;
          const trackIdB = parseInt(b.track_id) || 0;
          return trackIdA - trackIdB;
        });
        break;

      case 'filename':
        reorderedTracks.sort((a, b) => {
          const trackA = tracks[a.track_id];
          const trackB = tracks[b.track_id];
          const nameA = trackA?.metadata?.track_name || trackA?.file_path || '';
          const nameB = trackB?.metadata?.track_name || trackB?.file_path || '';
          return nameA.localeCompare(nameB);
        });
        break;

      case 'upload_date':
        reorderedTracks.sort((a, b) => {
          const trackA = tracks[a.track_id];
          const trackB = tracks[b.track_id];
          const dateA = new Date(trackA?.created_at || 0).getTime();
          const dateB = new Date(trackB?.created_at || 0).getTime();
          return dateB - dateA;
        });
        break;

      case 'random':
        for (let i = reorderedTracks.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [reorderedTracks[i], reorderedTracks[j]] = [reorderedTracks[j], reorderedTracks[i]];
        }
        break;
    }

    return reorderedTracks;
  };

  const reorderAllEnergyLevels = async () => {
    if (!channel) return;

    try {
      const updatedPlaylistData = { ...channel.playlist_data };

      // Reorder each energy level
      for (const energy of ['low', 'medium', 'high'] as EnergyLevel[]) {
        const strategy = strategyConfigs[energy].strategy;
        const reorderedTracks = reorderEnergyLevel(energy, strategy);

        if (reorderedTracks) {
          const energyData = channel.playlist_data[energy];

          if (Array.isArray(energyData)) {
            updatedPlaylistData[energy] = reorderedTracks;
          } else if (energyData.tracks && Array.isArray(energyData.tracks)) {
            updatedPlaylistData[energy] = {
              ...energyData,
              tracks: reorderedTracks
            };
          } else {
            updatedPlaylistData[energy] = reorderedTracks;
          }
        }
      }

      // Single database update for all three energy levels
      const { error, data } = await supabase
        .from('audio_channels')
        .update({ playlist_data: updatedPlaylistData })
        .eq('id', channel.id)
        .select()
        .single();

      if (error) throw error;

      if (data) {
        channel.playlist_data = data.playlist_data;
      }
    } catch (error) {
      throw error;
    }
  };

  const reorderPlaylistByStrategy = async (energy: EnergyLevel, strategy: PlaylistStrategy) => {
    if (!channel) return;

    const playlistTracks = getPlaylistTracks(energy);
    if (playlistTracks.length === 0) return;

    setUpdatingPlaylist(true);

    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      let reorderedTracks = [...playlistTracks];

      switch (strategy) {
        case 'track_id_order':
          reorderedTracks.sort((a, b) => {
            const trackIdA = parseInt(a.track_id) || 0;
            const trackIdB = parseInt(b.track_id) || 0;
            return trackIdA - trackIdB;
          });
          break;

        case 'filename':
          reorderedTracks.sort((a, b) => {
            const trackA = tracks[a.track_id];
            const trackB = tracks[b.track_id];
            const nameA = trackA?.metadata?.track_name || trackA?.file_path || '';
            const nameB = trackB?.metadata?.track_name || trackB?.file_path || '';
            return nameA.localeCompare(nameB);
          });
          break;

        case 'upload_date':
          reorderedTracks.sort((a, b) => {
            const trackA = tracks[a.track_id];
            const trackB = tracks[b.track_id];
            const dateA = new Date(trackA?.created_at || 0).getTime();
            const dateB = new Date(trackB?.created_at || 0).getTime();
            return dateB - dateA;
          });
          break;

        case 'random':
          for (let i = reorderedTracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [reorderedTracks[i], reorderedTracks[j]] = [reorderedTracks[j], reorderedTracks[i]];
          }
          break;
      }

      const energyData = channel.playlist_data[energy];
      let updatedEnergyData: any;

      if (Array.isArray(energyData)) {
        updatedEnergyData = reorderedTracks;
      } else if (energyData.tracks && Array.isArray(energyData.tracks)) {
        updatedEnergyData = {
          ...energyData,
          tracks: reorderedTracks
        };
      } else {
        updatedEnergyData = reorderedTracks;
      }

      const updatedPlaylistData = {
        ...channel.playlist_data,
        [energy]: updatedEnergyData
      };

      const { error, data } = await supabase
        .from('audio_channels')
        .update({ playlist_data: updatedPlaylistData })
        .eq('id', channel.id)
        .select()
        .single();

      if (error) throw error;

      if (data) {
        channel.playlist_data = data.playlist_data;
      }

    } catch (error) {
      alert('Failed to reorder playlist');
      throw error;
    } finally {
      setUpdatingPlaylist(false);
    }
  };

  const handleSaveStrategyConfig = (config: StrategyConfig) => {
    setStrategyConfigs({
      ...strategyConfigs,
      [activeTab]: config
    });
    setNoRepeatWindows({
      ...noRepeatWindows,
      [activeTab]: config.noRepeatWindow || 0
    });
  };

  // Check if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    return ['low', 'medium', 'high'].some(level => {
      const current = strategyConfigs[level as EnergyLevel];
      const saved = savedStrategyConfigs[level as EnergyLevel];
      return current.strategy !== saved.strategy ||
             current.playbackContinuation !== saved.playbackContinuation ||
             current.noRepeatWindow !== saved.noRepeatWindow;
    });
  }, [strategyConfigs, savedStrategyConfigs]);

  const handleSavePlaylistStrategy = async () => {
    if (!channel) return;

    setSaving(true);
    setUpdatingPlaylist(true);

    try {
      const { error } = await supabase
        .from('audio_channels')
        .update({
          playlist_strategy: {
            low: {
              strategy: strategyConfigs.low.strategy,
              noRepeatWindow: strategyConfigs.low.noRepeatWindow || undefined,
              playbackContinuation: strategyConfigs.low.playbackContinuation
            },
            medium: {
              strategy: strategyConfigs.medium.strategy,
              noRepeatWindow: strategyConfigs.medium.noRepeatWindow || undefined,
              playbackContinuation: strategyConfigs.medium.playbackContinuation
            },
            high: {
              strategy: strategyConfigs.high.strategy,
              noRepeatWindow: strategyConfigs.high.noRepeatWindow || undefined,
              playbackContinuation: strategyConfigs.high.playbackContinuation
            }
          }
        })
        .eq('id', channel.id);

      if (error) throw error;

      // Reorder only the active energy level
      await reorderPlaylistByStrategy(activeTab, strategyConfigs[activeTab].strategy);

      // Fetch the updated channel to refresh strategy configs
      const { data: updatedChannel, error: fetchError } = await supabase
        .from('audio_channels')
        .select('*')
        .eq('id', channel.id)
        .single();

      if (fetchError) throw fetchError;

      if (updatedChannel) {
        Object.assign(channel, updatedChannel);
        // Force update of strategy configs from the fresh channel data
        const newConfigs = {
          low: {
            strategy: updatedChannel.playlist_strategy.low.strategy || 'track_id_order',
            playbackContinuation: (updatedChannel.playlist_strategy.low as any)?.playbackContinuation || 'continue',
            noRepeatWindow: updatedChannel.playlist_strategy.low.noRepeatWindow || 0
          },
          medium: {
            strategy: updatedChannel.playlist_strategy.medium.strategy || 'track_id_order',
            playbackContinuation: (updatedChannel.playlist_strategy.medium as any)?.playbackContinuation || 'continue',
            noRepeatWindow: updatedChannel.playlist_strategy.medium.noRepeatWindow || 0
          },
          high: {
            strategy: updatedChannel.playlist_strategy.high.strategy || 'track_id_order',
            playbackContinuation: (updatedChannel.playlist_strategy.high as any)?.playbackContinuation || 'continue',
            noRepeatWindow: updatedChannel.playlist_strategy.high.noRepeatWindow || 0
          }
        };
        setStrategyConfigs(newConfigs);
        setSavedStrategyConfigs(newConfigs);
      }

      await loadTracks();
      onUpdate();

      // Clear monitor preview so it will be regenerated with new strategy
      setMonitorPreview([]);

      setShowPlaylistConfig(false);
    } catch (error) {
      alert('Failed to save playlist strategy');
    } finally {
      setSaving(false);
      setUpdatingPlaylist(false);
    }
  };

  const handleSaveChannelInfo = async () => {
    if (!editForm.channel_name.trim()) {
      alert('Channel name is required');
      return;
    }

    setSaving(true);
    try {
      const baseData = {
        channel_name: editForm.channel_name,
        description: editForm.description,
        intensity: editForm.intensity,
      };

      // Try to include about fields, but handle gracefully if columns don't exist
      const aboutData = {
        about_channel: editForm.about_channel || null,
        collection: editForm.collection || null,
        about_image_url: editForm.about_image_url || null,
        about_external_link: editForm.about_external_link || null,
        hide_skip_button: editForm.hide_skip_button
      };

      if (isNewChannel) {
        // Get the next channel number
        const { data: maxChannelData } = await supabase
          .from('audio_channels')
          .select('channel_number')
          .order('channel_number', { ascending: false })
          .limit(1);

        const nextChannelNumber = maxChannelData && maxChannelData.length > 0
          ? maxChannelData[0].channel_number + 1
          : 1;

        // Try with about fields first
        let error = (await supabase
          .from('audio_channels')
          .insert({
            ...baseData,
            channel_number: nextChannelNumber,
            playlist_data: { low: [], medium: [], high: [] },
            playlist_strategy: {
              low: { strategy: strategyConfigs.low.strategy },
              medium: { strategy: strategyConfigs.medium.strategy },
              high: { strategy: strategyConfigs.high.strategy }
            },
            ...aboutData
          })).error;

        // If failed due to column not existing, try without about fields
        if (error && error.message.includes('column')) {
          console.warn('About columns not yet in database, saving without them');
          error = (await supabase
            .from('audio_channels')
            .insert({
              ...baseData,
              channel_number: nextChannelNumber,
              playlist_data: { low: [], medium: [], high: [] },
              playlist_strategy: {
                low: { strategy: strategyConfigs.low.strategy },
                medium: { strategy: strategyConfigs.medium.strategy },
                high: { strategy: strategyConfigs.high.strategy }
              }
            })).error;
        }

        if (error) throw error;

        onUpdate();
        onClose();
      } else {
        // Try with about fields first
        let error = (await supabase
          .from('audio_channels')
          .update({
            ...baseData,
            ...aboutData
          })
          .eq('id', channel!.id)).error;

        // If failed due to column not existing, try without about fields
        if (error && error.message.includes('column')) {
          console.warn('About columns not yet in database, saving without them');
          error = (await supabase
            .from('audio_channels')
            .update(baseData)
            .eq('id', channel!.id)).error;
        }

        if (error) throw error;

        setIsEditing(false);
        onUpdate();
      }
    } catch (error) {
      console.error('Failed to save channel:', error);
      alert(`Failed to save channel information: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteChannel = async () => {
    if (!channel || deleteConfirmText !== 'DELETE') {
      return;
    }

    setDeleting(true);
    try {
      const { error } = await supabase
        .from('audio_channels')
        .delete()
        .eq('id', channel.id);

      if (error) throw error;

      alert(`Channel "${channel.channel_name}" has been deleted successfully`);
      onUpdate();
      onClose();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete channel');
    } finally {
      setDeleting(false);
    }
  };

  const loadMonitorPreview = async () => {
    if (!channel || !user) {
      return;
    }

    setLoadingPreview(true);
    try {
      const strategy = strategyConfigs[activeTab].strategy;

      // Handle slot-based strategy preview
      if (strategy === 'slot_based') {
        const previewSequence = slotPreviewSequences[activeTab];

        if (previewSequence && previewSequence.length > 0) {
          // Limit to requested count
          const limitedSequence = previewSequence.slice(0, Math.min(monitorTrackCount, previewSequence.length));
          setMonitorPreview(limitedSequence);
        } else {
          setMonitorPreview([]);
        }
        setLoadingPreview(false);
        return;
      }

      // Use the actual playlist generation service to get the exact sequence the user will hear
      const playlistResponse = await generatePlaylistSequence({
        channelId: channel.id,
        energyLevel: activeTab,
        userId: user.id,
        strategy,
        sequenceLength: Math.min(monitorTrackCount, 100)
      });

      const limitedTrackIds = playlistResponse.trackIds;

      if (limitedTrackIds.length === 0) {
        setMonitorPreview([]);
        setLoadingPreview(false);
        return;
      }

      // Use RPC to efficiently query by track IDs in metadata
      const { data: tracks, error } = await supabase.rpc('get_tracks_by_ids', {
        track_ids: limitedTrackIds
      });

      if (error) {
        // Fallback: fetch all tracks if RPC fails
        const { data: allTracks, error: fallbackError } = await supabase
          .from('audio_tracks')
          .select('*')
          .is('deleted_at', null)
          .limit(10000);

        if (fallbackError) {
          throw new Error('Failed to fetch tracks: ' + fallbackError.message);
        }

        const trackMap = new Map(allTracks?.map(t => [String(t.metadata?.track_id), t]) || []);
        const orderedTracks = limitedTrackIds
          .map(id => trackMap.get(id))
          .filter(Boolean) as AudioTrack[];

        setMonitorPreview(orderedTracks);
        setLoadingPreview(false);
        return;
      }


      // Build a map and maintain order
      const trackMap = new Map(tracks?.map((t: AudioTrack) => [String(t.metadata?.track_id), t]) || []);
      const orderedTracks = limitedTrackIds
        .map(id => trackMap.get(id))
        .filter(Boolean) as AudioTrack[];

      setMonitorPreview(orderedTracks);
    } catch (error) {
      alert('Failed to load playlist preview: ' + (error as Error).message);
    } finally {
      setLoadingPreview(false);
    }
  };

  useEffect(() => {
    if (showMonitor) {
      loadMonitorPreview();
    }
  }, [showMonitor, activeTab, monitorTrackCount, strategyConfigs]);

  const handleRemoveTrack = async (energy: EnergyLevel, trackId: string) => {
    if (!channel) return;
    if (!confirm('Are you sure you want to remove this track from the playlist?')) {
      return;
    }

    setRemovingTrack(trackId);
    try {
      const energyData = channel.playlist_data[energy];
      let updatedEnergyData: any;

      if (Array.isArray(energyData)) {
        updatedEnergyData = energyData.filter((item: any) => {
          if (typeof item === 'string') return item !== trackId;
          return String(item.track_id) !== trackId;
        });
      } else if (energyData.tracks && Array.isArray(energyData.tracks)) {
        updatedEnergyData = {
          ...energyData,
          tracks: energyData.tracks.filter((item: any) => {
            if (typeof item === 'string') return item !== trackId;
            return String(item.track_id) !== trackId;
          })
        };
      }

      const updatedPlaylistData = {
        ...channel.playlist_data,
        [energy]: updatedEnergyData
      };

      const { error, data } = await supabase
        .from('audio_channels')
        .update({ playlist_data: updatedPlaylistData })
        .eq('id', channel.id)
        .select()
        .single();

      if (error) throw error;

      // Update local channel data to reflect the change
      if (data) {
        channel.playlist_data = data.playlist_data;
      }

      // Reload tracks to refresh the UI
      await loadTracks();

      // Also notify parent for any other updates
      onUpdate();
    } catch (error) {
      alert('Failed to remove track');
    } finally {
      setRemovingTrack(null);
    }
  };

  const toggleTrackSelection = (trackId: string) => {
    if (selectedTracks.includes(trackId)) {
      const newSelection = selectedTracks.filter(id => id !== trackId);
      setSelectedTracks(newSelection);
    } else {
      const newSelection = [...selectedTracks, trackId];
      setSelectedTracks(newSelection);
    }
  };

  const toggleSelectAll = () => {
    const displayedTracks = filteredPlaylistTracks;
    const displayedTrackIds = displayedTracks.map(t =>
      typeof t === 'string' ? t : String(t.track_id)
    );

    const allDisplayedSelected = displayedTrackIds.every(id => selectedTracks.includes(id));

    if (allDisplayedSelected && displayedTrackIds.length > 0) {
      setSelectedTracks(selectedTracks.filter(id => !displayedTrackIds.includes(id)));
    } else {
      const newSelection = [...new Set([...selectedTracks, ...displayedTrackIds])];
      setSelectedTracks(newSelection);
    }
  };

  const handleBulkDelete = async () => {
    if (!channel || selectedTracks.length === 0) return;

    const count = selectedTracks.length;
    if (!confirm(`Are you sure you want to remove ${count} track${count > 1 ? 's' : ''} from this playlist?`)) {
      return;
    }

    setBulkDeleting(true);
    try {
      const energyData = channel.playlist_data[activeTab];
      let updatedEnergyData: any;

      if (Array.isArray(energyData)) {
        updatedEnergyData = energyData.filter((item: any) => {
          const trackId = typeof item === 'string' ? item : String(item.track_id);
          return !selectedTracks.includes(trackId);
        });
      } else if (energyData.tracks && Array.isArray(energyData.tracks)) {
        updatedEnergyData = {
          ...energyData,
          tracks: energyData.tracks.filter((item: any) => {
            const trackId = typeof item === 'string' ? item : String(item.track_id);
            return !selectedTracks.includes(trackId);
          })
        };
      }

      const updatedPlaylistData = {
        ...channel.playlist_data,
        [activeTab]: updatedEnergyData
      };

      const { error, data } = await supabase
        .from('audio_channels')
        .update({ playlist_data: updatedPlaylistData })
        .eq('id', channel.id)
        .select()
        .single();

      if (error) throw error;

      if (data) {
        channel.playlist_data = data.playlist_data;
      }

      await loadTracks();
      setSelectedTracks([]);
      onUpdate();
    } catch (error) {
      alert('Failed to remove tracks');
    } finally {
      setBulkDeleting(false);
    }
  };

  const startAddTrack = (track: AudioTrack) => {
    const existingTracks = getPlaylistTracks(activeTab);
    const exampleTrack = existingTracks.find(t => typeof t === 'object' && Object.keys(t).length > 1);

    const defaultParams: PlaylistTrack = {
      track_id: track.track_id || '',
      weight: 1.0,
      bpm: track.tempo || 120,
      valence: track.valence || 0.5,
      energy: track.energy || 0.5
    };

    if (exampleTrack) {
      Object.keys(exampleTrack).forEach(key => {
        if (key !== 'track_id' && !(key in defaultParams)) {
          defaultParams[key] = exampleTrack[key];
        }
      });
    }

    setAddingTrack(track);
    setTrackParams(defaultParams);
  };

  const confirmAddTrack = async () => {
    if (!channel || !addingTrack || !trackParams) return;

    try {
      const energyData = channel.playlist_data[activeTab];
      let updatedEnergyData: any;

      if (Array.isArray(energyData)) {
        updatedEnergyData = [...energyData, trackParams];
      } else if (energyData.tracks && Array.isArray(energyData.tracks)) {
        updatedEnergyData = {
          ...energyData,
          tracks: [...energyData.tracks, trackParams]
        };
      } else {
        updatedEnergyData = { tracks: [trackParams] };
      }

      const updatedPlaylistData = {
        ...channel.playlist_data,
        [activeTab]: updatedEnergyData
      };

      const { error, data } = await supabase
        .from('audio_channels')
        .update({ playlist_data: updatedPlaylistData })
        .eq('id', channel.id)
        .select()
        .single();

      if (error) throw error;

      if (data) {
        channel.playlist_data = data.playlist_data;
      }

      await loadTracks();
      setAddingTrack(null);
      setTrackParams(null);
      if (openedFromExternalWorkflowRef.current) {
        hasClosedLibraryRef.current = true;
        setShowLibrary(false);
        openedFromExternalWorkflowRef.current = false;
      }
      onUpdate();
    } catch (error) {
      alert('Failed to add track');
    }
  };

  const checkDuplicatesAndPrepareAdd = (trackIds?: string[]) => {
    if (!channel) return;

    const tracksToAdd = trackIds || selectedLibraryTracks;
    if (tracksToAdd.length === 0) return;

    const existingTracks = getPlaylistTracks(activeTab);
    const existingTrackIds = new Set(existingTracks.map(t => t.track_id));

    const duplicates: AudioTrack[] = [];
    const newTracks: AudioTrack[] = [];
    const trackIdsToAdd: string[] = [];

    tracksToAdd.forEach(uuid => {
      const track = libraryTracks.find(t => t.id === uuid);
      const trackId = track?.metadata?.track_id || uuid;

      if (existingTrackIds.has(trackId)) {
        if (track) duplicates.push(track);
      } else {
        if (track) newTracks.push(track);
        trackIdsToAdd.push(uuid);
      }
    });

    if (duplicates.length > 0) {
      setDuplicateCheck({ duplicates, newTracks, trackIdsToAdd });
      setShowDuplicateDialog(true);
    } else if (trackIdsToAdd.length > 0) {
      addMultipleTracks(trackIdsToAdd);
    }
  };

  const addMultipleTracks = async (trackIds?: string[]) => {
    if (!channel) return;

    const tracksToAdd = trackIds || selectedLibraryTracks;
    if (tracksToAdd.length === 0) return;

    try {
      const energyData = channel.playlist_data[activeTab];
      const existingTracks = getPlaylistTracks(activeTab);
      let baseTrack = existingTracks[0] || {};

      const newTracks = tracksToAdd.map(uuid => {
        const track = libraryTracks.find(t => t.id === uuid);
        const trackId = track?.metadata?.track_id || uuid;

        const defaultParams: PlaylistTrack = { track_id: trackId };
        Object.keys(baseTrack).forEach(key => {
          if (key !== 'track_id' && !(key in defaultParams)) {
            defaultParams[key] = baseTrack[key];
          }
        });
        return defaultParams;
      });

      let updatedEnergyData: any;

      if (Array.isArray(energyData)) {
        updatedEnergyData = [...energyData, ...newTracks];
      } else if (energyData.tracks && Array.isArray(energyData.tracks)) {
        updatedEnergyData = {
          ...energyData,
          tracks: [...energyData.tracks, ...newTracks]
        };
      } else {
        updatedEnergyData = { tracks: newTracks };
      }

      const updatedPlaylistData = {
        ...channel.playlist_data,
        [activeTab]: updatedEnergyData
      };

      const { error, data } = await supabase
        .from('audio_channels')
        .update({ playlist_data: updatedPlaylistData })
        .eq('id', channel.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      if (data) {
        channel.playlist_data = data.playlist_data;
      }

      await loadTracks();
      if (!trackIds) {
        setSelectedLibraryTracks([]);
      }
      if (openedFromExternalWorkflowRef.current) {
        setShowLibrary(false);
        openedFromExternalWorkflowRef.current = false;
        if (onClearSearch) {
          onClearSearch();
        }
      }
      onUpdate();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert('Failed to add tracks: ' + errorMessage);
    }
  };

  const handlePlayTrack = (track: AudioTrack) => {
    if (adminPreviewTrack?.id === track.id && isPlaying) {
      toggleAdminPlayback();
    } else {
      setAdminPreview(track, true);
    }
  };

  const filteredLibraryTracks = useMemo(() => {
    if (!searchQuery) return [];

    const searchTerms = searchQuery.trim().split(/\s+/).filter(term => term.length > 0);
    const filtered = libraryTracks.filter(track => {
      const name = track.track_name?.toLowerCase() || '';
      const artist = track.artist_name?.toLowerCase() || '';
      const trackId = track.track_id?.toLowerCase() || '';
      const album = track.album?.toLowerCase() || '';
      const genre = track.genre?.toLowerCase() || '';
      const bpm = track.tempo?.toString() || '';
      const energyLevel = track.energy_level?.toLowerCase() || '';

      return searchTerms.every(term => {
        const termLower = term.toLowerCase();
        return name.includes(termLower) ||
               artist.includes(termLower) ||
               trackId.includes(termLower) ||
               album.includes(termLower) ||
               genre.includes(termLower) ||
               bpm.includes(termLower) ||
               energyLevel.includes(termLower);
      });
    });

    return filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'track_id':
          aValue = a.track_id || '';
          bValue = b.track_id || '';
          break;
        case 'track_name':
          aValue = a.track_name || '';
          bValue = b.track_name || '';
          break;
        case 'artist':
          aValue = a.artist_name || '';
          bValue = b.artist_name || '';
          break;
        case 'energy_level':
          const energyOrder = { low: 1, medium: 2, high: 3 };
          aValue = energyOrder[a.energy_level as EnergyLevel] || 0;
          bValue = energyOrder[b.energy_level as EnergyLevel] || 0;
          break;
        case 'file_size':
          aValue = typeof a.file_size === 'string' ? parseFloat(a.file_size) : a.file_size || 0;
          bValue = typeof b.file_size === 'string' ? parseFloat(b.file_size) : b.file_size || 0;
          break;
        case 'duration':
          aValue = typeof a.duration_seconds === 'string' ? parseFloat(a.duration_seconds) : a.duration_seconds || 0;
          bValue = typeof b.duration_seconds === 'string' ? parseFloat(b.duration_seconds) : b.duration_seconds || 0;
          break;
        case 'bpm':
          aValue = typeof a.tempo === 'string' ? parseFloat(a.tempo) : a.tempo || 0;
          bValue = typeof b.tempo === 'string' ? parseFloat(b.tempo) : b.tempo || 0;
          break;
        default:
          return 0;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      return sortDirection === 'asc'
        ? aValue - bValue
        : bValue - aValue;
    });
  }, [libraryTracks, searchQuery, sortField, sortDirection]);

  const filteredPlaylistTracks = useMemo(() => {
    const playlistTracks = getPlaylistTracks(activeTab);

    if (!playlistSearchQuery) return playlistTracks;

    const searchTerms = playlistSearchQuery.trim().split(/\s+/).filter(term => term.length > 0);

    return playlistTracks.filter(playlistTrack => {
      const trackId = String(playlistTrack.track_id);
      const track = tracks[trackId];

      if (!track) return false;

      const name = track.track_name?.toLowerCase() || '';
      const artist = track.artist_name?.toLowerCase() || '';
      const trackIdStr = track.track_id?.toLowerCase() || '';
      const album = track.album?.toLowerCase() || '';
      const genre = track.genre?.toLowerCase() || '';
      const bpm = track.tempo?.toString() || '';

      return searchTerms.every(term => {
        const termLower = term.toLowerCase();
        return name.includes(termLower) ||
               artist.includes(termLower) ||
               trackIdStr.includes(termLower) ||
               album.includes(termLower) ||
               genre.includes(termLower) ||
               bpm.includes(termLower);
      });
    });
  }, [activeTab, playlistSearchQuery, tracks, channel]);

  const sortPlaylistByStrategy = (playlistTracks: PlaylistTrack[], strategy: PlaylistStrategy): PlaylistTrack[] => {
    const sorted = [...playlistTracks];

    switch (strategy) {
      case 'track_id_order':
        return sorted.sort((a, b) => {
          const trackA = tracks[a.track_id];
          const trackB = tracks[b.track_id];
          const idA = trackA?.metadata?.track_id || a.track_id;
          const idB = trackB?.metadata?.track_id || b.track_id;
          return String(idA).localeCompare(String(idB), undefined, { numeric: true });
        });

      case 'filename':
        return sorted.sort((a, b) => {
          const trackA = tracks[a.track_id];
          const trackB = tracks[b.track_id];
          const nameA = trackA?.metadata?.track_name || '';
          const nameB = trackB?.metadata?.track_name || '';
          return nameA.localeCompare(nameB);
        });

      case 'upload_date':
        return sorted.sort((a, b) => {
          const trackA = tracks[a.track_id];
          const trackB = tracks[b.track_id];
          const dateA = trackA?.created_at ? new Date(trackA.created_at).getTime() : 0;
          const dateB = trackB?.created_at ? new Date(trackB.created_at).getTime() : 0;
          return dateB - dateA;
        });

      case 'custom':
        return sorted;

      case 'random':
        // Don't reorder for random - keep original order
        // Random will be applied during playback sequence generation
        return sorted;

      default:
        return sorted;
    }
  };

  const rawPlaylistTracks = getPlaylistTracks(activeTab);
  const playlistTracks = useMemo(() => {
    return sortPlaylistByStrategy(rawPlaylistTracks, strategyConfigs[activeTab].strategy);
  }, [rawPlaylistTracks, strategyConfigs, activeTab, tracks]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleDragStart = (index: number) => {
    setDraggedTrackIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedTrackIndex === null || draggedTrackIndex === index) return;

    const newOrder = [...customOrderedTracks];
    const draggedItem = newOrder[draggedTrackIndex];
    newOrder.splice(draggedTrackIndex, 1);
    newOrder.splice(index, 0, draggedItem);

    setCustomOrderedTracks(newOrder);
    setDraggedTrackIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedTrackIndex(null);
  };

  const handleSaveCustomOrder = async () => {
    if (!channel) return;

    setSaving(true);
    try {
      const updatedPlaylistData = { ...channel.playlist_data };
      updatedPlaylistData[activeTab] = customOrderedTracks;

      const { error } = await supabase
        .from('audio_channels')
        .update({ playlist_data: updatedPlaylistData })
        .eq('id', channel.id);

      if (error) throw error;

      setCustomOrderSaved(true);
      alert(`Custom order saved for ${activeTab} energy!`);
      onUpdate();
    } catch (error) {
      alert('Failed to save custom order');
    } finally {
      setSaving(false);
    }
  };

  const handleRemakeCustomOrder = () => {
    setCustomOrderSaved(false);
  };

  const SortableHeader = ({ field, children, className = '' }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <th
      className={`px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider cursor-pointer hover:bg-slate-200 transition-colors ${className}`}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field && (
          (sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)
        )}
      </div>
    </th>
  );

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4 pb-24"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-lg shadow-xl w-full max-w-5xl h-[calc(100vh-8rem)] flex flex-col ${showLibrary ? 'invisible' : ''}`}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => {
          if (!isNewChannel) {
            e.preventDefault();
            setShowDeleteDialog(true);
          }
        }}
        data-testid="channel-editor-modal"
      >
        <div className="border-b border-slate-200">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1">
                {isEditing ? (
                  <div className="space-y-3 pr-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Display Name
                      </label>
                      <input
                        type="text"
                        value={editForm.channel_name}
                        onChange={(e) => setEditForm({ ...editForm, channel_name: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Channel display name"
                        data-testid="channel-name-input"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Description
                      </label>
                      <textarea
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        placeholder="Channel description"
                        rows={2}
                        data-testid="channel-description-input"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Channel Intensity
                      </label>
                      <select
                        value={editForm.intensity}
                        onChange={(e) => setEditForm({ ...editForm, intensity: e.target.value as 'low' | 'medium' | 'high' })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        data-testid="channel-intensity-select"
                      >
                        <option value="low">Low - Calm, gentle focus</option>
                        <option value="medium">Medium - Balanced engagement</option>
                        <option value="high">High - Intense, energizing</option>
                      </select>
                      <p className="text-xs text-slate-500 mt-1">
                        Categorizes the overall intensity level of this channel for sorting
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Collection Category
                      </label>
                      <select
                        value={editForm.collection || ''}
                        onChange={(e) => setEditForm({ ...editForm, collection: e.target.value || null })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">None - Not categorized</option>
                        <option value="electronic">Electronic - Digital, synthesized sounds</option>
                        <option value="acoustic">Acoustic - Natural, organic instruments</option>
                        <option value="rhythm">Rhythm - Percussion-focused, beats</option>
                        <option value="textures">Textures - Ambient, atmospheric soundscapes</option>
                      </select>
                      <p className="text-xs text-slate-500 mt-1">
                        Groups this channel in the Collections view for easier discovery
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-200">
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        About This Channel (Optional)
                      </label>
                      <textarea
                        value={editForm.about_channel}
                        onChange={(e) => {
                          const text = e.target.value;
                          const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;
                          if (wordCount <= 200) {
                            setEditForm({ ...editForm, about_channel: text });
                          }
                        }}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono text-sm"
                        placeholder="Information about the channel, artists, or creators. Supports markdown formatting. Max 200 words."
                        rows={4}
                        data-testid="channel-about-input"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Words: {editForm.about_channel.trim().split(/\s+/).filter(w => w.length > 0).length}/200 • Supports **bold**, *italic*, and [links](url)
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        About Image URL (Optional)
                      </label>
                      <input
                        type="url"
                        value={editForm.about_image_url}
                        onChange={(e) => setEditForm({ ...editForm, about_image_url: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="https://example.com/image.jpg"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        External Link (Optional)
                      </label>
                      <input
                        type="url"
                        value={editForm.about_external_link}
                        onChange={(e) => setEditForm({ ...editForm, about_external_link: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="https://example.com"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Link to artist page, channel info, or related content
                      </p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">{channel?.channel_name || 'New Channel'}</h2>
                    <p className="text-sm text-slate-600 mt-1">{channel?.description || 'Manage energy playlists'}</p>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    <button
                      onClick={handleSaveChannelInfo}
                      disabled={saving || !editForm.channel_name.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      data-testid="channel-save-button"
                    >
                      <Save size={18} />
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => {
                        if (isNewChannel) {
                          onClose();
                        } else {
                          setIsEditing(false);
                          setEditForm({
                            channel_name: channel!.channel_name,
                            description: channel!.description || '',
                            intensity: (channel as any)?.intensity || 'medium',
                            about_channel: channel!.about_channel || '',
                            about_image_url: channel!.about_image_url || '',
                            about_external_link: channel!.about_external_link || '',
                            collection: channel!.collection || null,
                            hide_skip_button: channel!.hide_skip_button || false
                          });
                        }
                      }}
                      disabled={saving}
                      className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                      data-testid="channel-cancel-button"
                    >
                      <X size={18} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setIsEditing(true)}
                      className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      data-testid="channel-edit-button"
                    >
                      <Edit2 size={18} />
                    </button>
                    {!isNewChannel && (
                      <button
                        onClick={() => setShowDeleteDialog(true)}
                        className="p-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 hover:opacity-100 focus:opacity-100"
                        title="Delete Channel"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                    <button
                      onClick={onClose}
                      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                      data-testid="channel-editor-close"
                    >
                      <X size={24} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex border-t border-slate-200">
            {(['low', 'medium', 'high'] as EnergyLevel[]).map((energy) => {
              // For slot-based sequencer, show pool size instead of playlist length
              const strategyConfig = channel?.playlist_strategy?.[energy];
              const isSlotBased = strategyConfig?.strategy === 'slot_based';
              const energyTrackCount = isSlotBased ? slotTrackPools[energy] : getPlaylistTracks(energy).length;

              return (
                <button
                  key={energy}
                  onClick={() => {
                    setActiveTab(energy);
                    onTabChange?.(energy);
                  }}
                  className={`flex-1 px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap ${
                    activeTab === energy
                      ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                  data-testid={`energy-tab-${energy}`}
                >
                  {energy.charAt(0).toUpperCase() + energy.slice(1)} Energy
                  <span className="ml-2 px-2 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium min-w-[2rem] inline-block text-center">
                    {energyTrackCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {!isNewChannel && (
          <div className="border-b border-slate-200 bg-white px-6 py-3.5">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-center w-8 h-8 bg-blue-600 rounded-lg">
                  <Settings size={16} className="text-white" />
                </div>
                <div className="flex flex-col">
                  <div className="text-[10px] font-medium text-blue-600 uppercase tracking-wide leading-tight">Active Strategy</div>
                  <div className="relative">
                    <select
                      value={strategyConfigs[activeTab].strategy}
                      onChange={async (e) => {
                        const newStrategy = e.target.value as PlaylistStrategy;
                        const newConfigs = { ...strategyConfigs, [activeTab]: { ...strategyConfigs[activeTab], strategy: newStrategy } };
                        setStrategyConfigs(newConfigs);

                        // Auto-save the strategy change
                        if (channel) {
                          setSaving(true);
                          try {
                            const { error } = await supabase
                              .from('audio_channels')
                              .update({
                                playlist_strategy: {
                                  low: {
                                    strategy: newConfigs.low.strategy,
                                    noRepeatWindow: newConfigs.low.noRepeatWindow || undefined,
                                    playbackContinuation: newConfigs.low.playbackContinuation
                                  },
                                  medium: {
                                    strategy: newConfigs.medium.strategy,
                                    noRepeatWindow: newConfigs.medium.noRepeatWindow || undefined,
                                    playbackContinuation: newConfigs.medium.playbackContinuation
                                  },
                                  high: {
                                    strategy: newConfigs.high.strategy,
                                    noRepeatWindow: newConfigs.high.noRepeatWindow || undefined,
                                    playbackContinuation: newConfigs.high.playbackContinuation
                                  }
                                }
                              })
                              .eq('id', channel.id);

                            if (error) throw error;

                            // Refresh the channel data from the database
                            const { data: updatedChannel } = await supabase
                              .from('audio_channels')
                              .select('*')
                              .eq('id', channel.id)
                              .single();

                            if (updatedChannel) {
                              Object.assign(channel, updatedChannel);
                            }

                            await loadTracks();
                            onUpdate();
                          } catch (error) {
                            alert('Failed to save strategy');
                          } finally {
                            setSaving(false);
                          }
                        }
                      }}
                      disabled={saving}
                      className="text-sm font-semibold text-slate-900 leading-tight bg-transparent border-none outline-none pr-6 cursor-pointer appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="track_id_order">Track ID Order</option>
                      <option value="filename">Track Name Order</option>
                      <option value="upload_date">Upload Date</option>
                      <option value="random">Random Shuffle</option>
                      <option value="custom">Custom Order</option>
                      <option value="slot_based">Slot Sequencer</option>
                    </select>
                    <ChevronDown size={14} className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (strategyConfigs[activeTab].strategy === 'slot_based' && channel) {
                      window.location.href = `/admin/slot-strategy/${channel.id}/${activeTab}`;
                    } else {
                      setEditingStrategy(strategyConfigs[activeTab].strategy);
                    }
                  }}
                  className="ml-2 px-4 py-2 bg-white border border-blue-300 text-blue-700 hover:bg-blue-50 rounded-lg transition-colors text-sm font-medium"
                >
                  Configure
                </button>
              </div>
              <button
                onClick={() => {
                  setShowMonitor(true);
                  setMonitorPreview([]);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
              >
                <Activity size={18} />
                Preview
              </button>

              {/* Hide Skip Button Toggle */}
              <div className="ml-auto">
                <label className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={editForm.hide_skip_button}
                    onChange={async (e) => {
                      const newValue = e.target.checked;

                      // Auto-save the setting if editing existing channel
                      if (channel && !isNewChannel) {
                        setSaving(true);
                        try {
                          // Update database
                          const { error: updateError } = await supabase
                            .from('audio_channels')
                            .update({ hide_skip_button: newValue })
                            .eq('id', channel.id);

                          if (updateError) throw updateError;

                          // Fetch fresh channel data to ensure UI sync
                          const { data: freshChannel, error: fetchError } = await supabase
                            .from('audio_channels')
                            .select('*')
                            .eq('id', channel.id)
                            .single();

                          if (fetchError) throw fetchError;

                          // Update local editForm with fresh data
                          if (freshChannel) {
                            setEditForm({
                              channel_name: freshChannel.channel_name || '',
                              description: freshChannel.description || '',
                              intensity: (freshChannel as any)?.intensity || 'medium',
                              about_channel: freshChannel.about_channel || '',
                              about_image_url: freshChannel.about_image_url || '',
                              about_external_link: freshChannel.about_external_link || '',
                              collection: freshChannel.collection || null,
                              hide_skip_button: freshChannel.hide_skip_button || false
                            });
                          }

                          // Notify parent to refresh
                          onUpdate();
                        } catch (error) {
                          console.error('Failed to update hide_skip_button:', error);
                          alert('Failed to save setting');
                          // Revert to previous value on error
                          setEditForm({ ...editForm, hide_skip_button: !newValue });
                        } finally {
                          setSaving(false);
                        }
                      } else {
                        // For new channels, just update local state
                        setEditForm({ ...editForm, hide_skip_button: newValue });
                      }
                    }}
                    className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-slate-700 whitespace-nowrap">Hide Skip Button</span>
                </label>
              </div>
            </div>
            {!showPlaylistConfig && strategyConfigs[activeTab].strategy !== 'slot_based' && (
              <div className="bg-slate-50 py-2.5 rounded-lg border border-slate-200 mt-3">
                <div className="flex items-center gap-3">
                  {playlistTracks.length > 0 && (
                    <>
                      <div className="flex items-center flex-shrink-0">
                        <div className="w-16 px-3"></div>
                        <div className="w-10 px-3">
                          <input
                            type="checkbox"
                            checked={selectedTracks.length === filteredPlaylistTracks.length && filteredPlaylistTracks.length > 0}
                            onChange={toggleSelectAll}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <span className="text-sm font-medium text-slate-700 px-3">
                          {selectedTracks.length > 0 ? `${selectedTracks.length} selected` : 'Select all'}
                        </span>
                      </div>
                      <div className="flex-1 max-w-md">
                        <SearchInput
                          onSearch={setPlaylistSearchQuery}
                          placeholder="Search tracks in playlist..."
                        />
                      </div>
                    </>
                  )}
                  {playlistTracks.length === 0 && (
                    <div className="flex-1 px-3">
                      <span className="text-sm text-slate-500 italic">No tracks in this playlist yet</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 flex-shrink-0 pr-3">
                    <button
                      onClick={() => {
                        hasClosedLibraryRef.current = false;
                        openedFromExternalWorkflowRef.current = false;
                        setShowLibrary(true);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Plus size={18} />
                      Add from Library
                    </button>
                    {selectedTracks.length > 0 && (
                      <button
                        onClick={handleBulkDelete}
                        disabled={bulkDeleting}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm"
                      >
                        <Trash2 size={18} />
                        Delete Selected ({selectedTracks.length})
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">

          {!isNewChannel && showPlaylistConfig && (
            <div className="mb-6 bg-white rounded-lg border-2 border-blue-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-slate-900">Playlist Strategy for {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Energy</h3>
                <button
                  onClick={() => setShowPlaylistConfig(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-2 mb-3">
                <div
                  onClick={() => setStrategyConfigs({ ...strategyConfigs, [activeTab]: { ...strategyConfigs[activeTab], strategy: 'track_id_order' } })}
                  className={`flex items-center gap-3 p-3 border rounded-lg transition-all cursor-pointer ${
                    strategyConfigs[activeTab].strategy === 'track_id_order'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">Track ID Order</div>
                    <div className="text-xs text-slate-600">Plays tracks in sequential order by track ID</div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingStrategy('track_id_order');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200"
                  >
                    <Edit2 size={14} />
                    <span>Edit</span>
                  </button>
                </div>

                <div
                  onClick={() => setStrategyConfigs({ ...strategyConfigs, [activeTab]: { ...strategyConfigs[activeTab], strategy: 'filename' } })}
                  className={`flex items-center gap-3 p-3 border rounded-lg transition-all cursor-pointer ${
                    strategyConfigs[activeTab].strategy === 'filename'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">Track Name Order</div>
                    <div className="text-xs text-slate-600">Plays tracks in alphabetical order by name</div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingStrategy('filename');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200"
                  >
                    <Edit2 size={14} />
                    <span>Edit</span>
                  </button>
                </div>

                <div
                  onClick={() => setStrategyConfigs({ ...strategyConfigs, [activeTab]: { ...strategyConfigs[activeTab], strategy: 'upload_date' } })}
                  className={`flex items-center gap-3 p-3 border rounded-lg transition-all cursor-pointer ${
                    strategyConfigs[activeTab].strategy === 'upload_date'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">Upload Date</div>
                    <div className="text-xs text-slate-600">Plays tracks ordered by upload date</div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingStrategy('upload_date');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200"
                  >
                    <Edit2 size={14} />
                    <span>Edit</span>
                  </button>
                </div>

                <div
                  className={`border rounded-lg transition-all ${
                    strategyConfigs[activeTab].strategy === 'random'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200'
                  }`}
                >
                  <div
                    onClick={() => setStrategyConfigs({ ...strategyConfigs, [activeTab]: { ...strategyConfigs[activeTab], strategy: 'random' } })}
                    className="flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-50"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-slate-900">Random Shuffle</div>
                      <div className="text-xs text-slate-600">Randomly shuffles all tracks in the channel</div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingStrategy('random');
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200"
                    >
                      <Edit2 size={14} />
                      <span>Edit</span>
                    </button>
                  </div>
                </div>

                <div
                  onClick={() => setStrategyConfigs({ ...strategyConfigs, [activeTab]: { ...strategyConfigs[activeTab], strategy: 'custom' } })}
                  className={`flex items-center gap-3 p-3 border rounded-lg transition-all cursor-pointer ${
                    strategyConfigs[activeTab].strategy === 'custom'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">Custom Order</div>
                    <div className="text-xs text-slate-600">Use manually defined track order</div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingStrategy('custom');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200"
                  >
                    <Edit2 size={14} />
                    <span>Edit</span>
                  </button>
                </div>

                <div
                  className={`border rounded-lg transition-all ${
                    strategyConfigs[activeTab].strategy === 'slot_based'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200'
                  }`}
                >
                  <div
                    onClick={() => setStrategyConfigs({ ...strategyConfigs, [activeTab]: { ...strategyConfigs[activeTab], strategy: 'slot_based' } })}
                    className="flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-50"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-slate-900">Slot Sequencer <span className="text-xs text-blue-600 font-semibold">(BETA)</span></div>
                      <div className="text-xs text-slate-600">Advanced metadata-driven sequencing with weighted field matching</div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (channel) {
                          window.location.href = `/admin/slot-strategy/${channel.id}/${activeTab}`;
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200"
                    >
                      <Settings size={14} />
                      <span>Configure</span>
                    </button>
                  </div>
                </div>
              </div>

            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" />
            </div>
          ) : isNewChannel ? (
            <div className="text-center py-12">
              <Music className="mx-auto text-slate-300 mb-4" size={48} />
              <p className="text-slate-600 mb-2">New channel ready to configure</p>
              <p className="text-sm text-slate-500">Save the channel information above to create this channel</p>
            </div>
          ) : showPlaylistConfig ? null : customOrderMode ? (
            <div>
              {customOrderedTracks.length > 0 ? (
                <>
                  <div className="mb-4 flex items-center justify-between bg-slate-50 px-4 py-2.5 rounded-lg border border-slate-200">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedTracks.length === customOrderedTracks.length && customOrderedTracks.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTracks(customOrderedTracks.map(t => String(t.track_id)));
                          } else {
                            setSelectedTracks([]);
                          }
                        }}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <span className="text-sm font-medium text-slate-700">
                        {selectedTracks.length > 0 ? `${selectedTracks.length} selected` : 'Select all'}
                      </span>
                    </label>
                    <div className="flex items-center gap-3">
                      {!customOrderSaved && (
                        <p className="text-sm text-blue-600">Drag and drop tracks to reorder</p>
                      )}
                      <button
                        onClick={customOrderSaved ? handleRemakeCustomOrder : handleSaveCustomOrder}
                        disabled={!customOrderSaved && saving}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap text-sm"
                      >
                        {customOrderSaved ? (
                          <>Edit Order</>
                        ) : (
                          <>
                            <Save size={16} />
                            {saving ? 'Saving...' : 'Save Custom Order'}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="overflow-y-auto max-h-[600px]">
                    <table className="w-full table-fixed">
                      <thead className="bg-slate-100 sticky top-0">
                        <tr>
                          {!customOrderSaved && (
                            <th className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-10"></th>
                          )}
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-16">#</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-12"></th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-12"></th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-24">Track ID</th>
                          <th className="px-2 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-32">Track Name</th>
                          <th className="px-2 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-28">Artist</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-32">Energy Level</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-28">File Size</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-24">Channels</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-24">Duration</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-20">BPM</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-24">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-200">
                        {customOrderedTracks.map((playlistTrack, index) => {
                          // For slot-based strategies, playlistTrack IS the full track object
                          const track = tracks[playlistTrack.track_id] || playlistTrack;
                          const trackId = String(playlistTrack.track_id);
                          const isSelected = selectedTracks.includes(trackId);
                          const playOrder = index + 1;

                          const formatFileSize = (bytes: number | string | undefined) => {
                            if (!bytes) return 'N/A';
                            const size = typeof bytes === 'string' ? parseFloat(bytes) : bytes;
                            if (size >= 1048576) return `${(size / 1048576).toFixed(2)} MB`;
                            if (size >= 1024) return `${(size / 1024).toFixed(2)} KB`;
                            return `${size} B`;
                          };

                          const formatDuration = (seconds: string | number | undefined) => {
                            if (!seconds) return 'N/A';
                            const secs = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
                            const minutes = Math.floor(secs / 60);
                            const remainingSeconds = Math.floor(secs % 60);
                            return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
                          };

                          const getChannelCount = (trackId: string) => {
                            return 'N/A';
                          };

                          return (
                            <tr
                              key={`${playlistTrack.track_id}-${index}`}
                              draggable={!customOrderSaved}
                              onDragStart={() => !customOrderSaved && handleDragStart(index)}
                              onDragOver={(e) => !customOrderSaved && handleDragOver(e, index)}
                              onDragEnd={handleDragEnd}
                              className={`transition-colors ${
                                isSelected ? 'bg-blue-50' :
                                customOrderSaved ? 'hover:bg-slate-50' :
                                `cursor-move ${draggedTrackIndex === index ? 'opacity-50' : 'hover:bg-slate-50'}`
                              }`}
                            >
                              {!customOrderSaved && (
                                <td className="px-3 py-2 w-10">
                                  <div className="flex flex-col items-center gap-0.5 text-slate-400">
                                    <ChevronUp size={12} />
                                    <ChevronDown size={12} />
                                  </div>
                                </td>
                              )}
                              <td className="px-3 py-2 w-16">
                                <span className="text-sm font-medium text-slate-500">#{playOrder}</span>
                              </td>
                              <td className="px-3 py-2 w-12">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleTrackSelection(trackId)}
                                  className="w-4 h-4 text-blue-600 rounded"
                                />
                              </td>
                              <td className="px-3 py-2 w-12">
                                <button
                                  onClick={() => track && handlePlayTrack(track)}
                                  disabled={!track}
                                  className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                    adminPreviewTrack?.id === track?.id && isPlaying
                                      ? 'text-green-600 bg-green-100 hover:bg-green-200'
                                      : 'text-blue-600 hover:bg-blue-100'
                                  }`}
                                >
                                  {adminPreviewTrack?.id === track?.id && isPlaying ? (
                                    <Pause size={16} />
                                  ) : (
                                    <Play size={16} />
                                  )}
                                </button>
                              </td>
                              <td className="px-3 py-2 text-sm text-slate-900 font-mono w-24">{track?.track_id || playlistTrack.track_id}</td>
                              <td className="px-2 py-2 text-sm text-slate-900 w-32">
                                <div className="overflow-x-auto whitespace-nowrap scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100">{track?.track_name || 'Unknown'}</div>
                              </td>
                              <td className="px-2 py-2 text-sm text-slate-600 w-28">
                                <div className="overflow-x-auto whitespace-nowrap scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100">{track?.artist_name || 'Unknown'}</div>
                              </td>
                              <td className="px-3 py-2 w-32">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  track?.energy_level === 'high' ? 'bg-red-100 text-red-800' :
                                  track?.energy_level === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                  track?.energy_level === 'low' ? 'bg-green-100 text-green-800' :
                                  'bg-slate-100 text-slate-800'
                                }`}>
                                  {track?.energy_level || 'N/A'}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-sm text-slate-600 w-28">{formatFileSize(track?.file_size)}</td>
                              <td className="px-3 py-2 text-sm text-slate-600 w-24">{getChannelCount(trackId)}</td>
                              <td className="px-3 py-2 text-sm text-slate-600 w-24">{formatDuration(track?.duration_seconds)}</td>
                              <td className="px-3 py-2 text-sm text-slate-600 w-20">{track?.tempo ? parseFloat(track.tempo as string).toFixed(0) : 'N/A'}</td>
                              <td className="px-3 py-2 w-24">
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => track && setEditingTrack(track)}
                                    disabled={!track}
                                    className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50"
                                    title="Edit track details"
                                  >
                                    <Edit2 size={16} />
                                  </button>
                                  <button
                                    onClick={() => handleRemoveTrack(activeTab, playlistTrack.track_id)}
                                    disabled={removingTrack === playlistTrack.track_id}
                                    className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
                                    title="Remove track"
                                  >
                                    {removingTrack === playlistTrack.track_id ? (
                                      <Loader2 size={16} className="animate-spin" />
                                    ) : (
                                      <Trash2 size={16} />
                                    )}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <Music className="mx-auto text-slate-300 mb-4" size={48} />
                  <p className="text-slate-600">No tracks in this energy level</p>
                </div>
              )}
            </div>
          ) : (
            <>
              {filteredPlaylistTracks.length > 0 ? (
                <div className="overflow-y-auto max-h-[600px]">
                  <table className="w-full table-fixed">
                    <thead className="bg-slate-100 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-16">#</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-12"></th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-12"></th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-24">Track ID</th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-32">Track Name</th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-28">Artist</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-32">Energy Level</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-28">File Size</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-24">Channels</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-24">Duration</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-20">BPM</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {filteredPlaylistTracks.map((playlistTrack, index) => {
                        // For slot-based strategies, playlistTrack IS the full track object
                        const track = tracks[playlistTrack.track_id] || playlistTrack;
                        const trackId = String(playlistTrack.track_id);
                        const isSelected = selectedTracks.includes(trackId);
                        const playOrder = index + 1;

                        const formatFileSize = (bytes: number | string | undefined) => {
                          if (!bytes) return 'N/A';
                          const size = typeof bytes === 'string' ? parseFloat(bytes) : bytes;
                          if (size >= 1048576) return `${(size / 1048576).toFixed(2)} MB`;
                          if (size >= 1024) return `${(size / 1024).toFixed(2)} KB`;
                          return `${size} B`;
                        };

                        const formatDuration = (seconds: string | number | undefined) => {
                          if (!seconds) return 'N/A';
                          const secs = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
                          const minutes = Math.floor(secs / 60);
                          const remainingSeconds = Math.floor(secs % 60);
                          return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
                        };

                        const getChannelCount = (trackId: string) => {
                          // This is a placeholder - you would need to pass channels data to calculate this
                          return 'N/A';
                        };

                        return (
                          <tr
                            key={`${playlistTrack.track_id}-${index}`}
                            className={`transition-colors ${
                              isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="px-3 py-2 w-16">
                              <span className="text-sm font-medium text-slate-500">#{playOrder}</span>
                            </td>
                            <td className="px-3 py-2 w-12">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleTrackSelection(trackId)}
                                className="w-4 h-4 text-blue-600 rounded"
                              />
                            </td>
                            <td className="px-3 py-2 w-12">
                              <button
                                onClick={() => track && handlePlayTrack(track)}
                                disabled={!track}
                                className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                  adminPreviewTrack?.id === track?.id && isPlaying
                                    ? 'text-green-600 bg-green-100 hover:bg-green-200'
                                    : 'text-blue-600 hover:bg-blue-100'
                                }`}
                              >
                                {adminPreviewTrack?.id === track?.id && isPlaying ? (
                                  <Pause size={16} />
                                ) : (
                                  <Play size={16} />
                                )}
                              </button>
                            </td>
                            <td className="px-3 py-2 text-sm text-slate-900 font-mono w-24">{track?.track_id || playlistTrack.track_id}</td>
                            <td className="px-2 py-2 text-sm text-slate-900 w-32">
                              <div className="overflow-x-auto whitespace-nowrap scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100">{track?.track_name || 'Unknown'}</div>
                            </td>
                            <td className="px-2 py-2 text-sm text-slate-600 w-28">
                              <div className="overflow-x-auto whitespace-nowrap scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100">{track?.artist_name || 'Unknown'}</div>
                            </td>
                            <td className="px-3 py-2 w-32">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                track?.energy_level === 'high' ? 'bg-red-100 text-red-800' :
                                track?.energy_level === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                track?.energy_level === 'low' ? 'bg-green-100 text-green-800' :
                                'bg-slate-100 text-slate-800'
                              }`}>
                                {track?.energy_level || 'N/A'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-sm text-slate-600 w-28">{formatFileSize(track?.file_size)}</td>
                            <td className="px-3 py-2 text-sm text-slate-600 w-24">{getChannelCount(trackId)}</td>
                            <td className="px-3 py-2 text-sm text-slate-600 w-24">{formatDuration(track?.duration_seconds)}</td>
                            <td className="px-3 py-2 text-sm text-slate-600 w-20">{track?.tempo ? parseFloat(track.tempo as string).toFixed(0) : 'N/A'}</td>
                            <td className="px-3 py-2 w-24">
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => track && setEditingTrack(track)}
                                  disabled={!track}
                                  className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50"
                                  title="Edit track details"
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  onClick={() => handleRemoveTrack(activeTab, playlistTrack.track_id)}
                                  disabled={removingTrack === playlistTrack.track_id}
                                  className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50"
                                  title="Remove track"
                                >
                                  {removingTrack === playlistTrack.track_id ? (
                                    <Loader2 size={16} className="animate-spin" />
                                  ) : (
                                    <Trash2 size={16} />
                                  )}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : playlistSearchQuery ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Music className="w-16 h-16 text-slate-300 mb-4" />
                  <p className="text-lg font-medium text-slate-600 mb-2">No tracks found</p>
                  <p className="text-sm text-slate-500">No tracks match "{playlistSearchQuery}"</p>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-600">
                  No tracks in this energy playlist
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showLibrary && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4 pb-24"
          onClick={() => setShowLibrary(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-5xl h-[calc(100vh-8rem)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-slate-900">Add Track from Library</h3>
                    <p className="text-sm text-slate-600 mt-1">Search library for tracks to add to this playlist</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedLibraryTracks.length > 0 && (
                      <button
                        onClick={() => checkDuplicatesAndPrepareAdd()}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                      >
                        <Plus size={18} />
                        Add {selectedLibraryTracks.length} Track{selectedLibraryTracks.length !== 1 ? 's' : ''}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setShowLibrary(false);
                        setSelectedLibraryTracks([]);
                      }}
                      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <X size={24} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-200">
                <div className="relative">
                  <SearchInput
                    onSearch={setSearchQuery}
                    placeholder={loadingLibrary ? "Loading library..." : "Search by name, artist, album, genre, energy level, or track ID..."}
                  />
                  {loadingLibrary && (
                    <div className="absolute inset-0 bg-white bg-opacity-70 rounded-lg pointer-events-none"></div>
                  )}
                </div>
                {!loadingLibrary && searchQuery && (
                  <p className="mt-2 text-sm text-slate-600">
                    Found {filteredLibraryTracks.length} track{filteredLibraryTracks.length !== 1 ? 's' : ''} matching "{searchQuery}"
                  </p>
                )}
              </div>
            </div>

            <div className="border-b border-slate-200 bg-white h-[60px]"></div>
            <div className="flex-1 overflow-y-auto">
              {loadingLibrary ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                  <p className="text-slate-600">Loading library tracks...</p>
                </div>
              ) : !searchQuery ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Music className="w-16 h-16 text-slate-300 mb-4" />
                  <p className="text-lg font-medium text-slate-600 mb-2">Search for tracks to add</p>
                  <p className="text-sm text-slate-500">Enter a track name, artist, album, genre, or track ID above</p>
                </div>
              ) : filteredLibraryTracks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Music className="w-16 h-16 text-slate-300 mb-4" />
                  <p className="text-lg font-medium text-slate-600 mb-2">No tracks found</p>
                  <p className="text-sm text-slate-500">Try a different search term</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-max">
                    <thead className="bg-slate-100 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-12">
                          <input
                            type="checkbox"
                            checked={selectedLibraryTracks.length === filteredLibraryTracks.length && filteredLibraryTracks.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedLibraryTracks(filteredLibraryTracks.map(t => t.id));
                              } else {
                                setSelectedLibraryTracks([]);
                              }
                            }}
                            className="w-4 h-4 text-blue-600 rounded"
                          />
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-12"></th>
                        <SortableHeader field="track_id" className="w-24">Track ID</SortableHeader>
                        <SortableHeader field="track_name" className="w-32">Track Name</SortableHeader>
                        <SortableHeader field="artist" className="w-28">Artist</SortableHeader>
                        <SortableHeader field="energy_level" className="w-32">Energy Level</SortableHeader>
                        <SortableHeader field="file_size" className="w-28">File Size</SortableHeader>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-24">Channels</th>
                        <SortableHeader field="duration" className="w-24">Duration</SortableHeader>
                        <SortableHeader field="bpm" className="w-20">BPM</SortableHeader>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {filteredLibraryTracks.map(track => {
                        const formatFileSize = (bytes: number | string | undefined) => {
                          if (!bytes) return 'N/A';
                          const size = typeof bytes === 'string' ? parseFloat(bytes) : bytes;
                          if (size >= 1048576) return `${(size / 1048576).toFixed(2)} MB`;
                          if (size >= 1024) return `${(size / 1024).toFixed(2)} KB`;
                          return `${size} B`;
                        };

                        const formatDuration = (seconds: string | number | undefined) => {
                          if (!seconds) return 'N/A';
                          const secs = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
                          const minutes = Math.floor(secs / 60);
                          const remainingSeconds = Math.floor(secs % 60);
                          return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
                        };

                        const isCurrentTrack = adminPreviewTrack?.id === track.id;
                        const isTrackPlaying = isCurrentTrack && isPlaying;
                        const isSelected = selectedLibraryTracks.includes(track.id);

                        return (
                          <tr
                            key={track.id}
                            className={`transition-colors ${
                              isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="px-3 py-2 w-12">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedLibraryTracks([...selectedLibraryTracks, track.id]);
                                  } else {
                                    setSelectedLibraryTracks(selectedLibraryTracks.filter(id => id !== track.id));
                                  }
                                }}
                                className="w-4 h-4 text-blue-600 rounded"
                              />
                            </td>
                            <td className="px-3 py-2 w-12">
                              <button
                                onClick={() => {
                                  if (isCurrentTrack) {
                                    toggleAdminPlayback();
                                  } else {
                                    setAdminPreview(track, true);
                                  }
                                }}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  isTrackPlaying
                                    ? 'text-green-600 bg-green-100 hover:bg-green-200'
                                    : 'text-blue-600 hover:bg-blue-100'
                                }`}
                              >
                                {isTrackPlaying ? <Pause size={16} /> : <Play size={16} />}
                              </button>
                            </td>
                            <td className="px-3 py-2 text-sm text-slate-900 font-mono w-24">
                              {track.track_id || 'N/A'}
                            </td>
                            <td className="px-2 py-2 text-sm text-slate-900 w-32">
                              <div className="overflow-x-auto whitespace-nowrap scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100">{track.track_name || 'Unknown'}</div>
                            </td>
                            <td className="px-2 py-2 text-sm text-slate-600 w-28">
                              <div className="overflow-x-auto whitespace-nowrap scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100">{track.artist_name || 'Unknown'}</div>
                            </td>
                            <td className="px-3 py-2 w-32">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                track.energy_level === 'high' ? 'bg-red-100 text-red-800' :
                                track.energy_level === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                track.energy_level === 'low' ? 'bg-green-100 text-green-800' :
                                'bg-slate-100 text-slate-800'
                              }`}>
                                {track.energy_level || 'N/A'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-sm text-slate-600 w-28">
                              {formatFileSize(track.file_size)}
                            </td>
                            <td className="px-3 py-2 text-sm text-slate-600 w-24">N/A</td>
                            <td className="px-3 py-2 text-sm text-slate-600 w-24">
                              {formatDuration(track.duration_seconds)}
                            </td>
                            <td className="px-3 py-2 text-sm text-slate-600 w-20">
                              {track.tempo ? parseFloat(track.tempo as string).toFixed(0) : 'N/A'}
                            </td>
                            <td className="px-3 py-2 w-24">
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => setEditingTrack(track)}
                                  className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                                  title="Edit track details"
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  onClick={() => addMultipleTracks([track.id])}
                                  className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                                  title="Add to channel"
                                >
                                  <Plus size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {addingTrack && trackParams && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4 pb-24">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Set Track Parameters</h3>
            <p className="text-sm text-slate-600 mb-4">
              Adding: <span className="font-semibold">{addingTrack.track_name}</span> by {addingTrack.artist_name}
            </p>

            <div className="space-y-4 mb-6">
              {Object.entries(trackParams).map(([key, value]) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {key}
                  </label>
                  <input
                    type={typeof value === 'number' ? 'number' : 'text'}
                    value={value}
                    onChange={(e) => setTrackParams({
                      ...trackParams,
                      [key]: typeof value === 'number' ? parseFloat(e.target.value) : e.target.value
                    })}
                    step={typeof value === 'number' ? 'any' : undefined}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setAddingTrack(null);
                  setTrackParams(null);
                }}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmAddTrack}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Add Track
              </button>
            </div>
          </div>
        </div>
      )}

      {updatingPlaylist && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] pb-24">
          <div className="bg-white rounded-lg shadow-xl p-8 max-w-md">
            <div className="flex flex-col items-center gap-4">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
              <div className="text-center">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Playlist Config Updating</h3>
                <p className="text-sm text-slate-600">Reordering tracks based on selected strategy...</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDuplicateDialog && duplicateCheck && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4 pb-24"
          onClick={() => {
            setShowDuplicateDialog(false);
            setDuplicateCheck(null);
          }}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-200 p-6">
              <h3 className="text-2xl font-bold text-slate-900">Duplicate Tracks Detected</h3>
              <p className="text-sm text-slate-600 mt-1">
                Some tracks are already in this playlist and will be skipped
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {duplicateCheck.duplicates.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <X size={20} className="text-red-600" />
                    <h4 className="text-lg font-semibold text-slate-900">
                      Already in Playlist ({duplicateCheck.duplicates.length})
                    </h4>
                  </div>
                  <div className="space-y-2">
                    {duplicateCheck.duplicates.map(track => (
                      <div
                        key={track.id}
                        className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg"
                      >
                        <Music size={18} className="text-red-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-900 truncate">
                            {track.track_name || 'Unknown Track'}
                          </div>
                          <div className="text-sm text-slate-600 truncate">
                            {track.artist_name || 'Unknown Artist'} • ID: {track.track_id}
                          </div>
                        </div>
                        <div className="text-xs font-medium text-red-600 bg-red-100 px-2 py-1 rounded">
                          DUPLICATE
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {duplicateCheck.newTracks.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Plus size={20} className="text-green-600" />
                    <h4 className="text-lg font-semibold text-slate-900">
                      Will Be Added ({duplicateCheck.newTracks.length})
                    </h4>
                  </div>
                  <div className="space-y-2">
                    {duplicateCheck.newTracks.map(track => (
                      <div
                        key={track.id}
                        className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg"
                      >
                        <Music size={18} className="text-green-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-900 truncate">
                            {track.track_name || 'Unknown Track'}
                          </div>
                          <div className="text-sm text-slate-600 truncate">
                            {track.artist_name || 'Unknown Artist'} • ID: {track.track_id}
                          </div>
                        </div>
                        <div className="text-xs font-medium text-green-600 bg-green-100 px-2 py-1 rounded">
                          NEW
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {duplicateCheck.newTracks.length === 0 && (
                <div className="text-center py-8">
                  <X size={48} className="text-slate-300 mx-auto mb-3" />
                  <p className="text-lg font-medium text-slate-900 mb-1">
                    All Selected Tracks Are Duplicates
                  </p>
                  <p className="text-sm text-slate-600">
                    All tracks you selected are already in this playlist
                  </p>
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 p-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDuplicateDialog(false);
                  setDuplicateCheck(null);
                }}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              {duplicateCheck.newTracks.length > 0 && (
                <button
                  onClick={() => {
                    addMultipleTracks(duplicateCheck.trackIdsToAdd);
                    setShowDuplicateDialog(false);
                    setDuplicateCheck(null);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Add {duplicateCheck.newTracks.length} Track{duplicateCheck.newTracks.length !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showDeleteDialog && channel && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70] p-4 pb-24"
          onClick={() => {
            setShowDeleteDialog(false);
            setDeleteConfirmText('');
          }}
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
                  Are you sure? This cannot be undone.
                </p>
                <p className="text-slate-900 font-semibold mb-4">
                  {channel.channel_name}
                </p>
                <p className="text-slate-600 text-sm mb-4">
                  Type the word <span className="font-mono font-bold text-red-600">DELETE</span> in the box below to proceed:
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
                onClick={() => {
                  setShowDeleteDialog(false);
                  setDeleteConfirmText('');
                }}
                disabled={deleting}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteChannel}
                disabled={deleteConfirmText !== 'DELETE' || deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting...' : 'Delete Channel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingStrategy && (
        <StrategyEditModal
          strategyType={editingStrategy}
          currentConfig={strategyConfigs[activeTab]}
          onClose={() => setEditingStrategy(null)}
          onSave={handleSaveStrategyConfig}
        />
      )}

      {editingTrack && (
        <TrackDetailModal
          track={editingTrack}
          channelAssignments={trackChannelAssignments}
          channels={allChannels}
          onClose={() => {
            setEditingTrack(null);
            setTrackChannelAssignments([]);
          }}
          onTrackDeleted={() => {
            setEditingTrack(null);
            setTrackChannelAssignments([]);
            loadTracks();
          }}
        />
      )}

      {showMonitor && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
          onClick={() => setShowMonitor(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                  <Activity size={24} className="text-emerald-600" />
                  Playlist Preview
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Preview playlist for <span className="font-semibold capitalize">{activeTab}</span> energy using {strategyConfigs[activeTab].strategy.replace(/_/g, ' ')} strategy
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label htmlFor="queue-count" className="text-sm text-slate-600 font-medium">
                    Show:
                  </label>
                  <input
                    id="queue-count"
                    type="number"
                    min="5"
                    max="100"
                    value={monitorTrackCount}
                    onChange={(e) => setMonitorTrackCount(Math.max(5, Math.min(100, parseInt(e.target.value) || 10)))}
                    className="w-20 px-2 py-1 border border-slate-300 rounded text-sm text-center"
                  />
                  <span className="text-sm text-slate-600">tracks</span>
                </div>
                <button
                  onClick={() => setShowMonitor(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={24} className="text-slate-400" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loadingPreview ? (
                <div className="text-center py-12">
                  <Loader2 size={48} className="mx-auto text-emerald-600 mb-4 animate-spin" />
                  <p className="text-slate-600">Loading playlist preview...</p>
                </div>
              ) : monitorPreview.length === 0 ? (
                <div className="text-center py-12">
                  <Activity size={48} className="mx-auto text-slate-300 mb-4" />
                  <p className="text-slate-600">No tracks in this playlist</p>
                </div>
              ) : (
                <div className="overflow-y-auto max-h-[600px]">
                  <table className="w-full table-fixed">
                    <thead className="bg-slate-100 sticky top-0">
                      <tr>
                        <th className="px-2 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-10"></th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-24">Track ID</th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-32">Track Name</th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-28">Artist</th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-32">Energy Level</th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-28">File Size</th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-24">Channels</th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-24">Duration</th>
                        <th className="px-2 py-2 text-left text-xs font-medium text-slate-700 uppercase tracking-wider w-20">BPM</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {monitorPreview.map((track, index) => {
                        const formatFileSize = (bytes: number | string | undefined) => {
                          if (!bytes) return 'N/A';
                          const size = typeof bytes === 'string' ? parseFloat(bytes) : bytes;
                          if (size >= 1048576) return `${(size / 1048576).toFixed(2)} MB`;
                          if (size >= 1024) return `${(size / 1024).toFixed(2)} KB`;
                          return `${size} B`;
                        };

                        const formatDuration = (seconds: string | number | undefined) => {
                          if (!seconds) return 'N/A';
                          const secs = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
                          const minutes = Math.floor(secs / 60);
                          const remainingSeconds = Math.floor(secs % 60);
                          return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
                        };

                        return (
                          <tr
                            key={`${track.id}-${index}`}
                            className="hover:bg-slate-50 transition-colors"
                          >
                            <td className="px-3 py-2">
                              <button
                                onClick={() => handlePlayTrack(track)}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  adminPreviewTrack?.id === track.id && isPlaying
                                    ? 'text-green-600 bg-green-100 hover:bg-green-200'
                                    : 'text-blue-600 hover:bg-blue-100'
                                }`}
                              >
                                {adminPreviewTrack?.id === track.id && isPlaying ? (
                                  <Pause size={16} />
                                ) : (
                                  <Play size={16} />
                                )}
                              </button>
                            </td>
                            <td className="px-2 py-2 text-sm text-slate-900 font-mono w-24">{track.track_id || 'N/A'}</td>
                            <td className="px-2 py-2 text-sm text-slate-900 w-32">
                              <div className="overflow-x-auto whitespace-nowrap scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100">{track.track_name || 'Unknown'}</div>
                            </td>
                            <td className="px-2 py-2 text-sm text-slate-600 w-28">
                              <div className="overflow-x-auto whitespace-nowrap scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100">{track.artist_name || channel?.channel_name || 'Unknown'}</div>
                            </td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                track.energy_level === 'high' ? 'bg-red-100 text-red-800' :
                                track.energy_level === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                track.energy_level === 'low' ? 'bg-green-100 text-green-800' :
                                'bg-slate-100 text-slate-800'
                              }`}>
                                {track.energy_level || 'N/A'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-sm text-slate-600">{formatFileSize(track.file_size)}</td>
                            <td className="px-3 py-2 text-sm text-slate-600">N/A</td>
                            <td className="px-3 py-2 text-sm text-slate-600">{formatDuration(track.duration_seconds)}</td>
                            <td className="px-3 py-2 text-sm text-slate-600">{track.tempo ? parseFloat(track.tempo as string).toFixed(0) : 'N/A'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-200 bg-slate-50">
              <button
                onClick={() => setShowMonitor(false)}
                className="w-full px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

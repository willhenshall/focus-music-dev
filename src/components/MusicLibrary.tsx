import { useState, useEffect, useRef, useCallback } from 'react';
import { Music2, ChevronLeft, ChevronRight, Radio, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Columns3, Filter, Download, Upload, Play, Pause, FileArchive, Database, Cloud } from 'lucide-react';
import { supabase, AudioTrack, AudioChannel } from '../lib/supabase';
import { TrackDetailModal } from './TrackDetailModal';
import { DeletedTracks } from './DeletedTracks';
import { useMusicPlayer } from '../contexts/MusicPlayerContext';
import { ColumnSelectorModal } from './ColumnSelectorModal';
import { AdvancedSearchModal, SearchFilter } from './AdvancedSearchModal';
import { TrackUploadModal } from './TrackUploadModal';
import { EnergyPlaylistModal } from './EnergyPlaylistModal';
import { useAuth } from '../contexts/AuthContext';
import { SearchInput } from './SearchInput';
import { DeleteConfirmationModal, DeletionStatus } from './DeleteConfirmationModal';
import { DownloadResultsModal } from './DownloadResultsModal';
import { CDNSyncProgressModal } from './CDNSyncProgressModal';
import { CDNSyncStatusBadge } from './CDNSyncStatusBadge';
import { useCDNSync } from '../hooks/useCDNSync';
import { getCDNStatusFromStorageLocations } from '../lib/cdnSyncService';
import JSZip from 'jszip';

type SortField = string;
type SortDirection = 'asc' | 'desc';

type ColumnDefinition = {
  key: string;
  label: string;
  category: 'core' | 'metadata';
  description?: string;
};

const AVAILABLE_COLUMNS: ColumnDefinition[] = [
  { key: 'track_id', label: 'Track ID', category: 'core', description: 'Unique identifier for the track' },
  { key: 'track_name', label: 'Track Name', category: 'core', description: 'Name of the track' },
  { key: 'artist_name', label: 'Artist', category: 'core', description: 'Artist or composer name' },
  { key: 'energy_level', label: 'Energy Level', category: 'core', description: 'Low, Medium, or High energy classification' },
  { key: 'energy_low', label: 'Low Energy', category: 'core', description: 'Track is tagged for low energy playlists' },
  { key: 'energy_medium', label: 'Medium Energy', category: 'core', description: 'Track is tagged for medium energy playlists' },
  { key: 'energy_high', label: 'High Energy', category: 'core', description: 'Track is tagged for high energy playlists' },
  { key: 'preview', label: 'Preview', category: 'core', description: 'Shows if track is marked as preview' },
  { key: 'cdn_status', label: 'CDN Status', category: 'core', description: 'Track synchronization status with CDN' },
  { key: 'file_size', label: 'File Size', category: 'core', description: 'Size of the audio file' },
  { key: 'channels', label: 'Channels', category: 'core', description: 'Number of playlists using this track' },
  { key: 'duration', label: 'Duration', category: 'metadata', description: 'Track length in seconds' },
  { key: 'bpm', label: 'BPM', category: 'metadata', description: 'Beats per minute' },
  { key: 'version', label: 'Version', category: 'metadata', description: 'Track version identifier (e.g., v3, P4, 02_01_P4)' },
  { key: 'album_name', label: 'Album', category: 'metadata', description: 'Album or collection name' },
  { key: 'genre_category', label: 'Genre', category: 'metadata', description: 'Music genre or category' },
  { key: 'mimetype', label: 'File Type', category: 'metadata', description: 'Audio file format' },
  { key: 'source', label: 'Source/Catalog', category: 'metadata', description: 'Source or catalog identifier' },
  { key: 'file_id', label: 'File ID', category: 'metadata', description: 'Internal file identifier' },
  { key: 'track_number', label: 'Track Number', category: 'metadata', description: 'Track number in album' },
];

const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  play_button: 48,
  checkbox: 48,
  track_id: 180,
  track_name: 250,
  artist_name: 200,
  energy_level: 120,
  energy_low: 110,
  energy_medium: 130,
  energy_high: 110,
  preview: 100,
  cdn_status: 120,
  file_size: 120,
  channels: 140,
  duration: 100,
  bpm: 80,
  version: 120,
  album_name: 200,
  genre_category: 150,
  mimetype: 120,
  source: 180,
  file_id: 180,
  track_number: 120,
};

export function MusicLibrary() {
  const { user } = useAuth();
  const { setAdminPreview, currentTrack, isPlaying, toggleAdminPlayback } = useMusicPlayer();
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [channels, setChannels] = useState<AudioChannel[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedTrack, setSelectedTrack] = useState<AudioTrack | null>(null);
  const [viewMode, setViewMode] = useState<'active' | 'deleted'>('active');
  const [selectedTracks, setSelectedTracks] = useState<string[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deletionStatus, setDeletionStatus] = useState<DeletionStatus | undefined>(undefined);
  const [sortField, setSortField] = useState<SortField>('track_id');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [visibleColumns, setVisibleColumns] = useState<string[]>(['track_id', 'track_name', 'artist_name', 'energy_level', 'file_size', 'channels']);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(DEFAULT_COLUMN_WIDTHS);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<SearchFilter[]>([]);
  const [showUnassignedOnly, setShowUnassignedOnly] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportingFull, setExportingFull] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number } | null>(null);
  const [showDownloadOptions, setShowDownloadOptions] = useState(false);
  const [downloadResults, setDownloadResults] = useState<{ successCount: number; errorCount: number; errors: string[] } | null>(null);
  const [exportingSidecars, setExportingSidecars] = useState(false);
  const [showSidecarButton, setShowSidecarButton] = useState(false);
  const [sidecarProgress, setSidecarProgress] = useState<{ current: number; total: number; currentFile: string } | null>(null);
  const resizingColumn = useRef<string | null>(null);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const [channelEditorState, setChannelEditorState] = useState<{ channelId: string; energyLevel: string; searchTrackId: string } | null>(null);
  const { isSyncing: cdnSyncing, progress: cdnSyncProgress, syncTracks: cdnSyncTracks } = useCDNSync();

  const [currentPage, setCurrentPage] = useState(1);
  const [totalTracks, setTotalTracks] = useState(0);
  const tracksPerPage = 50;
  const [trackAssignmentsCache, setTrackAssignmentsCache] = useState<Record<string, Array<{ channelName: string; channelId: string; energy: string }>>>({});
  const [loadingAssignments, setLoadingAssignments] = useState(false);

  useEffect(() => {
    loadUserPreferences();
  }, [user]);

  useEffect(() => {
    if (preferencesLoaded) {
      loadChannels();
      loadTracks();
    }
  }, [currentPage, searchQuery, sortField, sortDirection, advancedFilters, showUnassignedOnly, preferencesLoaded]);

  useEffect(() => {
    const handleClick = () => {
      setContextMenu(null);
      setShowDownloadOptions(false);
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const loadUserPreferences = async () => {
    if (!user) {
      setPreferencesLoaded(true);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('music_library_column_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const validColumnKeys = AVAILABLE_COLUMNS.map(col => col.key);
        const filteredColumns = (data.visible_columns || visibleColumns).filter((col: string) => validColumnKeys.includes(col));
        setVisibleColumns(filteredColumns);
        setColumnWidths({ ...DEFAULT_COLUMN_WIDTHS, ...(data.column_widths || {}) });
        setSortField(data.sort_field || 'track_id');
        setSortDirection(data.sort_direction as SortDirection || 'asc');
      }
    } catch (error) {
    } finally {
      setPreferencesLoaded(true);
    }
  };

  const saveUserPreferences = async () => {
    if (!user) return;

    try {
      const preferences = {
        user_id: user.id,
        visible_columns: visibleColumns,
        column_widths: columnWidths,
        sort_field: sortField,
        sort_direction: sortDirection,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('music_library_column_preferences')
        .upsert(preferences, { onConflict: 'user_id' });

      if (error) throw error;
    } catch (error) {
    }
  };

  const handleSaveColumnPreferences = (newVisibleColumns: string[]) => {
    setVisibleColumns(newVisibleColumns);
    setTimeout(async () => {
      if (!user) return;

      try {
        const preferences = {
          user_id: user.id,
          visible_columns: newVisibleColumns,
          column_widths: columnWidths,
          sort_field: sortField,
          sort_direction: sortDirection,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from('music_library_column_preferences')
          .upsert(preferences, { onConflict: 'user_id' });

        if (error) throw error;
      } catch (error) {
      }
    }, 100);
  };

  const loadChannels = async () => {
    const { data } = await supabase
      .from('audio_channels')
      .select('*')
      .order('channel_number');

    if (data) {
      setChannels(data);
    }
  };

  const loadTracks = async () => {
    setLoading(true);

    const hasAnalyticsFilters = advancedFilters.some(f =>
      ['total_plays', 'total_skips', 'plays_last_7_days', 'plays_last_30_days',
       'skips_last_7_days', 'skips_last_30_days', 'unique_listeners',
       'average_completion_rate', 'last_played_at'].includes(f.field)
    );

    if (hasAnalyticsFilters) {
      await loadTracksWithAnalytics();
    } else {
      // Check if search term matches any channel names
      let channelMatchedTrackIds: string[] | null = null;
      if (searchQuery) {
        const searchTerm = searchQuery.trim();
        const matchingChannels = channels.filter(ch =>
          ch.channel_name.toLowerCase().includes(searchTerm.toLowerCase())
        );

        if (matchingChannels.length > 0) {
          // Get all track IDs from matching channels
          const trackIdSet = new Set<string>();
          matchingChannels.forEach(channel => {
            ['low', 'medium', 'high'].forEach(energy => {
              const energyData = channel.playlist_data?.[energy];
              const tracks = energyData?.tracks || [];
              tracks.forEach((t: any) => {
                if (t.track_id) trackIdSet.add(t.track_id.toString());
              });
            });
          });
          channelMatchedTrackIds = Array.from(trackIdSet);
        }
      }

      let query = supabase
        .from('audio_tracks')
        .select('*', { count: 'exact' })
        .is('deleted_at', null);

      if (searchQuery) {
        const searchTerm = searchQuery.trim();

        // Build search across multiple fields including metadata JSONB
        const trackFieldSearch = `track_name.ilike.%${searchTerm}%,artist_name.ilike.%${searchTerm}%,track_id.ilike.%${searchTerm}%,genre.ilike.%${searchTerm}%,metadata->>track_name.ilike.%${searchTerm}%,metadata->>artist_name.ilike.%${searchTerm}%,metadata->>album_name.ilike.%${searchTerm}%`;

        // If we found matching channels, combine with OR logic
        if (channelMatchedTrackIds && channelMatchedTrackIds.length > 0) {
          query = query.or(`${trackFieldSearch},track_id.in.(${channelMatchedTrackIds.join(',')})`);
        } else {
          query = query.or(trackFieldSearch);
        }
      }

      if (advancedFilters.length > 0) {
        query = applyAdvancedFilters(query, advancedFilters);
      }

      if (showUnassignedOnly) {
        const { data: allData, error } = await query;

        if (allData && !error) {
          const unassignedTracks = allData.filter(track => {
            const trackId = track.track_id;
            if (!trackId) return true;

            return !channels.some(channel => {
              if (!channel.playlist_data) return false;
              return ['low', 'medium', 'high'].some(energy => {
                const energyData = channel.playlist_data[energy];
                return energyData?.tracks?.some((t: any) => t.track_id?.toString() === trackId);
              });
            });
          });

          const sortedData = sortTracks(unassignedTracks);
          const from = (currentPage - 1) * tracksPerPage;
          const to = from + tracksPerPage;
          const paginatedData = sortedData.slice(from, to);

          setTracks(paginatedData);
          setTotalTracks(unassignedTracks.length);

          // Compute channel assignments for the loaded tracks
          computeChannelAssignmentsForTracks(paginatedData);
        }
      } else {
        const from = (currentPage - 1) * tracksPerPage;
        const to = from + tracksPerPage - 1;

        const { data, count, error } = await query.range(from, to);

        if (data && !error) {
          const sortedData = sortTracks(data);
          setTracks(sortedData);
          setTotalTracks(count || 0);

          // Compute channel assignments for the loaded tracks
          computeChannelAssignmentsForTracks(sortedData);
        }
      }
    }

    setLoading(false);
  };

  const computeChannelAssignmentsForTracks = async (tracksToProcess: AudioTrack[]) => {
    setLoadingAssignments(true);

    try {
      // Extract track IDs for bulk query
      const trackIds = tracksToProcess
        .map(t => t.track_id)
        .filter((id): id is string => Boolean(id));

      if (trackIds.length === 0) {
        setTrackAssignmentsCache({});
        setLoadingAssignments(false);
        return;
      }

      // Single bulk query replaces 11,000+ sequential queries!
      const { data, error } = await supabase
        .rpc('get_bulk_track_assignments', { track_ids: trackIds });

      if (error) {
        console.error('Error fetching bulk track assignments:', error);
        setTrackAssignmentsCache({});
        setLoadingAssignments(false);
        return;
      }

      // Group results by track_id
      const newCache: Record<string, Array<{ channelName: string; channelId: string; energy: string }>> = {};

      if (data) {
        for (const row of data) {
          if (!newCache[row.track_id]) {
            newCache[row.track_id] = [];
          }
          newCache[row.track_id].push({
            channelName: row.channel_name,
            channelId: row.channel_id,
            energy: row.energy_level,
          });
        }
      }

      // Ensure all tracks have an entry (even if empty array)
      for (const trackId of trackIds) {
        if (!newCache[trackId]) {
          newCache[trackId] = [];
        }
      }

      setTrackAssignmentsCache(newCache);
    } catch (err) {
      console.error('Exception in computeChannelAssignmentsForTracks:', err);
      setTrackAssignmentsCache({});
    } finally {
      setLoadingAssignments(false);
    }
  };

  const loadTracksWithAnalytics = async () => {
    const analyticsFilters = advancedFilters.filter(f =>
      ['total_plays', 'total_skips', 'plays_last_7_days', 'plays_last_30_days',
       'skips_last_7_days', 'skips_last_30_days', 'unique_listeners',
       'average_completion_rate', 'last_played_at'].includes(f.field)
    );
    const nonAnalyticsFilters = advancedFilters.filter(f =>
      !['total_plays', 'total_skips', 'plays_last_7_days', 'plays_last_30_days',
        'skips_last_7_days', 'skips_last_30_days', 'unique_listeners',
        'average_completion_rate', 'last_played_at'].includes(f.field)
    );

    let analyticsQuery = supabase
      .from('track_analytics_summary')
      .select('track_id');

    analyticsFilters.forEach(filter => {
      switch (filter.operator) {
        case 'equals':
          analyticsQuery = analyticsQuery.eq(filter.field, filter.value);
          break;
        case 'not_equals':
          analyticsQuery = analyticsQuery.neq(filter.field, filter.value);
          break;
        case 'greater_than':
          analyticsQuery = analyticsQuery.gt(filter.field, filter.value);
          break;
        case 'less_than':
          analyticsQuery = analyticsQuery.lt(filter.field, filter.value);
          break;
        case 'between':
          if (filter.value2) {
            analyticsQuery = analyticsQuery.gte(filter.field, filter.value).lte(filter.field, filter.value2);
          }
          break;
        case 'is_null':
          analyticsQuery = analyticsQuery.is(filter.field, null);
          break;
        case 'is_not_null':
          analyticsQuery = analyticsQuery.not(filter.field, 'is', null);
          break;
      }
    });

    const { data: analyticsData, error: analyticsError } = await analyticsQuery;

    if (analyticsError || !analyticsData) {
      setTracks([]);
      setTotalTracks(0);
      return;
    }

    const trackIds = analyticsData.map(a => a.track_id);

    let tracksQuery = supabase
      .from('audio_tracks')
      .select('*', { count: 'exact' })
      .is('deleted_at', null)
      .in('track_id', trackIds);

    if (searchQuery) {
      const searchTerm = searchQuery.trim();

      // Check if search term matches any channel names
      const matchingChannels = channels.filter(ch =>
        ch.channel_name.toLowerCase().includes(searchTerm.toLowerCase())
      );

      // Build search across multiple fields including metadata JSONB
      const trackFieldSearch = `track_name.ilike.%${searchTerm}%,artist_name.ilike.%${searchTerm}%,track_id.ilike.%${searchTerm}%,genre.ilike.%${searchTerm}%,metadata->>track_name.ilike.%${searchTerm}%,metadata->>artist_name.ilike.%${searchTerm}%,metadata->>album_name.ilike.%${searchTerm}%`;

      if (matchingChannels.length > 0) {
        // Get all track IDs from matching channels
        const trackIdSet = new Set<string>();
        matchingChannels.forEach(channel => {
          ['low', 'medium', 'high'].forEach(energy => {
            const energyData = channel.playlist_data?.[energy];
            const tracks = energyData?.tracks || [];
            tracks.forEach((t: any) => {
              if (t.track_id) trackIdSet.add(t.track_id.toString());
            });
          });
        });
        const channelMatchedTrackIds = Array.from(trackIdSet);
        tracksQuery = tracksQuery.or(`${trackFieldSearch},track_id.in.(${channelMatchedTrackIds.join(',')})`);
      } else {
        tracksQuery = tracksQuery.or(trackFieldSearch);
      }
    }

    if (nonAnalyticsFilters.length > 0) {
      tracksQuery = applyAdvancedFilters(tracksQuery, nonAnalyticsFilters);
    }

    const { data: allData, error } = await tracksQuery;

    if (allData && !error) {
      let finalTracks = allData;

      if (showUnassignedOnly) {
        finalTracks = allData.filter(track => {
          const trackId = track.track_id;
          if (!trackId) return true;

          return !channels.some(channel => {
            if (!channel.playlist_data) return false;
            return ['low', 'medium', 'high'].some(energy => {
              const energyData = channel.playlist_data[energy];
              return energyData?.tracks?.some((t: any) => t.track_id?.toString() === trackId);
            });
          });
        });
      }

      const sortedData = sortTracks(finalTracks);
      const from = (currentPage - 1) * tracksPerPage;
      const to = from + tracksPerPage;
      const paginatedData = sortedData.slice(from, to);

      setTracks(paginatedData);
      setTotalTracks(finalTracks.length);

      // Compute channel assignments for the loaded tracks
      computeChannelAssignmentsForTracks(paginatedData);
    }
  };

  const applyAdvancedFilters = (query: any, filters: SearchFilter[]) => {
    filters.forEach(filter => {
      if (filter.field === 'global_search') {
        const searchValue = filter.value;
        if (filter.operator === 'contains') {
          query = query.or(`track_name.ilike.%${searchValue}%,artist_name.ilike.%${searchValue}%,metadata->>album_name.ilike.%${searchValue}%,genre.ilike.%${searchValue}%,metadata->>genre_category.ilike.%${searchValue}%,metadata->>source.ilike.%${searchValue}%,track_id.ilike.%${searchValue}%,metadata->>file_id.ilike.%${searchValue}%,catalog.ilike.%${searchValue}%`);
        } else if (filter.operator === 'not_contains') {
          query = query.not('track_name', 'ilike', `%${searchValue}%`)
            .not('artist_name', 'ilike', `%${searchValue}%`)
            .not('metadata->>album_name', 'ilike', `%${searchValue}%`)
            .not('genre', 'ilike', `%${searchValue}%`)
            .not('metadata->>genre_category', 'ilike', `%${searchValue}%`)
            .not('metadata->>source', 'ilike', `%${searchValue}%`)
            .not('track_id', 'ilike', `%${searchValue}%`)
            .not('metadata->>file_id', 'ilike', `%${searchValue}%`)
            .not('catalog', 'ilike', `%${searchValue}%`);
        }
        return;
      }

      const directColumns = [
        'track_id', 'channel_id', 'energy_level', 'created_at', 'updated_at', 'deleted_at',
        'track_name', 'artist_name', 'genre',
        'speed', 'intensity', 'brightness', 'complexity', 'valence', 'arousal',
        'tempo', 'music_key_value', 'catalog', 'duration', 'energy_set',
        'energy_low', 'energy_medium', 'energy_high', 'locked', 'is_preview',
        'track_user_genre_id', 'cdn_url', 'cdn_synced_at', 'cdn_sync_status'
      ];
      const isMetadataField = !directColumns.includes(filter.field);
      const fieldPath = isMetadataField ? `metadata->>${filter.field}` : filter.field;

      switch (filter.operator) {
        case 'equals':
          if (isMetadataField) {
            query = query.eq(fieldPath, filter.value);
          } else {
            query = query.eq(filter.field, filter.value);
          }
          break;
        case 'not_equals':
          if (isMetadataField) {
            query = query.neq(fieldPath, filter.value);
          } else {
            query = query.neq(filter.field, filter.value);
          }
          break;
        case 'contains':
          query = query.ilike(fieldPath, `%${filter.value}%`);
          break;
        case 'not_contains':
          query = query.not(fieldPath, 'ilike', `%${filter.value}%`);
          break;
        case 'starts_with':
          query = query.ilike(fieldPath, `${filter.value}%`);
          break;
        case 'ends_with':
          query = query.ilike(fieldPath, `%${filter.value}`);
          break;
        case 'greater_than':
          if (isMetadataField) {
            query = query.filter(fieldPath, 'gt', filter.value);
          } else {
            query = query.gt(filter.field, filter.value);
          }
          break;
        case 'less_than':
          if (isMetadataField) {
            query = query.filter(fieldPath, 'lt', filter.value);
          } else {
            query = query.lt(filter.field, filter.value);
          }
          break;
        case 'between':
          if (filter.value2) {
            if (isMetadataField) {
              query = query.filter(fieldPath, 'gte', filter.value).filter(fieldPath, 'lte', filter.value2);
            } else {
              query = query.gte(filter.field, filter.value).lte(filter.field, filter.value2);
            }
          }
          break;
        case 'is_null':
          query = query.is(fieldPath, null);
          break;
        case 'is_not_null':
          query = query.not(fieldPath, 'is', null);
          break;
      }
    });
    return query;
  };

  const sortTracks = (tracksToSort: AudioTrack[]) => {
    return [...tracksToSort].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      if (sortField === 'energy_level') {
        // Derive sort value from boolean fields (priority: high=3, medium=2, low=1)
        // For multi-energy tracks, use the highest energy level for sorting
        const getEnergyScore = (track: AudioTrack) => {
          if (track.energy_high) return 3;
          if (track.energy_medium) return 2;
          if (track.energy_low) return 1;
          return 0;
        };
        aValue = getEnergyScore(a);
        bValue = getEnergyScore(b);
      } else if (sortField === 'channels') {
        aValue = (trackAssignmentsCache[a.metadata?.track_id || ''] || []).length;
        bValue = (trackAssignmentsCache[b.metadata?.track_id || ''] || []).length;
      } else {
        aValue = a.metadata?.[sortField] || '';
        bValue = b.metadata?.[sortField] || '';
      }

      if (typeof aValue === 'string') {
        const comparison = aValue.localeCompare(bValue);
        return sortDirection === 'asc' ? comparison : -comparison;
      } else {
        const comparison = aValue - bValue;
        return sortDirection === 'asc' ? comparison : -comparison;
      }
    });
  };

  const handleSort = async (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    await saveUserPreferences();
  };

  const handleResizeStart = (e: React.MouseEvent, columnKey: string) => {
    e.preventDefault();
    resizingColumn.current = columnKey;
    startX.current = e.clientX;
    startWidth.current = columnWidths[columnKey as keyof typeof columnWidths];

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!resizingColumn.current) return;

    const diff = e.clientX - startX.current;
    const newWidth = Math.max(80, startWidth.current + diff);

    setColumnWidths(prev => ({
      ...prev,
      [resizingColumn.current!]: newWidth,
    }));
  };

  const handleResizeEnd = async () => {
    resizingColumn.current = null;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
    await saveUserPreferences();
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown size={14} className="text-slate-400" />;
    }
    return sortDirection === 'asc'
      ? <ArrowUp size={14} className="text-blue-600" />
      : <ArrowDown size={14} className="text-blue-600" />;
  };

  // DEPRECATED: Replaced by bulk query get_bulk_track_assignments() for 99.99% performance improvement
  // This function caused 11,000+ sequential queries per page load
  // Kept for reference only - no longer used
  const getChannelAssignments_DEPRECATED = async (trackId: string, track?: AudioTrack) => {
    const assignments: Array<{ channelName: string; channelId: string; energy: string }> = [];

    for (const channel of channels) {
      // Check traditional playlist_data
      if (channel.playlist_data) {
        for (const energy of ['low', 'medium', 'high']) {
          const energyData = channel.playlist_data[energy];
          if (energyData && energyData.tracks) {
            const found = energyData.tracks.some(
              (t: any) => t.track_id?.toString() === trackId
            );
            if (found) {
              assignments.push({
                channelName: channel.channel_name,
                channelId: channel.id,
                energy: energy,
              });
            }
          }
        }
      }

      // Check if any energy level uses Slot Sequencer
      for (const energy of ['low', 'medium', 'high']) {
        const strategyConfig = channel.playlist_strategy?.[energy];
        if (strategyConfig?.strategy === 'slot_based') {
          // Fetch the slot strategy for this channel/energy
          const { data: slotStrategy } = await supabase
            .from('slot_strategies')
            .select('id')
            .eq('channel_id', channel.id)
            .eq('energy_tier', energy)
            .maybeSingle();

          if (slotStrategy) {
            // Check if track matches the slot strategy filters
            const matchesFilters = await checkTrackMatchesSlotFilters(slotStrategy.id, trackId, track);
            if (matchesFilters) {
              // Avoid duplicate assignments
              const alreadyAdded = assignments.some(
                a => a.channelId === channel.id && a.energy === energy
              );
              if (!alreadyAdded) {
                assignments.push({
                  channelName: channel.channel_name,
                  channelId: channel.id,
                  energy: energy,
                });
              }
            }
          }
        }
      }
    }

    return assignments;
  };

  // DEPRECATED: Replaced by database function check_track_matches_slot_strategy()
  // Kept for reference only - no longer used
  const checkTrackMatchesSlotFilters_DEPRECATED = async (strategyId: string, trackId: string, track?: AudioTrack): Promise<boolean> => {
    // Get all rule groups for this strategy
    const { data: ruleGroups } = await supabase
      .from('slot_rule_groups')
      .select('id, logic')
      .eq('strategy_id', strategyId)
      .order('order', { ascending: true });

    if (!ruleGroups || ruleGroups.length === 0) {
      // No filters means all tracks match
      return true;
    }

    // Get the track data if not provided
    let trackData = track;
    if (!trackData) {
      const { data } = await supabase
        .from('audio_tracks')
        .select('*')
        .eq('track_id', trackId)
        .maybeSingle();
      trackData = data || undefined;
    }

    if (!trackData) return false;

    // Evaluate each rule group
    for (const group of ruleGroups) {
      const { data: rules } = await supabase
        .from('slot_rules')
        .select('*')
        .eq('group_id', group.id);

      if (!rules || rules.length === 0) continue;

      // Evaluate rules within the group based on group logic (AND/OR)
      const ruleResults = rules.map(rule => evaluateRule(rule, trackData!));

      const groupMatches = group.logic === 'AND'
        ? ruleResults.every(r => r)
        : ruleResults.some(r => r);

      // All rule groups must pass (implicit AND between groups)
      if (!groupMatches) {
        return false;
      }
    }

    return true;
  };

  const evaluateRule = (rule: any, track: AudioTrack): boolean => {
    const fieldValue = getTrackFieldValue(rule.field, track);
    const ruleValue = rule.value;

    switch (rule.operator) {
      case 'eq':
        return fieldValue === ruleValue;
      case 'neq':
        return fieldValue !== ruleValue;
      case 'in':
        return Array.isArray(ruleValue) && ruleValue.includes(fieldValue);
      case 'nin':
        return Array.isArray(ruleValue) && !ruleValue.includes(fieldValue);
      case 'gte':
        return Number(fieldValue) >= Number(ruleValue);
      case 'lte':
        return Number(fieldValue) <= Number(ruleValue);
      case 'between':
        if (Array.isArray(ruleValue) && ruleValue.length === 2) {
          const numValue = Number(fieldValue);
          return numValue >= Number(ruleValue[0]) && numValue <= Number(ruleValue[1]);
        }
        return false;
      case 'exists':
        return fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
      default:
        return false;
    }
  };

  const getTrackFieldValue = (field: string, track: AudioTrack): any => {
    // Handle PostgreSQL JSON operator syntax (e.g., "metadata->>'genre'")
    const jsonOperatorMatch = field.match(/^metadata->>'(.+)'$/);
    if (jsonOperatorMatch) {
      const metadataField = jsonOperatorMatch[1];
      return track.metadata?.[metadataField];
    }

    // Check top-level track properties first
    if (field in track && track[field as keyof AudioTrack] !== undefined) {
      return track[field as keyof AudioTrack];
    }

    // Then check metadata
    if (track.metadata && field in track.metadata) {
      return track.metadata[field];
    }

    return undefined;
  };

  const totalPages = Math.ceil(totalTracks / tracksPerPage);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setSelectedTracks([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const formatDuration = (seconds: string | number) => {
    const secs = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
    if (!secs || isNaN(secs)) return 'N/A';
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const getCellValue = (track: AudioTrack, columnKey: string) => {
    const assignments = trackAssignmentsCache[track.track_id || ''] || [];

    switch (columnKey) {
      case 'track_id':
        return (
          <span className="font-mono text-sm text-slate-900 truncate block">
            {track.track_id || track.id.substring(0, 8)}
          </span>
        );
      case 'track_name':
        return (
          <span className="font-medium text-slate-900 truncate block" title={track.track_name || 'Untitled'}>
            {track.track_name || 'Untitled'}
          </span>
        );
      case 'artist_name':
        return (
          <span className="truncate block" title={track.artist_name}>
            {track.artist_name || <><span className="font-bold">focus</span>.music</>}
          </span>
        );
      case 'energy_level': {
        // Derive energy display from boolean fields (single source of truth)
        const energyLevels: string[] = [];
        if (track.energy_low) energyLevels.push('low');
        if (track.energy_medium) energyLevels.push('medium');
        if (track.energy_high) energyLevels.push('high');
        
        if (energyLevels.length === 0) {
          return (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
              not defined
            </span>
          );
        }
        
        // For single energy level, show colored badge
        if (energyLevels.length === 1) {
          const level = energyLevels[0];
          return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              level === 'high'
                ? 'bg-red-100 text-red-800'
                : level === 'medium'
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-green-100 text-green-800'
            }`}>
              {level}
            </span>
          );
        }
        
        // For multiple energy levels, show stacked badges
        return (
          <div className="flex flex-wrap gap-1">
            {energyLevels.map(level => (
              <span key={level} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                level === 'high'
                  ? 'bg-red-100 text-red-800'
                  : level === 'medium'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-green-100 text-green-800'
              }`}>
                {level[0].toUpperCase()}
              </span>
            ))}
          </div>
        );
      }
      case 'energy_low':
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            track.energy_low ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-400'
          }`}>
            {track.energy_low ? 'Yes' : 'No'}
          </span>
        );
      case 'energy_medium':
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            track.energy_medium ? 'bg-yellow-100 text-yellow-800' : 'bg-slate-100 text-slate-400'
          }`}>
            {track.energy_medium ? 'Yes' : 'No'}
          </span>
        );
      case 'energy_high':
        return (
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            track.energy_high ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-400'
          }`}>
            {track.energy_high ? 'Yes' : 'No'}
          </span>
        );
      case 'preview':
        return track.is_preview ? (
          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
            Preview
          </span>
        ) : (
          <span className="text-sm text-slate-400">-</span>
        );
      case 'cdn_status':
        const cdnStatus = getCDNStatusFromStorageLocations(track.storage_locations);
        return (
          <CDNSyncStatusBadge
            status={cdnStatus}
            cdnUrl={track.cdn_url || undefined}
            lastSyncedAt={track.cdn_uploaded_at || undefined}
            showLabel={true}
          />
        );
      case 'file_size':
        const fileSize = track.metadata?.file_size_bytes || track.metadata?.file_size;
        return <span className="truncate block">{fileSize ? formatFileSize(Number(fileSize)) : 'N/A'}</span>;
      case 'channels':
        return assignments.length > 0 ? (
          <div className="flex items-center gap-1">
            <Radio size={14} className="text-blue-600 flex-shrink-0" />
            <span className="text-sm font-medium text-slate-900">{assignments.length}</span>
            <span className="text-xs text-slate-500">channel{assignments.length !== 1 ? 's' : ''}</span>
          </div>
        ) : (
          <span className="text-sm text-slate-400">None</span>
        );
      case 'duration':
        const durationValue = track.duration_seconds || track.metadata?.duration_seconds || track.metadata?.duration;
        return <span className="truncate block">{durationValue ? formatDuration(Number(durationValue)) : 'N/A'}</span>;
      case 'bpm':
        const bpmValue = track.tempo;
        const bpm = bpmValue ? parseFloat(String(bpmValue)).toFixed(0) : 'N/A';
        return <span className="truncate block">{bpm}</span>;
      case 'version':
        return (
          <span className="truncate block" title={track.metadata?.version}>
            {track.metadata?.version || '-'}
          </span>
        );
      case 'album_name':
        return (
          <span className="truncate block" title={track.metadata?.album_name}>
            {track.metadata?.album_name || 'N/A'}
          </span>
        );
      case 'genre_category':
        return (
          <span className="truncate block" title={track.genre}>
            {track.genre || 'N/A'}
          </span>
        );
      case 'mimetype':
        const mimetype = track.metadata?.mimetype ? (track.metadata.mimetype as string).split('/')[1]?.toUpperCase() : 'N/A';
        return <span className="truncate block">{mimetype}</span>;
      case 'source':
        return (
          <span className="truncate block" title={track.metadata?.source}>
            {track.metadata?.source || 'N/A'}
          </span>
        );
      case 'file_id':
        return (
          <span className="truncate block" title={track.metadata?.file_id}>
            {track.metadata?.file_id || 'N/A'}
          </span>
        );
      case 'track_number':
        return (
          <span className="truncate block" title={track.metadata?.track_number}>
            {track.metadata?.track_number || 'N/A'}
          </span>
        );
      default:
        return <span className="truncate block">{track.metadata?.[columnKey] || 'N/A'}</span>;
    }
  };

  const getColumnLabel = (columnKey: string) => {
    const column = AVAILABLE_COLUMNS.find(col => col.key === columnKey);
    return column?.label || columnKey;
  };

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
    setSelectedTracks([]);
  }, []);

  const toggleTrackSelection = (trackId: string) => {
    if (selectedTracks.includes(trackId)) {
      setSelectedTracks(selectedTracks.filter(id => id !== trackId));
    } else {
      setSelectedTracks([...selectedTracks, trackId]);
    }
  };

  const toggleSelectAll = () => {
    if (selectedTracks.length === tracks.length) {
      setSelectedTracks([]);
    } else {
      setSelectedTracks(tracks.map(t => t.id));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedTracks.length === 0) return;
    setShowDeleteModal(true);
  };

  const handleBulkCDNSync = async () => {
    if (selectedTracks.length === 0) {
      alert('Please select tracks to sync to CDN');
      return;
    }

    const selectedTrackIds = tracks
      .filter(t => selectedTracks.includes(t.id))
      .map(t => t.track_id)
      .filter((id): id is number => id !== null);

    if (selectedTrackIds.length === 0) {
      alert('No valid tracks selected for CDN sync');
      return;
    }

    try {
      await cdnSyncTracks(selectedTrackIds.map(String));
      alert(`Successfully synced ${selectedTrackIds.length} tracks to CDN!`);
      setSelectedTracks([]);
      await loadTracks();
    } catch (error: any) {
      alert(`CDN sync failed: ${error.message}`);
    }
  };

  const handleSoftDelete = async () => {
    setBulkDeleting(true);
    try {
      const { error } = await supabase
        .from('audio_tracks')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', selectedTracks);

      if (error) throw error;

      setSelectedTracks([]);
      setShowDeleteModal(false);
      loadTracks();
    } catch (error) {
      alert('Failed to delete tracks. Please try again.');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handlePermanentDelete = async () => {
    setBulkDeleting(true);

    setDeletionStatus({
      inProgress: true,
      completed: false,
      database: { status: 'pending' },
      supabaseStorage: { status: 'pending' },
      hlsStorage: { status: 'pending' },
      cdn: { status: 'pending' },
      playlists: { status: 'pending' },
      analytics: { status: 'pending' },
    });

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        throw new Error('Not authenticated');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/permanently-delete-tracks`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ trackIds: selectedTracks }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to permanently delete tracks');
      }

      const details = result.details;

      setDeletionStatus({
        inProgress: false,
        completed: true,
        database: {
          status: details.tracksDeleted > 0 ? 'success' : 'error',
          count: details.tracksDeleted
        },
        supabaseStorage: {
          status: details.filesDeleted > 0 ? 'success' : 'error',
          count: details.filesDeleted
        },
        hlsStorage: {
          status: 'success',
          count: details.hlsFilesDeleted || 0
        },
        cdn: {
          status: details.cdnDeletionFailed > 0 ? 'error' : 'success',
          count: details.cdnFilesDeleted,
          failed: details.cdnDeletionFailed,
          hlsCount: details.cdnHlsDeleted || 0
        },
        playlists: {
          status: 'success',
          count: details.channelReferencesRemoved,
          affected: details.playlistsAffected
        },
        analytics: {
          status: 'success',
          count: details.analyticsDeleted
        },
      });

      setSelectedTracks([]);
      loadTracks();
    } catch (error) {
      setDeletionStatus(prev => prev ? {
        ...prev,
        inProgress: false,
        completed: true,
        error: error instanceof Error ? error.message : 'Unknown error',
        database: { status: 'error' },
        supabaseStorage: { status: 'error' },
        hlsStorage: { status: 'error' },
        cdn: { status: 'error' },
        playlists: { status: 'error' },
        analytics: { status: 'error' },
      } : undefined);
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleExportCSV = async () => {
    if (exporting) return;

    setExporting(true);
    try {
      const hasAnalyticsFilters = advancedFilters.some(f =>
        ['total_plays', 'total_skips', 'plays_last_7_days', 'plays_last_30_days',
         'skips_last_7_days', 'skips_last_30_days', 'unique_listeners',
         'average_completion_rate', 'last_played_at'].includes(f.field)
      );

      let query = supabase
        .from('audio_tracks')
        .select('*')
        .is('deleted_at', null);

      if (searchQuery) {
        const searchTerms = searchQuery.trim().split(/\s+/).filter(term => term.length > 0);
        searchTerms.forEach(term => {
          query = query.or(`track_name.ilike.%${term}%,artist_name.ilike.%${term}%,track_id.ilike.%${term}%,genre.ilike.%${term}%,tempo.ilike.%${term}%,metadata->>album_name.ilike.%${term}%`);
        });
      }

      if (advancedFilters.length > 0) {
        const nonAnalyticsFilters = advancedFilters.filter(f =>
          !['total_plays', 'total_skips', 'plays_last_7_days', 'plays_last_30_days',
            'skips_last_7_days', 'skips_last_30_days', 'unique_listeners',
            'average_completion_rate', 'last_played_at'].includes(f.field)
        );
        query = applyAdvancedFilters(query, nonAnalyticsFilters);
      }

      if (hasAnalyticsFilters) {
        const analyticsFilters = advancedFilters.filter(f =>
          ['total_plays', 'total_skips', 'plays_last_7_days', 'plays_last_30_days',
           'skips_last_7_days', 'skips_last_30_days', 'unique_listeners',
           'average_completion_rate', 'last_played_at'].includes(f.field)
        );

        let analyticsQuery = supabase
          .from('track_analytics_summary')
          .select('track_id');

        analyticsFilters.forEach(filter => {
          switch (filter.operator) {
            case 'equals':
              analyticsQuery = analyticsQuery.eq(filter.field, filter.value);
              break;
            case 'not_equals':
              analyticsQuery = analyticsQuery.neq(filter.field, filter.value);
              break;
            case 'greater_than':
              analyticsQuery = analyticsQuery.gt(filter.field, filter.value);
              break;
            case 'less_than':
              analyticsQuery = analyticsQuery.lt(filter.field, filter.value);
              break;
            case 'between':
              if (filter.value2) {
                analyticsQuery = analyticsQuery.gte(filter.field, filter.value).lte(filter.field, filter.value2);
              }
              break;
          }
        });

        const { data: analyticsData, error: analyticsError } = await analyticsQuery;
        if (analyticsError) {
          alert('Failed to apply analytics filters. Please try again.');
          return;
        }
        if (analyticsData) {
          const trackIds = analyticsData.map(a => a.track_id);
          if (trackIds.length === 0) {
            alert('No tracks match the analytics filters.');
            return;
          }
          query = query.in('id', trackIds);
        }
      }

      const { data: allTracks, error } = await query;

      if (error) {
        alert(`Failed to fetch tracks: ${error.message || 'Unknown error'}`);
        return;
      }

      if (!allTracks || allTracks.length === 0) {
        alert('No tracks found to export.');
        return;
      }

      let tracksToExport = allTracks;

      // Apply unassigned filter if enabled
      if (showUnassignedOnly) {
        tracksToExport = allTracks.filter(track => {
          const trackId = track.track_id;
          if (!trackId) return true;

          return !channels.some(channel => {
            if (!channel.playlist_data) return false;
            return ['low', 'medium', 'high'].some(energy => {
              const energyData = channel.playlist_data[energy];
              return energyData?.tracks?.some((t: any) => t.track_id?.toString() === trackId);
            });
          });
        });
      }

      if (tracksToExport.length === 0) {
        alert('No tracks to export after applying filters.');
        return;
      }

      const sortedData = sortTracks(tracksToExport);

      const headers = visibleColumns.map(col => {
        const colDef = AVAILABLE_COLUMNS.find(c => c.key === col);
        return colDef?.label || col;
      });

      const escapeCSV = (value: any): string => {
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const rows = sortedData.map((track, index) => {
        try {
          return visibleColumns.map(col => {
            const metadata = track.metadata || {};
            switch (col) {
              case 'track_id':
                return escapeCSV(metadata.track_id || '');
              case 'track_name':
                return escapeCSV(metadata.track_name || '');
              case 'artist_name':
                return escapeCSV(metadata.artist_name || '');
              case 'album_name':
                return escapeCSV(metadata.album_name || '');
              case 'genre_category':
                return escapeCSV(metadata.genre_category || '');
              case 'energy_level': {
                // Derive from boolean fields for CSV export
                const levels: string[] = [];
                if (track.energy_low) levels.push('low');
                if (track.energy_medium) levels.push('medium');
                if (track.energy_high) levels.push('high');
                return escapeCSV(levels.join(', ') || '');
              }
              case 'energy_low':
                return escapeCSV(track.energy_low ? 'Yes' : 'No');
              case 'energy_medium':
                return escapeCSV(track.energy_medium ? 'Yes' : 'No');
              case 'energy_high':
                return escapeCSV(track.energy_high ? 'Yes' : 'No');
              case 'file_size':
                return escapeCSV(metadata.file_size || '');
              case 'channels':
                const channelNames = (track.channel_ids || [])
                  .map(id => channels.find(c => c.id === id)?.channel_name)
                  .filter(Boolean)
                  .join('; ');
                return escapeCSV(channelNames);
              case 'duration':
                return escapeCSV(metadata.duration || '');
              case 'bpm':
                return escapeCSV(metadata.bpm || '');
              case 'version':
                return escapeCSV(metadata.version || '');
              case 'tempo':
                return escapeCSV(metadata.tempo || '');
              case 'mimetype':
                return escapeCSV(metadata.mimetype || '');
              case 'source':
                return escapeCSV(metadata.source || '');
              case 'file_id':
                return escapeCSV(metadata.file_id || '');
              case 'track_number':
                return escapeCSV(metadata.track_number || '');
              default:
                return '';
            }
          }).join(',');
        } catch (rowError) {
          return visibleColumns.map(() => '').join(',');
        }
      });

      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const filename = `music-library-export-${timestamp}.csv`;

      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      alert('Failed to export CSV. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportFullData = async () => {
    if (exportingFull) return;

    setExportingFull(true);
    try {
      const hasAnalyticsFilters = advancedFilters.some(f =>
        ['total_plays', 'total_skips', 'plays_last_7_days', 'plays_last_30_days',
         'skips_last_7_days', 'skips_last_30_days', 'unique_listeners',
         'average_completion_rate', 'last_played_at'].includes(f.field)
      );

      let query = supabase
        .from('audio_tracks')
        .select('*');

      if (searchQuery) {
        const searchTerms = searchQuery.trim().split(/\s+/).filter(term => term.length > 0);
        searchTerms.forEach(term => {
          query = query.or(`track_name.ilike.%${term}%,artist_name.ilike.%${term}%,track_id.ilike.%${term}%,genre.ilike.%${term}%,tempo.ilike.%${term}%,metadata->>album_name.ilike.%${term}%`);
        });
      }

      if (advancedFilters.length > 0) {
        const nonAnalyticsFilters = advancedFilters.filter(f =>
          !['total_plays', 'total_skips', 'plays_last_7_days', 'plays_last_30_days',
            'skips_last_7_days', 'skips_last_30_days', 'unique_listeners',
            'average_completion_rate', 'last_played_at'].includes(f.field)
        );
        query = applyAdvancedFilters(query, nonAnalyticsFilters);
      }

      if (hasAnalyticsFilters) {
        const analyticsFilters = advancedFilters.filter(f =>
          ['total_plays', 'total_skips', 'plays_last_7_days', 'plays_last_30_days',
           'skips_last_7_days', 'skips_last_30_days', 'unique_listeners',
           'average_completion_rate', 'last_played_at'].includes(f.field)
        );

        let analyticsQuery = supabase
          .from('track_analytics_summary')
          .select('track_id');

        analyticsFilters.forEach(filter => {
          switch (filter.operator) {
            case 'equals':
              analyticsQuery = analyticsQuery.eq(filter.field, filter.value);
              break;
            case 'not_equals':
              analyticsQuery = analyticsQuery.neq(filter.field, filter.value);
              break;
            case 'greater_than':
              analyticsQuery = analyticsQuery.gt(filter.field, filter.value);
              break;
            case 'less_than':
              analyticsQuery = analyticsQuery.lt(filter.field, filter.value);
              break;
            case 'between':
              if (filter.value2) {
                analyticsQuery = analyticsQuery.gte(filter.field, filter.value).lte(filter.field, filter.value2);
              }
              break;
          }
        });

        const { data: analyticsData, error: analyticsError } = await analyticsQuery;
        if (analyticsError) {
          alert('Failed to apply analytics filters. Please try again.');
          return;
        }
        if (analyticsData) {
          const trackIds = analyticsData.map(a => a.track_id);
          if (trackIds.length === 0) {
            alert('No tracks match the analytics filters.');
            return;
          }
          query = query.in('id', trackIds);
        }
      }

      // Fetch all tracks in batches (Supabase has 1000 row limit by default)
      let allTracks: AudioTrack[] = [];
      let hasMore = true;
      let offset = 0;
      const batchSize = 1000;

      while (hasMore) {
        const { data: batch, error } = await query.range(offset, offset + batchSize - 1);

        if (error) {
          alert(`Failed to fetch tracks: ${error.message || 'Unknown error'}`);
          return;
        }

        if (!batch || batch.length === 0) {
          hasMore = false;
        } else {
          allTracks = [...allTracks, ...batch];
          offset += batchSize;
          hasMore = batch.length === batchSize;
        }
      }

      if (allTracks.length === 0) {
        alert('No tracks found to export.');
        return;
      }

      let tracksToExport = allTracks;

      if (showUnassignedOnly) {
        tracksToExport = allTracks.filter(track => {
          const trackId = track.track_id;
          if (!trackId) return true;

          return !channels.some(channel => {
            if (!channel.playlist_data) return false;
            return ['low', 'medium', 'high'].some(energy => {
              const energyData = channel.playlist_data[energy];
              return energyData?.tracks?.some((t: any) => t.track_id?.toString() === trackId);
            });
          });
        });
      }

      if (tracksToExport.length === 0) {
        alert('No tracks to export after applying filters.');
        return;
      }

      const sortedData = sortTracks(tracksToExport);

      // SQL escape function
      const escapeSQLString = (value: any): string => {
        if (value === null || value === undefined) {
          return 'NULL';
        }

        if (typeof value === 'boolean') {
          return value ? 'true' : 'false';
        }

        if (typeof value === 'number') {
          return String(value);
        }

        if (typeof value === 'object') {
          const jsonStr = JSON.stringify(value);
          return `'${jsonStr.replace(/'/g, "''")}'::jsonb`;
        }

        const str = String(value);
        return `'${str.replace(/'/g, "''")}'`;
      };

      // Get column names from first track
      const columns = sortedData.length > 0 ? Object.keys(sortedData[0]) : [];

      const deletedCount = sortedData.filter(t => t.deleted_at !== null).length;
      const activeCount = sortedData.length - deletedCount;

      // Generate SQL content
      let sqlContent = `-- Complete audio_tracks Export
-- Generated: ${new Date().toISOString()}
-- Total Tracks: ${sortedData.length} (Active: ${activeCount}, Deleted: ${deletedCount})
--
-- Import Instructions:
-- 1. Ensure audio_tracks table exists with matching schema
-- 2. Copy and paste this SQL into Supabase SQL Editor
-- 3. Execute the query
-- 4. Run the verification query at the end
--

BEGIN;

`;

      // Generate INSERT statements in batches of 100
      const insertBatchSize = 100;
      for (let i = 0; i < sortedData.length; i += insertBatchSize) {
        const batch = sortedData.slice(i, i + insertBatchSize);

        sqlContent += `\n-- Batch ${Math.floor(i / insertBatchSize) + 1} (Tracks ${i + 1} to ${Math.min(i + insertBatchSize, sortedData.length)})\n`;
        sqlContent += `INSERT INTO audio_tracks (${columns.join(', ')}) VALUES\n`;

        const valueRows = batch.map((track, batchIndex) => {
          const values = columns.map(col => escapeSQLString((track as any)[col]));
          const isLast = i + batchIndex === sortedData.length - 1;
          return `  (${values.join(', ')})${isLast ? ';' : ','}`;
        });

        sqlContent += valueRows.join('\n') + '\n';
      }

      sqlContent += `
COMMIT;

-- Verification Query
-- Run this after import to verify:
SELECT
  COUNT(*) as total_imported,
  COUNT(CASE WHEN deleted_at IS NULL THEN 1 END) as active,
  COUNT(CASE WHEN deleted_at IS NOT NULL THEN 1 END) as deleted
FROM audio_tracks;

-- Expected result:
-- total_imported: ${sortedData.length}
-- active: ${activeCount}
-- deleted: ${deletedCount}
`;

      // Create and download SQL file
      const blob = new Blob([sqlContent], { type: 'text/plain;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const filename = `audio-tracks-complete-${timestamp}.sql`;

      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      alert(`Successfully exported ${sortedData.length} tracks as SQL INSERT statements.\n\nActive: ${activeCount} | Deleted: ${deletedCount}\nColumns: ${columns.length}\n\nFile: ${filename}\n\nThis SQL export is the most reliable format for database migration.\nPaste into Supabase SQL Editor to import.`);
    } catch (error) {
      alert('Failed to export full data. Please try again.');
    } finally {
      setExportingFull(false);
    }
  };

  const handleDownloadFiles = async (downloadType: 'both' | 'audio' | 'metadata') => {
    if (downloading) return;

    setDownloading(true);
    setDownloadProgress({ current: 0, total: 0 });
    setShowDownloadOptions(false);

    try {
      const hasAnalyticsFilters = advancedFilters.some(f =>
        ['total_plays', 'total_skips', 'plays_last_7_days', 'plays_last_30_days',
         'skips_last_7_days', 'skips_last_30_days', 'unique_listeners',
         'average_completion_rate', 'last_played_at'].includes(f.field)
      );

      let tracksToDownload: AudioTrack[] = [];

      // If tracks are selected, use those. Otherwise, use filtered results
      if (selectedTracks.length > 0) {
        const { data, error } = await supabase
          .from('audio_tracks')
          .select('*')
          .in('id', selectedTracks);

        if (error) {
          alert(`Failed to fetch selected tracks: ${error.message}`);
          return;
        }

        tracksToDownload = data || [];
      } else {
        // Use the same query logic as CSV export
        let query = supabase
          .from('audio_tracks')
          .select('*')
          .is('deleted_at', null);

        if (searchQuery) {
          const searchTerms = searchQuery.trim().split(/\s+/).filter(term => term.length > 0);
          searchTerms.forEach(term => {
            query = query.or(`track_name.ilike.%${term}%,artist_name.ilike.%${term}%,track_id.ilike.%${term}%,genre.ilike.%${term}%,tempo.ilike.%${term}%,metadata->>album_name.ilike.%${term}%`);
          });
        }

        if (advancedFilters.length > 0) {
          const nonAnalyticsFilters = advancedFilters.filter(f =>
            !['total_plays', 'total_skips', 'plays_last_7_days', 'plays_last_30_days',
              'skips_last_7_days', 'skips_last_30_days', 'unique_listeners',
              'average_completion_rate', 'last_played_at'].includes(f.field)
          );
          query = applyAdvancedFilters(query, nonAnalyticsFilters);
        }

        if (hasAnalyticsFilters) {
          const analyticsFilters = advancedFilters.filter(f =>
            ['total_plays', 'total_skips', 'plays_last_7_days', 'plays_last_30_days',
             'skips_last_7_days', 'skips_last_30_days', 'unique_listeners',
             'average_completion_rate', 'last_played_at'].includes(f.field)
          );

          let analyticsQuery = supabase
            .from('track_analytics_summary')
            .select('track_id');

          analyticsFilters.forEach(filter => {
            switch (filter.operator) {
              case 'equals':
                analyticsQuery = analyticsQuery.eq(filter.field, filter.value);
                break;
              case 'not_equals':
                analyticsQuery = analyticsQuery.neq(filter.field, filter.value);
                break;
              case 'greater_than':
                analyticsQuery = analyticsQuery.gt(filter.field, filter.value);
                break;
              case 'less_than':
                analyticsQuery = analyticsQuery.lt(filter.field, filter.value);
                break;
              case 'between':
                if (filter.value2) {
                  analyticsQuery = analyticsQuery.gte(filter.field, filter.value).lte(filter.field, filter.value2);
                }
                break;
            }
          });

          const { data: analyticsData, error: analyticsError } = await analyticsQuery;
          if (analyticsError) {
            alert('Failed to apply analytics filters. Please try again.');
            return;
          }
          if (analyticsData) {
            const trackIds = analyticsData.map(a => a.track_id);
            if (trackIds.length === 0) {
              alert('No tracks match the analytics filters.');
              return;
            }
            query = query.in('id', trackIds);
          }
        }

        const { data: allTracks, error } = await query;

        if (error) {
          alert(`Failed to fetch tracks: ${error.message || 'Unknown error'}`);
          return;
        }

        tracksToDownload = allTracks || [];

        // Apply unassigned filter if enabled
        if (showUnassignedOnly) {
          tracksToDownload = tracksToDownload.filter(track => {
            const trackId = track.track_id;
            if (!trackId) return true;

            return !channels.some(channel => {
              if (!channel.playlist_data) return false;
              return ['low', 'medium', 'high'].some(energy => {
                const energyData = channel.playlist_data[energy];
                return energyData?.tracks?.some((t: any) => t.track_id?.toString() === trackId);
              });
            });
          });
        }
      }

      if (tracksToDownload.length === 0) {
        alert('No tracks to download.');
        return;
      }

      // Limit to prevent browser crashes
      const MAX_DOWNLOAD = 100;
      if (tracksToDownload.length > MAX_DOWNLOAD) {
        const proceed = confirm(
          `You are about to download ${tracksToDownload.length} files. This may take a while and could impact browser performance.\n\n` +
          `We recommend downloading ${MAX_DOWNLOAD} files at a time.\n\n` +
          `Do you want to proceed with all ${tracksToDownload.length} files?`
        );
        if (!proceed) {
          return;
        }
      }

      setDownloadProgress({ current: 0, total: tracksToDownload.length });

      const zip = new JSZip();
      const audioFolder = downloadType !== 'metadata' ? zip.folder('audio') : null;
      const metadataFolder = downloadType !== 'audio' ? zip.folder('metadata') : null;

      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (let i = 0; i < tracksToDownload.length; i++) {
        const track = tracksToDownload[i];
        setDownloadProgress({ current: i + 1, total: tracksToDownload.length });

        try {
          const trackId = track.track_id || track.id.substring(0, 8);
          const fileName = trackId;

          // Download audio file
          if (downloadType !== 'metadata' && audioFolder) {
            try {
              let audioBlob: Blob | null = null;
              let downloadMethod = 'none';

              // Try CDN first if available
              if (track.metadata?.cdn_audio_url) {
                try {
                  const response = await fetch(track.metadata.cdn_audio_url);
                  if (response.ok) {
                    audioBlob = await response.blob();
                    downloadMethod = 'cdn';
                  }
                } catch (e) {
                  // CDN failed, try storage
                }
              }

              // Try Supabase storage if CDN failed or not available
              if (!audioBlob && track.file_path) {
                try {
                  // Extract path from URL if file_path is a full URL
                  let storagePath = track.file_path;
                  if (storagePath.includes('storage/v1/object/public/audio-files/')) {
                    storagePath = storagePath.split('storage/v1/object/public/audio-files/')[1];
                  }
                  // Remove leading slash if present
                  if (storagePath.startsWith('/')) {
                    storagePath = storagePath.substring(1);
                  }

                  const { data, error } = await supabase.storage
                    .from('audio-files')
                    .download(storagePath);

                  if (!error && data) {
                    audioBlob = data;
                    downloadMethod = 'storage';
                  }
                } catch (storageError) {
                  // Storage failed
                }
              }

              if (audioBlob) {
                audioFolder.file(`${fileName}.mp3`, audioBlob);
              } else {
                const pathInfo = track.file_path ? `path: ${track.file_path}` : 'no path';
                const cdnInfo = track.metadata?.cdn_audio_url ? `cdn: ${track.metadata.cdn_audio_url}` : 'no cdn';
                errors.push(`${trackId}: Audio file not found (${pathInfo}, ${cdnInfo})`);
                errorCount++;
              }
            } catch (audioError) {
              errors.push(`${trackId}: Failed to download audio - ${audioError instanceof Error ? audioError.message : 'unknown error'}`);
              errorCount++;
            }
          }

          // Create JSON metadata file
          if (downloadType !== 'audio' && metadataFolder) {
            const metadata = {
              track_id: trackId,
              track_name: track.track_name || '',
              artist_name: track.artist_name || '',
              album_name: track.metadata?.album_name || '',
              genre: track.genre || '',
              tempo: track.tempo || '',
              speed: track.speed || '',
              intensity: track.intensity || '',
              arousal: track.arousal || '',
              valence: track.valence || '',
              brightness: track.brightness || '',
              complexity: track.complexity || '',
              music_key_value: track.music_key_value || '',
              // Derive energy_level from booleans for backwards compatibility
              energy_level: track.energy_high ? 'high' : track.energy_medium ? 'medium' : track.energy_low ? 'low' : '',
              energy_low: track.energy_low || false,
              energy_medium: track.energy_medium || false,
              energy_high: track.energy_high || false,
              duration_seconds: track.duration_seconds || '',
              version: track.metadata?.version || '',
              file_path: track.file_path || '',
              cdn_url: track.cdn_url || '',
              created_at: track.created_at || '',
              metadata: track.metadata || {},
            };

            const jsonString = JSON.stringify(metadata, null, 2);
            metadataFolder.file(`${fileName}.json`, jsonString);
          }

          successCount++;
        } catch (trackError) {
          errorCount++;
          const trackId = track.track_id || track.id.substring(0, 8);
          errors.push(`${trackId}: ${trackError instanceof Error ? trackError.message : 'Unknown error'}`);
        }
      }

      // Generate ZIP file
      const content = await zip.generateAsync({ type: 'blob' });

      // Download the ZIP
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const typeLabel = downloadType === 'both' ? 'audio-metadata' : downloadType;
      const filename = `music-library-${typeLabel}-${timestamp}.zip`;

      const link = document.createElement('a');
      const url = URL.createObjectURL(content);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Show results modal
      setDownloadResults({
        successCount,
        errorCount,
        errors
      });
    } catch (error) {
      setDownloadResults({
        successCount: 0,
        errorCount: 1,
        errors: [`Failed to download files: ${error instanceof Error ? error.message : 'Unknown error'}`]
      });
    } finally {
      setDownloading(false);
      setDownloadProgress(null);
    }
  };

  const handleExportAllSidecars = async () => {
    if (exportingSidecars) return;

    setExportingSidecars(true);
    setSidecarProgress({ current: 0, total: 0, currentFile: 'Scanning storage...' });

    try {
      // List all files in the audio-files bucket
      const { data: fileList, error: listError } = await supabase.storage
        .from('audio-files')
        .list('', {
          limit: 100000,
          sortBy: { column: 'name', order: 'asc' }
        });

      if (listError) throw listError;
      if (!fileList) throw new Error('No files found in storage');

      // Filter only .json files
      const jsonFiles = fileList.filter(file => file.name.endsWith('.json'));

      if (jsonFiles.length === 0) {
        alert('No JSON sidecar files found in storage');
        setSidecarProgress(null);
        return;
      }

      setSidecarProgress({ current: 0, total: jsonFiles.length, currentFile: 'Starting export...' });

      // Create a zip file
      const zip = new JSZip();
      let successCount = 0;
      let errorCount = 0;

      // Download and add each JSON file to the zip
      for (let i = 0; i < jsonFiles.length; i++) {
        const file = jsonFiles[i];
        setSidecarProgress({ current: i + 1, total: jsonFiles.length, currentFile: file.name });

        try {
          const { data: fileData, error: downloadError } = await supabase.storage
            .from('audio-files')
            .download(file.name);

          if (downloadError) {
            console.error(`Failed to download ${file.name}:`, downloadError);
            errorCount++;
            continue;
          }

          if (fileData) {
            zip.file(file.name, fileData);
            successCount++;
          }
        } catch (err) {
          console.error(`Error processing ${file.name}:`, err);
          errorCount++;
        }
      }

      // Generate the zip file with progress
      console.log(`Starting ZIP generation for ${successCount} files...`);
      setSidecarProgress({ current: jsonFiles.length, total: jsonFiles.length, currentFile: 'Generating ZIP file...' });

      const content = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      }, (metadata) => {
        // Update progress during ZIP generation
        const percent = metadata.percent.toFixed(0);
        setSidecarProgress({
          current: jsonFiles.length,
          total: jsonFiles.length,
          currentFile: `Generating ZIP file... ${percent}%`
        });
      });

      console.log(`ZIP generated successfully. Size: ${(content.size / 1024 / 1024).toFixed(2)} MB`);

      // Download the zip
      setSidecarProgress({ current: jsonFiles.length, total: jsonFiles.length, currentFile: 'Preparing download...' });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const filename = `audio-sidecars-${timestamp}.zip`;

      console.log(`Creating download link for ${filename}...`);
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);

      // Small delay to ensure the link is ready
      await new Promise(resolve => setTimeout(resolve, 100));

      console.log('Triggering download...');
      link.click();

      // Keep the link for a bit longer to ensure download starts
      await new Promise(resolve => setTimeout(resolve, 1000));

      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log('Download complete!');
      alert(`Successfully exported ${successCount} sidecar files${errorCount > 0 ? ` (${errorCount} errors)` : ''}!\n\nZIP file size: ${(content.size / 1024 / 1024).toFixed(2)} MB`);
    } catch (error) {
      console.error('Export error:', error);
      alert(`Failed to export sidecars: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setExportingSidecars(false);
      setSidecarProgress(null);
    }
  };

  if (loading && currentPage === 1) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" />
        <p className="text-slate-600 text-sm">Loading tracks...</p>
      </div>
    );
  }

  if (viewMode === 'deleted') {
    return (
      <div>
        <button
          onClick={() => setViewMode('active')}
          className="mb-4 text-blue-600 hover:text-blue-700 font-medium flex items-center gap-2"
        >
          ← Back to Music Library
        </button>
        <DeletedTracks />
      </div>
    );
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <div className="space-y-3" onContextMenu={handleContextMenu}>
      <div className="bg-white rounded-lg shadow-sm p-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <SearchInput
            onSearch={handleSearch}
            placeholder="Search by track name, artist, or track ID... (Press Enter to search)"
          />
          {showSidecarButton && (
            <button
              onClick={handleExportAllSidecars}
              disabled={exportingSidecars}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium whitespace-nowrap shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              title="Export all audio sidecar JSON files from storage"
            >
              {exportingSidecars ? (
                <>
                  <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Exporting...
                </>
              ) : (
                <>
                  <FileArchive size={18} />
                  Export Sidecars
                </>
              )}
            </button>
          )}
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium whitespace-nowrap shadow-sm"
          >
            <Upload size={18} />
            Upload Track
          </button>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-2xl font-bold text-slate-900">{totalTracks}</p>
              <p className="text-sm text-slate-600">total tracks</p>
            </div>
          </div>
        </div>
        {searchQuery && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">
              Found <span className="font-semibold text-slate-900">{totalTracks}</span> result{totalTracks !== 1 ? 's' : ''} for "{searchQuery}"
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setCurrentPage(1);
              }}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Clear search
            </button>
          </div>
        )}
        {showUnassignedOnly && (
          <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-orange-600" />
                <p className="text-sm text-orange-900">
                  Showing <span className="font-semibold">{totalTracks}</span> unassigned track{totalTracks !== 1 ? 's' : ''} (no channel assignment)
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleExportCSV}
                disabled={exporting}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exporting ? (
                  <>
                    <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Export CSV
                  </>
                )}
              </button>
              <button
                onClick={handleExportFullData}
                disabled={exportingFull}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                title="Export as SQL INSERT statements - Most reliable format for database migration (includes ALL columns and deleted tracks)"
              >
                {exportingFull ? (
                  <>
                    <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Database size={16} />
                    Export as SQL
                  </>
                )}
              </button>
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDownloadOptions(!showDownloadOptions);
                  }}
                  disabled={downloading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {downloading ? (
                    <>
                      <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      {downloadProgress ? `${downloadProgress.current}/${downloadProgress.total}` : 'Downloading...'}
                    </>
                  ) : (
                    <>
                      <FileArchive size={16} />
                      Download Files
                    </>
                  )}
                </button>
                {showDownloadOptions && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleDownloadFiles('both')}
                      className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                    >
                      <FileArchive size={16} />
                      MP3 + JSON (Both)
                    </button>
                    <button
                      onClick={() => handleDownloadFiles('audio')}
                      className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                    >
                      <Download size={16} />
                      MP3 Only
                    </button>
                    <button
                      onClick={() => handleDownloadFiles('metadata')}
                      className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                    >
                      <Download size={16} />
                      JSON Only
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setShowUnassignedOnly(false);
                  setCurrentPage(1);
                }}
                className="text-sm text-orange-600 hover:text-orange-700 font-medium"
              >
                Clear Filter
              </button>
            </div>
          </div>
        )}
        {advancedFilters.length > 0 && (
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-blue-600" />
                <p className="text-sm text-blue-900">
                  <span className="font-semibold">{advancedFilters.length}</span> advanced filter{advancedFilters.length !== 1 ? 's' : ''} active
                </p>
              </div>
              <div className="h-4 w-px bg-blue-300" />
              <p className="text-sm text-blue-900">
                <span className="font-semibold">{totalTracks}</span> track{totalTracks !== 1 ? 's' : ''} returned
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleExportCSV}
                disabled={exporting}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exporting ? (
                  <>
                    <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Export CSV
                  </>
                )}
              </button>
              <button
                onClick={handleExportFullData}
                disabled={exportingFull}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                title="Export as SQL INSERT statements - Most reliable format for database migration (includes ALL columns and deleted tracks)"
              >
                {exportingFull ? (
                  <>
                    <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Database size={16} />
                    Export as SQL
                  </>
                )}
              </button>
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDownloadOptions(!showDownloadOptions);
                  }}
                  disabled={downloading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {downloading ? (
                    <>
                      <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      {downloadProgress ? `${downloadProgress.current}/${downloadProgress.total}` : 'Downloading...'}
                    </>
                  ) : (
                    <>
                      <FileArchive size={16} />
                      Download Files
                    </>
                  )}
                </button>
                {showDownloadOptions && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleDownloadFiles('both')}
                      className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                    >
                      <FileArchive size={16} />
                      MP3 + JSON (Both)
                    </button>
                    <button
                      onClick={() => handleDownloadFiles('audio')}
                      className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                    >
                      <Download size={16} />
                      MP3 Only
                    </button>
                    <button
                      onClick={() => handleDownloadFiles('metadata')}
                      className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                    >
                      <Download size={16} />
                      JSON Only
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowAdvancedSearch(true)}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Edit Filters
              </button>
              <button
                onClick={() => {
                  setAdvancedFilters([]);
                  setCurrentPage(1);
                }}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Clear Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedTracks.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">
              {selectedTracks.length} selected
            </span>
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDownloadOptions(!showDownloadOptions);
                  }}
                  disabled={downloading}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm"
                >
                  {downloading ? (
                    <>
                      <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      {downloadProgress ? `${downloadProgress.current}/${downloadProgress.total}` : 'Downloading...'}
                    </>
                  ) : (
                    <>
                      <FileArchive size={18} />
                      Download Selected
                    </>
                  )}
                </button>
                {showDownloadOptions && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleDownloadFiles('both')}
                      className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                    >
                      <FileArchive size={16} />
                      MP3 + JSON (Both)
                    </button>
                    <button
                      onClick={() => handleDownloadFiles('audio')}
                      className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                    >
                      <Download size={16} />
                      MP3 Only
                    </button>
                    <button
                      onClick={() => handleDownloadFiles('metadata')}
                      className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                    >
                      <Download size={16} />
                      JSON Only
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={handleBulkCDNSync}
                disabled={cdnSyncing || selectedTracks.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm"
                title="Sync selected tracks to CDN"
              >
                <Cloud size={18} />
                {cdnSyncing ? 'Syncing...' : `Sync to CDN (${selectedTracks.length})`}
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm"
              >
                <Trash2 size={18} />
                {bulkDeleting ? 'Deleting...' : `Delete Selected (${selectedTracks.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {cdnSyncing && cdnSyncProgress && (
        <CDNSyncProgressModal
          progress={cdnSyncProgress}
          isComplete={!cdnSyncing}
          onClose={() => {}}
        />
      )}

      <div className="bg-white rounded-lg shadow-sm overflow-x-auto relative">
        {loading && currentPage > 1 && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 gap-3">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" />
            <p className="text-slate-600 text-sm">Loading page {currentPage}...</p>
          </div>
        )}
        <table className="w-full" style={{ tableLayout: 'fixed' }}>
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th style={{ width: `${columnWidths.play_button}px` }} className="px-2 py-3 relative">
                {/* Play button column */}
              </th>
              <th style={{ width: `${columnWidths.checkbox}px` }} className="px-4 py-3 relative">
                <input
                  type="checkbox"
                  checked={selectedTracks.length === tracks.length && tracks.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  title="Select all on this page"
                />
              </th>
              {visibleColumns.map(columnKey => (
                <th
                  key={columnKey}
                  style={{ width: `${columnWidths[columnKey] || 150}px` }}
                  className="px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors relative group"
                  onClick={() => handleSort(columnKey)}
                >
                  <div className="flex items-center gap-2">
                    <span>{getColumnLabel(columnKey)}</span>
                    {getSortIcon(columnKey)}
                  </div>
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 group-hover:bg-blue-300"
                    onMouseDown={(e) => handleResizeStart(e, columnKey)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {tracks.map((track) => {
              const isSelected = selectedTracks.includes(track.id);
              const isThisTrackPlaying = currentTrack?.id === track.id && isPlaying;

              const handlePlayPause = (e: React.MouseEvent) => {
                e.stopPropagation();
                if (currentTrack?.id === track.id) {
                  toggleAdminPlayback();
                } else {
                  setAdminPreview(track, true);
                }
              };

              return (
                <tr
                  key={track.id}
                  className={`transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                >
                  <td className="px-2 py-4">
                    <button
                      onClick={handlePlayPause}
                      className="p-1.5 rounded-full hover:bg-blue-100 text-blue-600 transition-colors"
                      title={isThisTrackPlaying ? 'Pause' : 'Play'}
                    >
                      {isThisTrackPlaying ? (
                        <Pause size={16} fill="currentColor" />
                      ) : (
                        <Play size={16} fill="currentColor" />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleTrackSelection(track.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                  {visibleColumns.map(columnKey => (
                    <td
                      key={columnKey}
                      className="px-6 py-4 cursor-pointer overflow-hidden"
                      onClick={() => {
                        setSelectedTrack(track);
                        setAdminPreview(track);
                      }}
                    >
                      {getCellValue(track, columnKey)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>

        {tracks.length === 0 && !loading && (
          <div className="text-center py-12">
            <Music2 className="mx-auto text-slate-300 mb-4" size={48} />
            <p className="text-slate-600">No tracks found</p>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white rounded-lg shadow-sm px-6 py-4">
          <div className="text-sm text-slate-600">
            Showing {((currentPage - 1) * tracksPerPage) + 1} to {Math.min(currentPage * tracksPerPage, totalTracks)} of {totalTracks} tracks
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={20} />
            </button>

            <div className="flex items-center gap-1">
              {[...Array(Math.min(5, totalPages))].map((_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      currentPage === pageNum
                        ? 'bg-blue-600 text-white'
                        : 'hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      )}

      {selectedTrack && (
        <TrackDetailModal
          track={selectedTrack}
          channelAssignments={trackAssignmentsCache[selectedTrack.metadata?.track_id || ''] || []}
          channels={channels}
          loadingAssignments={loadingAssignments}
          onClose={() => {
            setSelectedTrack(null);
            setAdminPreview(null);
          }}
          onTrackDeleted={() => {
            loadTracks();
          }}
          onOpenChannelEditor={(channelId, energyLevel, trackId) => {
            setChannelEditorState({ channelId, energyLevel, searchTrackId: trackId });
            setSelectedTrack(null);
            setAdminPreview(null);
          }}
        />
      )}

      {showColumnSelector && (
        <ColumnSelectorModal
          availableColumns={AVAILABLE_COLUMNS}
          visibleColumns={visibleColumns}
          onSave={handleSaveColumnPreferences}
          onClose={() => setShowColumnSelector(false)}
        />
      )}

      {showAdvancedSearch && (
        <AdvancedSearchModal
          onClose={() => setShowAdvancedSearch(false)}
          onSearch={(filters) => {
            setAdvancedFilters(filters);
            setSearchQuery('');
            setCurrentPage(1);
            setShowAdvancedSearch(false);
          }}
          initialFilters={advancedFilters}
        />
      )}

      {showUploadModal && (
        <TrackUploadModal
          onClose={() => setShowUploadModal(false)}
          onSuccess={() => {
            loadTracks();
            loadChannels();
          }}
          channels={channels}
        />
      )}

      {channelEditorState && (
        <EnergyPlaylistModal
          key={channelEditorState.channelId || 'new-channel'}
          channel={channelEditorState.channelId ? channels.find(c => c.id === channelEditorState.channelId) : undefined}
          onClose={() => setChannelEditorState(null)}
          onUpdate={() => {
            loadChannels();
            loadTracks();
          }}
          onClearSearch={() => {
            setChannelEditorState(prev => prev ? { ...prev, searchTrackId: undefined } : null);
          }}
          initialEnergyLevel={channelEditorState.energyLevel as 'low' | 'medium' | 'high'}
          initialSearchQuery={channelEditorState.searchTrackId}
          initialShowLibrary={!!channelEditorState.searchTrackId}
        />
      )}

      {contextMenu && (
        <div
          className="fixed bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              setShowAdvancedSearch(true);
              setContextMenu(null);
            }}
            className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
          >
            <Filter size={16} />
            Advanced Search
          </button>
          <button
            onClick={() => {
              setShowUnassignedOnly(!showUnassignedOnly);
              setCurrentPage(1);
              setContextMenu(null);
            }}
            className={`w-full px-4 py-2 text-left text-sm hover:bg-slate-100 flex items-center gap-2 ${
              showUnassignedOnly ? 'text-orange-600 font-medium' : 'text-slate-700'
            }`}
          >
            <Filter size={16} />
            {showUnassignedOnly ? 'Show All Tracks' : 'Show Unassigned Only'}
          </button>
          <button
            onClick={() => {
              setShowColumnSelector(true);
              setContextMenu(null);
            }}
            className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
          >
            <Columns3 size={16} />
            Columns
          </button>
          <button
            onClick={() => {
              setViewMode('deleted');
              setContextMenu(null);
            }}
            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
          >
            <Trash2 size={16} />
            Deleted Tracks
          </button>
          <button
            onClick={() => {
              setShowSidecarButton(!showSidecarButton);
              setContextMenu(null);
            }}
            className={`w-full px-4 py-2 text-left text-sm hover:bg-slate-100 flex items-center gap-2 ${
              showSidecarButton ? 'text-blue-600 font-medium' : 'text-slate-700'
            }`}
          >
            <FileArchive size={16} />
            {showSidecarButton ? 'Hide Sidecar Export' : 'Show Sidecar Export'}
          </button>
        </div>
      )}

      {showDeleteModal && (
        <DeleteConfirmationModal
          trackCount={selectedTracks.length}
          onSoftDelete={handleSoftDelete}
          onPermanentDelete={handlePermanentDelete}
          onCancel={() => {
            setShowDeleteModal(false);
            setDeletionStatus(undefined);
          }}
          isDeleting={bulkDeleting}
          deletionStatus={deletionStatus}
        />
      )}

      {downloadResults && (
        <DownloadResultsModal
          successCount={downloadResults.successCount}
          errorCount={downloadResults.errorCount}
          errors={downloadResults.errors}
          onClose={() => setDownloadResults(null)}
        />
      )}

      {sidecarProgress && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Exporting Sidecar Files</h3>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm text-slate-600 mb-2">
                  <span>Progress</span>
                  <span className="font-medium">
                    {sidecarProgress.current} / {sidecarProgress.total}
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2.5">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                    style={{
                      width: sidecarProgress.total > 0
                        ? `${(sidecarProgress.current / sidecarProgress.total) * 100}%`
                        : '0%'
                    }}
                  />
                </div>
                <div className="mt-2 text-xs text-slate-500 truncate">
                  {sidecarProgress.currentFile}
                </div>
              </div>

              <div className="text-xs text-slate-500 text-center">
                Please wait, this may take a few minutes...
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

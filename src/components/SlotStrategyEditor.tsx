import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Download, Upload, Save, Plus, Trash2, ArrowLeft, Zap, X, Play, Settings, FolderOpen, Copy, Pause, ChevronDown, ChevronUp, CreditCard as Edit2, Database } from 'lucide-react';
import { SlotPreviewModal } from './SlotPreviewModal';
import { SequencePreviewModal } from './SequencePreviewModal';
import { useMusicPlayer } from '../contexts/MusicPlayerContext';

type EnergyTier = 'low' | 'medium' | 'high';
type SlotField = 'speed' | 'intensity' | 'brightness' | 'complexity' | 'valence' | 'arousal' | 'bpm' | 'key' | 'proximity';
type RuleOperator = 'eq' | 'neq' | 'in' | 'nin' | 'gte' | 'lte' | 'between' | 'exists';

interface SlotTargets {
  speed?: number;
  intensity?: number;
  brightness?: number;
  complexity?: number;
  valence?: number;
  arousal?: number;
  bpm?: number;
  key?: string;
  proximity?: number;
}

interface SlotBoost {
  field: SlotField;
  mode: 'near' | 'exact';
  weight: number;
}

interface SlotDefinition {
  index: number;
  targets: SlotTargets;
  boosts: SlotBoost[];
}

interface SlotRule {
  field: string;
  operator: RuleOperator;
  value: any;
}

interface SlotRuleGroup {
  logic: 'AND' | 'OR';
  order: number;
  rules: SlotRule[];
}

interface SlotStrategyEditorProps {
  channelId: string;
  energyTier: EnergyTier;
  onSave?: () => void;
}

const FIELD_LABELS: Record<SlotField, string> = {
  speed: 'Speed',
  intensity: 'Intensity',
  brightness: 'Brightness',
  complexity: 'Complexity',
  valence: 'Valence',
  arousal: 'Arousal',
  bpm: 'BPM',
  key: 'Key',
  proximity: 'Proximity',
};

const FIELD_ORDER: SlotField[] = ['speed', 'intensity', 'brightness', 'complexity', 'valence', 'arousal', 'bpm', 'key', 'proximity'];

const FIELD_RANGES: Record<SlotField, { min: number; max: number; step: number }> = {
  speed: { min: 0, max: 5, step: 0.1 },
  intensity: { min: 0, max: 5, step: 0.1 },
  brightness: { min: 0, max: 5, step: 0.1 },
  complexity: { min: 0, max: 5, step: 0.1 },
  valence: { min: -1, max: 1, step: 0.05 },
  arousal: { min: 0, max: 1, step: 0.05 },
  bpm: { min: 60, max: 180, step: 1 },
  key: { min: 0, max: 11, step: 1 },
  proximity: { min: 0, max: 5, step: 0.1 },
};

const DEFAULT_BOOSTS: SlotBoost[] = [
  { field: 'speed', mode: 'near', weight: 2 },
  { field: 'intensity', mode: 'near', weight: 4 },
  { field: 'brightness', mode: 'near', weight: 1 },
  { field: 'complexity', mode: 'near', weight: 1 },
  { field: 'valence', mode: 'near', weight: 1 },
  { field: 'arousal', mode: 'near', weight: 1 },
  { field: 'bpm', mode: 'near', weight: 1 },
];

const DEFAULT_RULE_GROUP: SlotRuleGroup = {
  logic: 'AND',
  order: 0,
  rules: [
    {
      field: 'channel_id',
      operator: 'eq',
      value: '',
    },
  ],
};

// All columns from audio_tracks table (excluding JSON/BLOB types)
const METADATA_FIELDS = [
  { value: 'arousal', label: 'Arousal', type: 'text' },
  { value: 'artist_name', label: 'Artist Name', type: 'text' },
  { value: 'brightness', label: 'Brightness', type: 'text' },
  { value: 'catalog', label: 'Catalog', type: 'text' },
  { value: 'channel_id', label: 'Channel ID', type: 'text' },
  { value: 'complexity', label: 'Complexity', type: 'text' },
  { value: 'created_at', label: 'Created At', type: 'datetime' },
  { value: 'duration_seconds', label: 'Duration (seconds)', type: 'number' },
  { value: 'energy_high', label: 'Energy High', type: 'boolean' },
  { value: 'energy_level', label: 'Energy Level', type: 'text' },
  { value: 'energy_low', label: 'Energy Low', type: 'boolean' },
  { value: 'energy_medium', label: 'Energy Medium', type: 'boolean' },
  { value: 'genre', label: 'Genre', type: 'text' },
  { value: 'intensity', label: 'Intensity', type: 'text' },
  { value: 'is_preview', label: 'Is Preview', type: 'boolean' },
  { value: 'locked', label: 'Locked', type: 'boolean' },
  { value: 'music_key_value', label: 'Music Key Value', type: 'text' },
  { value: 'skip_rate', label: 'Skip Rate', type: 'number' },
  { value: 'speed', label: 'Speed', type: 'text' },
  { value: 'tempo', label: 'Tempo (BPM)', type: 'number' },
  { value: 'track_id', label: 'Track ID', type: 'text' },
  { value: 'track_name', label: 'Track Name', type: 'text' },
  { value: 'track_user_genre_id', label: 'Genre ID', type: 'number' },
  { value: 'valence', label: 'Valence', type: 'text' },
];

export function SlotStrategyEditor({ channelId, energyTier, onSave }: SlotStrategyEditorProps) {
  const { setAdminPreview, toggleAdminPlayback, currentTrack, isPlaying } = useMusicPlayer();
  const [channel, setChannel] = useState<any>(null);
  const [numSlots, setNumSlots] = useState(20);
  const [recentRepeatWindow, setRecentRepeatWindow] = useState(5);
  const [definitions, setDefinitions] = useState<SlotDefinition[]>([]);
  const [ruleGroups, setRuleGroups] = useState<SlotRuleGroup[]>([DEFAULT_RULE_GROUP]);
  const [currentTier, setCurrentTier] = useState<EnergyTier>(energyTier || 'medium');
  const [expandedSlotBoosts, setExpandedSlotBoosts] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedSlots, setSelectedSlots] = useState<Set<number>>(new Set());
  const [slotPreviewModal, setSlotPreviewModal] = useState<number | null>(null);
  const [sequencePreviewModal, setSequencePreviewModal] = useState(false);
  const [previewTrackCount, setPreviewTrackCount] = useState(20);
  const [showPlaybackModal, setShowPlaybackModal] = useState(false);
  const [playbackContinuation, setPlaybackContinuation] = useState<'restart_login' | 'restart_session' | 'continue'>('continue');
  const [availableTracks, setAvailableTracks] = useState<any[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [tracksLoaded, setTracksLoaded] = useState(false);
  const [trackPoolCount, setTrackPoolCount] = useState<number | null>(null);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [savedSequences, setSavedSequences] = useState<any[]>([]);
  const [loadingSequences, setLoadingSequences] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(true);
  const [saveSequenceName, setSaveSequenceName] = useState('');
  const [saveSequenceDescription, setSaveSequenceDescription] = useState('');
  const [loadedSequenceName, setLoadedSequenceName] = useState<string | null>(null);
  const [fieldOptions, setFieldOptions] = useState<Record<string, string[]>>({});
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateSequence, setDuplicateSequence] = useState<any>(null);
  const [duplicateName, setDuplicateName] = useState('');
  const [showSequenceMenu, setShowSequenceMenu] = useState(false);
  const [loadedSequenceId, setLoadedSequenceId] = useState<string | null>(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [newSequenceName, setNewSequenceName] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [initialState, setInitialState] = useState<string>('');
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<{ type: 'back' | 'tier', tier?: EnergyTier } | null>(null);

  useEffect(() => {
    loadData();
    loadFieldOptions();
    // Reset tracks when tier or channel changes
    setTracksLoaded(false);
    setAvailableTracks([]);
    setTrackPoolCount(null);
  }, [channelId, currentTier]);

  async function loadData() {
    if (!channelId) return;

    setLoading(true);
    try {

      const { data: channelData } = await supabase
        .from('audio_channels')
        .select('*')
        .eq('id', channelId)
        .single();

      setChannel(channelData);

      // Load playback continuation setting from channel strategy
      const tierStrategy = channelData?.playlist_strategy?.[currentTier];
      if (tierStrategy?.playbackContinuation) {
        setPlaybackContinuation(tierStrategy.playbackContinuation);
      }

      // Get the user's session token for authenticated request
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/slot-strategy-get`;

      const response = await fetch(
        `${apiUrl}?channelId=${channelId}&energyTier=${currentTier}`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        const data = await response.json();

        if (data.strategy) {
          setNumSlots(data.strategy.num_slots);
          setRecentRepeatWindow(data.strategy.recent_repeat_window);

          // Load the saved sequence name if this strategy came from a saved sequence
          if (data.strategy.saved_sequence_name) {
            setLoadedSequenceName(data.strategy.saved_sequence_name);
          } else {
            setLoadedSequenceName(null);
          }

          // Track the saved sequence ID for re-saving
          if (data.strategy.saved_sequence_id) {
            setLoadedSequenceId(data.strategy.saved_sequence_id);
          } else {
            setLoadedSequenceId(null);
          }

          const defsWithBoosts = data.definitions.map((d: any) => {
            const slotBoosts = data.boosts.filter((b: any) =>
              b.slot_definition_id === d.id
            );
            return {
              index: d.index,
              targets: d.targets,
              boosts: slotBoosts.length > 0 ? slotBoosts : DEFAULT_BOOSTS,
            };
          });

          setDefinitions(defsWithBoosts);

          if (data.ruleGroups && data.ruleGroups.length > 0) {
            // Properly format rule groups with nested rules
            // The edge function returns: rules:slot_rules(*) which creates a 'rules' property
            const formattedRuleGroups = data.ruleGroups.map((g: any) => {
              const rules = g.rules || [];
              return {
                id: g.id,
                strategyId: g.strategy_id,
                logic: g.logic,
                order: g.order,
                rules: rules.map((r: any) => ({
                  id: r.id,
                  groupId: r.group_id,
                  field: r.field,
                  operator: r.operator,
                  value: r.value
                }))
              };
            });
            setRuleGroups(formattedRuleGroups);
          } else {
            const defaultRuleGroup = {
              logic: 'AND' as 'AND' | 'OR',
              order: 0,
              rules: [
                {
                  field: 'channel_id',
                  operator: 'eq' as RuleOperator,
                  value: channelId,
                },
              ],
            };
            setRuleGroups([defaultRuleGroup]);
          }
        } else {
          initializeDefaults();
        }
      } else {
        initializeDefaults();
      }
    } catch (error) {
      initializeDefaults();
    } finally {
      setLoading(false);
    }
  }

  async function loadFieldOptions() {
    try {
      const options: Record<string, string[]> = {};

      // Define text/categorical fields to fetch distinct values for
      const textFields = [
        'artist_name',
        'catalog',
        'energy_level',
        'genre',
        'track_name',
        'music_key_value'
      ];

      // Fetch distinct values for each text field using RPC for efficiency
      // This avoids the 1000 record limit issue by using DISTINCT in the database
      const promises = textFields.map(async (field) => {
        try {
          // Use the RPC function to get all distinct values efficiently
          const { data, error } = await supabase
            .rpc('get_distinct_column_values', { column_name: field });

          if (error) {
            // Fallback to manual query if RPC fails (e.g., function not deployed yet)
            console.warn(`RPC failed for ${field}, using fallback:`, error.message);
            const { data: fallbackData } = await supabase
              .from('audio_tracks')
              .select(field)
              .is('deleted_at', null)
              .not(field, 'is', null)
              .limit(5000); // Increased limit for fallback

            if (fallbackData && fallbackData.length > 0) {
              const values = [...new Set(fallbackData.map((t: any) => t[field]))]
                .filter(v => v && v !== '')
                .map(v => String(v))
                .sort();
              if (values.length > 0) {
                return { field, values };
              }
            }
          } else if (data && Array.isArray(data) && data.length > 0) {
            // RPC returns an array of distinct values directly
            return { field, values: data };
          }
        } catch (err) {
          console.error(`Error fetching distinct values for ${field}:`, err);
        }
        return null;
      });

      // Wait for all queries to complete in parallel
      const results = await Promise.all(promises);

      // Populate options from results
      results.forEach((result) => {
        if (result && result.values.length > 0) {
          options[result.field] = result.values;
        }
      });

      setFieldOptions(options);
    } catch (error) {
      console.error('Error loading field options:', error);
    }
  }

  async function loadFieldOptionsFallback() {
    try {
      const options: Record<string, string[]> = {};

      // Load ALL tracks (no limit) - fetch metadata column and extract in JS
      const { data: tracks } = await supabase
        .from('audio_tracks')
        .select('metadata, catalog, energy_level, genre, artist_name')
        .is('deleted_at', null);

      if (tracks) {
        const metadataFields = [
          { key: "genre", metadataKey: 'genre', isTopLevel: true },
          { key: "artist_name", metadataKey: 'artist_name', isTopLevel: true },
          { key: "metadata->>'album_name'", metadataKey: 'album_name', isTopLevel: false },
          { key: "metadata->>'source'", metadataKey: 'source', isTopLevel: false },
        ];

        // Extract unique values from metadata fields
        metadataFields.forEach(field => {
          const uniqueValues = new Set<string>();
          tracks.forEach(track => {
            const value = field.isTopLevel
              ? (track as any)[field.metadataKey]
              : track.metadata?.[field.metadataKey];
            if (value && value !== '') {
              uniqueValues.add(String(value));
            }
          });
          if (uniqueValues.size > 0) {
            options[field.key] = Array.from(uniqueValues).sort();
          }
        });

        // Extract direct column values
        const catalogValues = new Set<string>();
        const energyValues = new Set<string>();
        tracks.forEach(track => {
          if (track.catalog) catalogValues.add(track.catalog);
          if (track.energy_level) energyValues.add(track.energy_level);
        });

        if (catalogValues.size > 0) options['catalog'] = Array.from(catalogValues).sort();
        if (energyValues.size > 0) options['energy_level'] = Array.from(energyValues).sort();
      }

      setFieldOptions(options);
    } catch (error) {
      console.error('Error in fallback field options loader:', error);
    }
  }

  // Capture initial state after data loads
  useEffect(() => {
    if (!loading) {
      const currentState = JSON.stringify({
        numSlots,
        recentRepeatWindow,
        definitions,
        ruleGroups,
        playbackContinuation,
      });
      setInitialState(currentState);
      setHasUnsavedChanges(false);
    }
  }, [loading]);

  // Track changes to any editable state
  useEffect(() => {
    if (initialState && !loading) {
      const currentState = JSON.stringify({
        numSlots,
        recentRepeatWindow,
        definitions,
        ruleGroups,
        playbackContinuation,
      });
      setHasUnsavedChanges(currentState !== initialState);
    }
  }, [numSlots, recentRepeatWindow, definitions, ruleGroups, playbackContinuation, initialState, loading]);

  // Warn before leaving page with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  function initializeDefaults() {
    const defaultDefs: SlotDefinition[] = [];
    for (let i = 1; i <= numSlots; i++) {
      defaultDefs.push({
        index: i,
        targets: {
          speed: 3,
          intensity: 3,
          brightness: 4,
          complexity: 3,
          valence: 0,
          arousal: 0.1,
          bpm: 86,
        },
        boosts: [...DEFAULT_BOOSTS],
      });
    }
    setDefinitions(defaultDefs);
    // Also set default rule group with channel_id matching current channel
    const defaultRuleGroup = {
      ...DEFAULT_RULE_GROUP,
      rules: [
        {
          field: 'channel_id',
          operator: 'eq' as RuleOperator,
          value: channelId,
        },
      ],
    };
    setRuleGroups([defaultRuleGroup]);
  }

  async function loadTracks() {
    setTracksLoading(true);
    try {
      // CRITICAL: Load ALL tracks from ENTIRE LIBRARY
      // Slot sequencer is NOT limited to any channel or admin-selected tracks
      // Track pool is DEFINED ENTIRELY by Global Filters
      // Example: Filter "Genre = UP TEMPO" gets ALL UP TEMPO tracks across entire library
      // Example: Filter "Artist = NATUREBEAT" gets ALL NATUREBEAT tracks across entire library
      let query = supabase
        .from('audio_tracks')
        .select('*')
        .is('deleted_at', null);

      // Apply global filters - these DEFINE the complete track pool
      ruleGroups.forEach(group => {
        group.rules.forEach((rule: any) => {
          if (rule.field && rule.value !== '') {
            // Check if this is a JSONB metadata field (contains ->>, ->, or #>)
            const isMetadataField = rule.field.includes('->') || rule.field.includes('#>');

            if (isMetadataField) {
              // For metadata fields, we need to use raw SQL via filter()
              // Example: metadata->>'genre' = 'Alpha Chill'
              const cleanField = rule.field.replace(/['"]/g, ''); // Remove any quotes

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
      });

      const { data, error } = await query;

      if (error) throw error;

      setAvailableTracks(data || []);
      setTracksLoaded(true);
      setTrackPoolCount(data?.length || 0);

      const filterCount = ruleGroups.flatMap(g => g.rules).filter(r => r.field && r.value).length;
      const message = filterCount > 0
        ? `Loaded ${data?.length || 0} tracks matching ${filterCount} global filter(s) from entire library`
        : `Loaded ${data?.length || 0} tracks from entire library (no filters applied)`;

      alert(message);
    } catch (error) {
      alert('Failed to load tracks');
    } finally {
      setTracksLoading(false);
    }
  }

  function handlePlayTrack(track: any) {
    if (currentTrack?.id === track.id && isPlaying) {
      toggleAdminPlayback();
    } else {
      setAdminPreview(track, true);
    }
  }

  function handleRemoveTrack(trackId: string) {
    setAvailableTracks(prev => prev.filter(t => t.id !== trackId));
    setTrackPoolCount(prev => (prev ? prev - 1 : 0));
  }

  async function handleSave() {
    if (!channelId) return;

    setIsSaving(true);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/slot-strategy-save`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channelId,
          energyTier: currentTier,
          strategy: {
            name: 'Slot Sequencer',
            numSlots,
            recentRepeatWindow,
          },
          definitions,
          ruleGroups,
          savedSequenceId: loadedSequenceId,
          savedSequenceName: loadedSequenceName,
        }),
      });

      if (response.ok) {
        // Also update the playback continuation setting in the channel's playlist_strategy
        const { data: channelData } = await supabase
          .from('audio_channels')
          .select('playlist_strategy')
          .eq('id', channelId)
          .single();

        const currentStrategy = channelData?.playlist_strategy || {};
        const updatedStrategy = {
          ...currentStrategy,
          [currentTier]: {
            ...currentStrategy[currentTier],
            strategy: 'slot_based',
            playbackContinuation
          }
        };

        await supabase
          .from('audio_channels')
          .update({ playlist_strategy: updatedStrategy })
          .eq('id', channelId);

        alert('Strategy saved successfully!');
        onSave?.();
        // Dispatch custom event so EnergyPlaylistModal can refresh
        window.dispatchEvent(new CustomEvent('slot-strategy-saved', {
          detail: { channelId, energyTier: currentTier }
        }));

        // Reset unsaved changes flag after successful save
        const currentState = JSON.stringify({
          numSlots,
          recentRepeatWindow,
          definitions,
          ruleGroups,
          playbackContinuation,
        });
        setInitialState(currentState);
        setHasUnsavedChanges(false);
      } else {
        const error = await response.json();
        const errorMsg = error.error || 'Unknown error';
        const details = error.fullError || error.details || 'No additional details';
        alert(`Failed to save: ${errorMsg}\n\nDetails:\n${details}`);
      }
    } catch (error: any) {
      alert(`Failed to save strategy: ${error.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  }

  function handleBackNavigation() {
    if (hasUnsavedChanges) {
      setPendingNavigation({ type: 'back' });
      setShowUnsavedDialog(true);
    } else {
      window.location.href = `/admin?channel=${channelId}`;
    }
  }

  function handleTierChange(newTier: EnergyTier) {
    if (newTier === currentTier) return;

    if (hasUnsavedChanges) {
      setPendingNavigation({ type: 'tier', tier: newTier });
      setShowUnsavedDialog(true);
    } else {
      setCurrentTier(newTier);
      window.history.pushState({}, '', `/admin/slot-strategy/${channelId}/${newTier}`);
    }
  }

  async function handleSaveAndNavigate() {
    setShowUnsavedDialog(false);
    await handleSave();
    executeNavigation();
  }

  function handleDiscardAndNavigate() {
    setShowUnsavedDialog(false);
    executeNavigation();
  }

  function handleCancelNavigation() {
    setShowUnsavedDialog(false);
    setPendingNavigation(null);
  }

  function executeNavigation() {
    if (!pendingNavigation) return;

    if (pendingNavigation.type === 'back') {
      window.location.href = `/admin?channel=${channelId}`;
    } else if (pendingNavigation.type === 'tier' && pendingNavigation.tier) {
      setCurrentTier(pendingNavigation.tier);
      window.history.pushState({}, '', `/admin/slot-strategy/${channelId}/${pendingNavigation.tier}`);
    }

    setPendingNavigation(null);
  }

  function handleCreateNewSequence() {
    if (!confirm('Are you sure you want to create a new sequence? This will overwrite the existing sequence with default settings (20 slots).')) {
      return;
    }

    // Create 20 slots with default targets
    const newDefinitions: SlotDefinition[] = [];
    for (let i = 1; i <= 20; i++) {
      newDefinitions.push({
        index: i,
        targets: {
          speed: 2.5,
          intensity: 2.5,
          brightness: 2.5,
          complexity: 2.5,
          valence: 0,
          arousal: 0.5,
          bpm: 120,
        },
        boosts: [...DEFAULT_BOOSTS],
      });
    }

    setNumSlots(20);
    setRecentRepeatWindow(5);
    setDefinitions(newDefinitions);
    setRuleGroups([{ ...DEFAULT_RULE_GROUP, rules: [{ field: 'channel_id', operator: 'eq', value: channelId }] }]);
    setLoadedSequenceName(null);
    setLoadedSequenceId(null);

    // Reset initial state to track new changes from this point
    setTimeout(() => {
      const currentState = JSON.stringify({
        numSlots: 20,
        recentRepeatWindow: 5,
        definitions: newDefinitions,
        ruleGroups: [{ ...DEFAULT_RULE_GROUP, rules: [{ field: 'channel_id', operator: 'eq', value: channelId }] }],
        playbackContinuation,
      });
      setInitialState(currentState);
      setHasUnsavedChanges(false);
    }, 0);
  }

  function handleSaveAs() {
    setSaveSequenceName('');
    setSaveSequenceDescription('');
    setShowSaveModal(true);
  }

  async function handleSaveSequence() {
    const name = saveSequenceName.trim();
    if (!name) {
      alert('Please enter a name for the sequence');
      return;
    }
    const description = saveSequenceDescription.trim();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('You must be logged in to save sequences');
        return;
      }

      // Check if user is admin
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();


      if (profileError) {
        alert('Error checking admin status. Please try again.');
        return;
      }

      if (!profile?.is_admin) {
        alert('Only admins can save sequences');
        return;
      }

      const { data, error } = await supabase.from('saved_slot_sequences').insert({
        name,
        description: description || null,
        channel_id: channelId,
        energy_tier: currentTier,
        num_slots: numSlots,
        recent_repeat_window: recentRepeatWindow,
        definitions,
        rule_groups: ruleGroups,
        playback_continuation: playbackContinuation,
        created_by: user.id,
      }).select();

      if (error) {
        throw error;
      }

      setShowSaveModal(false);
      alert(`Sequence "${name}" saved successfully!`);
    } catch (error: any) {
      alert(`Failed to save sequence: ${error.message}`);
    }
  }

  async function loadSavedSequences() {
    setLoadingSequences(true);
    try {
      const { data, error } = await supabase
        .from('saved_slot_sequences')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      setSavedSequences(data || []);
    } catch (error: any) {
      alert(`Failed to load sequences: ${error.message}`);
    } finally {
      setLoadingSequences(false);
    }
  }

  async function handleExportAllData() {
    try {
      setIsSaving(true);

      // Fetch all saved slot sequences
      const { data: sequences, error: seqError } = await supabase
        .from('saved_slot_sequences')
        .select('*')
        .order('created_at', { ascending: false });

      if (seqError) throw seqError;

      // Fetch all slot strategies
      const { data: strategies, error: stratError } = await supabase
        .from('slot_strategies')
        .select('*')
        .order('created_at', { ascending: false });

      if (stratError) throw stratError;

      // Fetch all slot definitions
      const { data: definitions, error: defError } = await supabase
        .from('slot_definitions')
        .select('*');

      if (defError) throw defError;

      // Fetch all slot boosts
      const { data: boosts, error: boostError } = await supabase
        .from('slot_boosts')
        .select('*');

      if (boostError) throw boostError;

      // Fetch all slot rule groups
      const { data: ruleGroups, error: rgError } = await supabase
        .from('slot_rule_groups')
        .select('*');

      if (rgError) throw rgError;

      // Fetch all slot rules
      const { data: rules, error: rulesError } = await supabase
        .from('slot_rules')
        .select('*');

      if (rulesError) throw rulesError;

      // Fetch all audio channels to include channel info
      const { data: channels, error: chanError } = await supabase
        .from('audio_channels')
        .select('id, channel_name, channel_number, playlist_strategy')
        .order('channel_name');

      if (chanError) throw chanError;

      // Organize data by strategy
      const strategiesWithData = (strategies || []).map(strat => {
        const stratDefs = (definitions || []).filter((d: any) => d.strategy_id === strat.id);
        const stratDefIds = stratDefs.map((d: any) => d.id);
        const stratBoosts = (boosts || []).filter((b: any) => stratDefIds.includes(b.slot_definition_id));
        const stratRuleGroups = (ruleGroups || []).filter((rg: any) => rg.strategy_id === strat.id);
        const stratRuleGroupIds = stratRuleGroups.map((rg: any) => rg.id);
        const stratRules = (rules || []).filter((r: any) => stratRuleGroupIds.includes(r.group_id));

        return {
          ...strat,
          definitions: stratDefs.map((def: any) => ({
            ...def,
            boosts: stratBoosts.filter((b: any) => b.slot_definition_id === def.id)
          })),
          rule_groups: stratRuleGroups.map((rg: any) => ({
            ...rg,
            rules: stratRules.filter((r: any) => r.group_id === rg.id)
          }))
        };
      });

      // Build comprehensive export data
      const exportData = {
        export_version: '1.0',
        export_date: new Date().toISOString(),
        export_description: 'Complete slot sequencer data export including all strategies, sequences, and channel configurations',

        saved_sequences: sequences || [],
        active_strategies: strategiesWithData,
        channels: channels || [],

        metadata: {
          total_sequences: sequences?.length || 0,
          total_strategies: strategies?.length || 0,
          total_definitions: definitions?.length || 0,
          total_boosts: boosts?.length || 0,
          total_rule_groups: ruleGroups?.length || 0,
          total_rules: rules?.length || 0,
          total_channels: channels?.length || 0,
        }
      };

      // Create and download JSON file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `slot-sequencer-complete-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      alert('All slot sequencer data exported successfully!');
    } catch (error: any) {
      alert(`Export failed: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  function handleLoadSequence(sequence: any) {
    if (!confirm(`Load sequence "${sequence.name}"? This will replace your current configuration.`)) {
      return;
    }

    try {
      console.log('Loading sequence:', sequence.name);
      console.log('Definitions count:', sequence.definitions?.length);

      // Validate the sequence data
      if (!sequence.definitions || !Array.isArray(sequence.definitions) || sequence.definitions.length === 0) {
        throw new Error('Invalid sequence: missing or empty slot definitions');
      }

      if (!sequence.num_slots || sequence.num_slots < 1) {
        throw new Error('Invalid sequence: invalid number of slots');
      }

      // Validate and fix each definition
      for (let i = 0; i < sequence.definitions.length; i++) {
        const def = sequence.definitions[i];

        if (!def.targets || typeof def.targets !== 'object') {
          throw new Error(`Invalid sequence: slot ${i + 1} missing targets`);
        }

        // Ensure boosts exists and is not empty
        if (!def.boosts || !Array.isArray(def.boosts) || def.boosts.length === 0) {
          console.log(`Fixing boosts for slot ${i + 1}`);
          def.boosts = [...DEFAULT_BOOSTS];
        }

        // Ensure index exists
        if (typeof def.index !== 'number') {
          console.log(`Fixing index for slot ${i + 1}`);
          def.index = i + 1;
        }
      }

      setNumSlots(sequence.num_slots);
      setRecentRepeatWindow(sequence.recent_repeat_window || 5);
      setDefinitions(sequence.definitions);
      setRuleGroups(sequence.rule_groups || [DEFAULT_RULE_GROUP]);
      setPlaybackContinuation(sequence.playback_continuation || 'continue');
      setLoadedSequenceName(sequence.name);
      setLoadedSequenceId(sequence.id);
      setShowLoadModal(false);
      alert(`Sequence "${sequence.name}" loaded successfully!`);

      // Reset initial state to track new changes from this point
      setTimeout(() => {
        const currentState = JSON.stringify({
          numSlots: sequence.num_slots,
          recentRepeatWindow: sequence.recent_repeat_window || 5,
          definitions: sequence.definitions,
          ruleGroups: sequence.rule_groups || [DEFAULT_RULE_GROUP],
          playbackContinuation: sequence.playback_continuation || 'continue',
        });
        setInitialState(currentState);
        setHasUnsavedChanges(false);
      }, 0);
    } catch (error: any) {
      console.error('Error loading sequence:', error);
      alert(`Failed to load sequence: ${error.message}`);
      setShowLoadModal(false);
    }
  }

  function handleDuplicateSequence(sequence: any) {
    setDuplicateSequence(sequence);
    setDuplicateName(`${sequence.name} (Copy)`);
    setShowDuplicateModal(true);
  }

  async function confirmDuplicate() {
    if (!duplicateName.trim() || !duplicateSequence) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('You must be logged in to save sequences');
        return;
      }

      const { data, error } = await supabase.from('saved_slot_sequences').insert({
        name: duplicateName.trim(),
        description: duplicateSequence.description,
        channel_id: duplicateSequence.channel_id,
        energy_tier: duplicateSequence.energy_tier,
        num_slots: duplicateSequence.num_slots,
        recent_repeat_window: duplicateSequence.recent_repeat_window,
        definitions: duplicateSequence.definitions,
        rule_groups: duplicateSequence.rule_groups,
        playback_continuation: duplicateSequence.playback_continuation,
        created_by: user.id,
      }).select();

      if (error) {
        throw error;
      }

      alert(`Sequence duplicated as "${duplicateName}"!`);

      setShowDuplicateModal(false);
      setDuplicateSequence(null);
      setDuplicateName('');

      await loadSavedSequences();
    } catch (error: any) {
      alert(`Failed to duplicate sequence: ${error.message}`);
    }
  }

  function handleRenameSequence() {
    if (!loadedSequenceId || !loadedSequenceName) {
      alert('No sequence loaded to rename');
      return;
    }
    setNewSequenceName(loadedSequenceName);
    setShowRenameModal(true);
    setShowSequenceMenu(false);
  }

  async function confirmRename() {
    if (!newSequenceName.trim() || !loadedSequenceId) return;

    try {
      const { error } = await supabase
        .from('saved_slot_sequences')
        .update({ name: newSequenceName.trim() })
        .eq('id', loadedSequenceId);

      if (error) throw error;

      setLoadedSequenceName(newSequenceName.trim());
      setShowRenameModal(false);
      alert(`Sequence renamed to "${newSequenceName.trim()}"!`);

      await loadSavedSequences();
    } catch (error: any) {
      alert(`Failed to rename sequence: ${error.message}`);
    }
  }

  async function handleDeleteSequence(sequence: any) {
    if (!confirm(`Delete sequence "${sequence.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('saved_slot_sequences')
        .delete()
        .eq('id', sequence.id);

      if (error) throw error;
      alert(`Sequence "${sequence.name}" deleted successfully!`);
      await loadSavedSequences();
    } catch (error: any) {
      alert(`Failed to delete sequence: ${error.message}`);
    }
  }

  function handleDownloadJSON() {
    const exportData = {
      strategy: { numSlots, recentRepeatWindow },
      slots: definitions,
      ruleGroups,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `slot-strategy-${channelId}-${currentTier}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleUploadJSON(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        let data: any;

        // Parse based on file type
        if (file.name.endsWith('.csv')) {
          // Parse CSV file - format is transposed (fields in rows, slots in columns)
          const lines = content.trim().split('\n').filter(line => line.trim());
          if (lines.length < 2) {
            throw new Error('CSV file must have at least a header row and one data row');
          }

          // First row contains slot numbers (1, 2, 3, ...)
          const slotNumbersRow = lines[0].split(',').map(h => h.trim());
          const numSlots = slotNumbersRow.length - 1; // Exclude first column (field name)
          console.log('Number of slots:', numSlots);

          // Initialize slot objects
          const slots: SlotDefinition[] = [];
          for (let i = 0; i < numSlots; i++) {
            slots.push({
              index: i + 1,
              targets: {
                speed: 3,
                intensity: 3,
                brightness: 4,
                complexity: 3,
                valence: 0,
                arousal: 0.1,
                bpm: 86,
              },
              boosts: [...DEFAULT_BOOSTS],
            });
          }

          // Parse each attribute row
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values = line.split(',').map(v => v.trim());
            const fieldName = values[0].toLowerCase(); // Speed, Intensity, etc.

            // Assign values to each slot
            for (let slotIdx = 0; slotIdx < numSlots; slotIdx++) {
              const value = values[slotIdx + 1]; // +1 to skip field name column
              if (value && value !== '') {
                const numValue = Number(value);
                if (!isNaN(numValue)) {
                  switch (fieldName) {
                    case 'speed':
                      slots[slotIdx].targets.speed = numValue;
                      break;
                    case 'intensity':
                      slots[slotIdx].targets.intensity = numValue;
                      break;
                    case 'brightness':
                      slots[slotIdx].targets.brightness = numValue;
                      break;
                    case 'complexity':
                      slots[slotIdx].targets.complexity = numValue;
                      break;
                    case 'valence':
                      slots[slotIdx].targets.valence = numValue;
                      break;
                    case 'arousal':
                      slots[slotIdx].targets.arousal = numValue;
                      break;
                    case 'bpm':
                      slots[slotIdx].targets.bpm = numValue;
                      break;
                  }
                }
              }
            }
          }

          console.log('Parsed slots:', slots);

          data = {
            num_slots: slots.length,
            recent_repeat_window: 5,
            slot_definitions: slots,
            rule_groups: [],
          };
        } else {
          // Parse JSON file
          data = JSON.parse(content);
        }

        // Extract the data from the imported file
        const numSlots = data.strategy?.numSlots || data.num_slots || data.slot_definitions?.length || 20;
        const recentRepeatWindow = data.strategy?.recentRepeatWindow || data.recent_repeat_window || 5;
        const slots = data.slots || data.slot_definitions || [];
        const ruleGroups = data.ruleGroups || data.rule_groups || [];

        console.log('Parsed data:', { numSlots, recentRepeatWindow, slotsCount: slots.length, ruleGroupsCount: ruleGroups.length });
        console.log('First slot:', slots[0]);

        // Create a name from the filename
        const fileName = file.name.replace(/\.(json|csv)$/i, '');
        const sequenceName = `Imported: ${fileName}`;

        // Save to database
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          alert('You must be logged in to import sequences');
          return;
        }

        const { error: saveError } = await supabase
          .from('saved_slot_sequences')
          .insert({
            created_by: user.id,
            channel_id: channelId,
            energy_tier: currentTier,
            name: sequenceName,
            description: `Imported from ${file.name} on ${new Date().toLocaleDateString()}`,
            num_slots: numSlots,
            recent_repeat_window: recentRepeatWindow,
            definitions: slots,
            rule_groups: ruleGroups,
          });

        if (saveError) {
          console.error('Error saving imported sequence:', saveError);
          console.error('Data attempted to save:', { numSlots, recentRepeatWindow, slotsCount: slots.length });
          alert(`Failed to save imported sequence: ${saveError.message}`);
          return;
        }

        alert('Sequence imported successfully! You can now load it from the list.');

        // Refresh the sequences list
        await loadSavedSequences();

        // Reset the file input
        event.target.value = '';
      } catch (error) {
        console.error('Import error:', error);
        alert('Invalid file format. Please upload a valid JSON or CSV file.');
      }
    };
    reader.readAsText(file);
  }

  function updateSlotTarget(slotIndex: number, field: SlotField, value: number) {
    setDefinitions(defs => defs.map(def =>
      def.index === slotIndex
        ? { ...def, targets: { ...def.targets, [field]: value } }
        : def
    ));
  }

  function updateSlotBoost(slotIndex: number, boostIndex: number, updates: Partial<SlotBoost>) {
    setDefinitions(defs => defs.map(def =>
      def.index === slotIndex
        ? {
            ...def,
            boosts: def.boosts.map((boost, idx) =>
              idx === boostIndex ? { ...boost, ...updates } : boost
            ),
          }
        : def
    ));
  }

  function addBoostToSlot(slotIndex: number) {
    setDefinitions(defs => defs.map(def =>
      def.index === slotIndex
        ? {
            ...def,
            boosts: [...def.boosts, { field: 'speed', mode: 'near' as const, weight: 1 }],
          }
        : def
    ));
  }

  function removeBoostFromSlot(slotIndex: number, boostIndex: number) {
    setDefinitions(defs => defs.map(def =>
      def.index === slotIndex
        ? {
            ...def,
            boosts: def.boosts.filter((_, idx) => idx !== boostIndex),
          }
        : def
    ));
  }

  function addSlot() {
    if (numSlots >= 60) return;
    const newNum = numSlots + 1;
    setNumSlots(newNum);
    setDefinitions([...definitions, {
      index: newNum,
      targets: {
        speed: 3,
        intensity: 3,
        brightness: 4,
        complexity: 3,
        valence: 0,
        arousal: 0.1,
        bpm: 86,
      },
      boosts: [...DEFAULT_BOOSTS],
    }]);
  }

  function removeSlot() {
    if (selectedSlots.size === 0) {
      // Remove last slot if none selected
      if (numSlots <= 1) return;
      const newNum = numSlots - 1;
      setNumSlots(newNum);
      setDefinitions(defs => defs.filter(def => def.index <= newNum));
    } else {
      // Remove selected slots
      const remainingDefs = definitions.filter(def => !selectedSlots.has(def.index));
      // Reindex remaining definitions
      const reindexed = remainingDefs.map((def, idx) => ({ ...def, index: idx + 1 }));
      setDefinitions(reindexed);
      setNumSlots(reindexed.length);
      setSelectedSlots(new Set());
    }
  }

  function toggleSlotSelection(slotIndex: number) {
    setSelectedSlots(prev => {
      const newSet = new Set(prev);
      if (newSet.has(slotIndex)) {
        newSet.delete(slotIndex);
      } else {
        newSet.add(slotIndex);
      }
      return newSet;
    });
  }

  function toggleSlotBoosts(slotIndex: number) {
    setExpandedSlotBoosts(prev => prev === slotIndex ? null : slotIndex);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
          <p className="mt-4 text-slate-600">Loading slot strategy...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-24">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-full px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={handleBackNavigation}
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft size={20} />
                Back
              </button>
              <div className="h-6 w-px bg-slate-300"></div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">
                  Slot Sequencer
                </h1>
                <p className="text-sm text-slate-600">
                  {channel?.channel_name} • {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)} Energy
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <button
                  onClick={() => setShowSequenceMenu(!showSequenceMenu)}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <div className="flex flex-col items-start">
                    <span className="text-xs text-slate-500 uppercase tracking-wide">Current Sequence</span>
                    <span className="text-sm font-semibold text-slate-900">
                      {loadedSequenceName || 'New Sequence'}
                    </span>
                  </div>
                  <ChevronDown size={18} className={`text-slate-400 transition-transform ${showSequenceMenu ? 'rotate-180' : ''}`} />
                </button>

                {showSequenceMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowSequenceMenu(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-2 z-20">
                      <button
                        onClick={() => {
                          setShowSequenceMenu(false);
                          handleCreateNewSequence();
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors"
                      >
                        <Plus size={18} className="text-green-600" />
                        <span className="text-sm font-medium text-slate-700">New Sequence</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowSequenceMenu(false);
                          handleSaveAs();
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors"
                      >
                        <Save size={18} className="text-slate-600" />
                        <span className="text-sm font-medium text-slate-700">Save As...</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowSequenceMenu(false);
                          setShowLoadModal(true);
                          loadSavedSequences();
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors"
                      >
                        <FolderOpen size={18} className="text-slate-600" />
                        <span className="text-sm font-medium text-slate-700">Load...</span>
                      </button>
                      {loadedSequenceId && (
                        <button
                          onClick={handleRenameSequence}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors"
                        >
                          <Edit2 size={18} className="text-slate-600" />
                          <span className="text-sm font-medium text-slate-700">Rename...</span>
                        </button>
                      )}
                      <div className="h-px bg-slate-200 my-1" />
                      <button
                        onClick={() => {
                          setShowSequenceMenu(false);
                          handleDownloadJSON();
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors"
                      >
                        <Download size={18} className="text-slate-600" />
                        <span className="text-sm font-medium text-slate-700">Export to File</span>
                      </button>
                      <label className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors cursor-pointer">
                        <Upload size={18} className="text-slate-600" />
                        <span className="text-sm font-medium text-slate-700">Import from File</span>
                        <input
                          type="file"
                          accept=".json,.csv"
                          onChange={(e) => {
                            setShowSequenceMenu(false);
                            handleUploadJSON(e);
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </>
                )}
              </div>
              <div className="h-8 w-px bg-slate-300"></div>
              <button
                onClick={handleExportAllData}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Export all slot sequencer data from all channels"
              >
                <Database size={18} />
                ALL DATA EXPORT
              </button>
              <div className="h-8 w-px bg-slate-300"></div>
              <button
                onClick={() => setShowPlaybackModal(true)}
                className="flex items-center gap-2 px-4 py-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                title="Playback Settings"
              >
                <Settings size={18} />
                Playback Settings
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={18} />
                {isSaving ? 'Saving...' : 'Save Strategy'}
              </button>
            </div>
          </div>

          {/* Energy Tier Tabs - Only show tiers that use slot sequencer */}
          {channel && (() => {
            const availableTiers = (['low', 'medium', 'high'] as EnergyTier[]).filter(tier => {
              const strategyConfig = channel.playlist_strategy?.[tier];
              return strategyConfig?.strategy === 'slot_based';
            });

            // Only show tabs if there are multiple slot-based tiers
            if (availableTiers.length > 1) {
              return (
                <div className="mt-4 flex gap-2">
                  {availableTiers.map(tier => (
                    <button
                      key={tier}
                      onClick={() => handleTierChange(tier)}
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                        currentTier === tier
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                      }`}
                    >
                      {tier.charAt(0).toUpperCase() + tier.slice(1)}
                    </button>
                  ))}
                </div>
              );
            }
            return null;
          })()}
        </div>
      </header>

      {/* Main Content */}
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        {/* Controls Bar */}
        <div className="bg-white rounded-xl shadow-sm mb-4 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-slate-700">{numSlots} Slots</span>
              <button
                onClick={removeSlot}
                disabled={numSlots <= 1 && selectedSlots.size === 0}
                className="px-3 py-1.5 text-sm text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {selectedSlots.size > 0 ? `Remove ${selectedSlots.size} Selected` : 'Remove Slot'}
              </button>
              <button
                onClick={addSlot}
                disabled={numSlots >= 60}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={16} />
                Add Slot
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={loadTracks}
                disabled={tracksLoading}
                className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors ${
                  tracksLoaded
                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    : 'bg-amber-600 text-white hover:bg-amber-700'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {tracksLoading ? (
                  <>
                    <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Loading...
                  </>
                ) : tracksLoaded ? (
                  <>
                    <Download size={16} />
                    {availableTracks.length} Tracks Loaded
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Load All Tracks
                  </>
                )}
              </button>
              <button
                onClick={() => setSequencePreviewModal(true)}
                disabled={!tracksLoaded}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play size={16} />
                Preview Sequence
              </button>
            </div>
          </div>
        </div>

        {/* DAW-Style Grid */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              {/* Header Row */}
              <div className="flex border-b border-slate-200 bg-slate-50">
                <div className="w-32 flex-shrink-0 px-3 py-2 text-xs font-semibold text-slate-700 border-r border-slate-200">
                  Field
                </div>
                {definitions.map((slot) => (
                  <React.Fragment key={slot.index}>
                    {/* Slot Header */}
                    <div className="w-20 flex-shrink-0 border-r border-slate-200">
                      <div className="flex flex-col items-center px-2 py-1 gap-1">
                        <div className="flex items-center justify-between w-full">
                          <input
                            type="checkbox"
                            checked={selectedSlots.has(slot.index)}
                            onChange={() => toggleSlotSelection(slot.index)}
                            className="w-3 h-3 text-blue-600 rounded cursor-pointer"
                            title="Select slot for removal"
                          />
                          <span className="text-xs font-semibold text-slate-700">{slot.index}</span>
                        </div>
                        <div className="flex items-center gap-1 w-full justify-center">
                          <button
                            onClick={() => setSlotPreviewModal(slot.index)}
                            disabled={!tracksLoaded}
                            className="p-0.5 text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title={tracksLoaded ? "Preview slot tracks" : "Load tracks first"}
                          >
                            <Play size={12} />
                          </button>
                          <button
                            onClick={() => toggleSlotBoosts(slot.index)}
                            className={`p-0.5 rounded transition-colors ${
                              expandedSlotBoosts === slot.index
                                ? 'bg-blue-100 text-blue-600'
                                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                            }`}
                            title="Toggle boost weights"
                          >
                            <Zap size={12} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Boost Panel Header (if expanded) */}
                    {expandedSlotBoosts === slot.index && (
                      <div className="w-48 flex-shrink-0 bg-blue-50 border-r-2 border-blue-200">
                        <div className="flex items-center justify-between px-3 py-2">
                          <span className="text-xs font-semibold text-blue-900">Boosts</span>
                          <button
                            onClick={() => setExpandedSlotBoosts(null)}
                            className="p-0.5 text-blue-400 hover:text-blue-600 hover:bg-blue-100 rounded transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>

              {/* Target Value Rows */}
              {FIELD_ORDER.map((field) => (
                <div key={field} className="flex border-b border-slate-200 hover:bg-slate-50">
                  <div className="w-32 flex-shrink-0 px-3 py-2 text-xs font-medium text-slate-700 border-r border-slate-200 flex items-center">
                    {FIELD_LABELS[field]}
                  </div>
                  {definitions.map((slot) => (
                    <React.Fragment key={slot.index}>
                      {/* Target Value Cell */}
                      <div className="w-20 flex-shrink-0 px-1 py-1 border-r border-slate-200">
                        <input
                          type="number"
                          value={slot.targets[field] ?? ''}
                          onChange={(e) => updateSlotTarget(slot.index, field, parseFloat(e.target.value) || 0)}
                          step={FIELD_RANGES[field].step}
                          min={FIELD_RANGES[field].min}
                          max={FIELD_RANGES[field].max}
                          className="w-full px-1 py-1 text-xs text-center border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>

                      {/* Boost Configuration (if expanded) */}
                      {expandedSlotBoosts === slot.index && (
                        <div className="w-48 flex-shrink-0 px-2 py-1 bg-blue-50 border-r-2 border-blue-200">
                          {(() => {
                            const fieldBoost = slot.boosts.find(b => b.field === field);
                            const boostIdx = slot.boosts.findIndex(b => b.field === field);

                            if (fieldBoost) {
                              return (
                                <div className="flex items-center gap-1">
                                  <select
                                    value={fieldBoost.mode}
                                    onChange={(e) => updateSlotBoost(slot.index, boostIdx, { mode: e.target.value as 'near' | 'exact' })}
                                    className="flex-1 px-1.5 py-1 text-xs border border-blue-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent bg-white"
                                  >
                                    <option value="near">Near</option>
                                    <option value="exact">Exact</option>
                                  </select>
                                  <input
                                    type="number"
                                    value={fieldBoost.weight}
                                    onChange={(e) => updateSlotBoost(slot.index, boostIdx, { weight: parseInt(e.target.value) || 1 })}
                                    min="1"
                                    max="5"
                                    className="w-10 px-1.5 py-1 text-xs text-center border border-blue-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent bg-white"
                                    placeholder="Wt"
                                  />
                                  <button
                                    onClick={() => removeBoostFromSlot(slot.index, boostIdx)}
                                    className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                                    title="Remove boost"
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                </div>
                              );
                            } else {
                              return (
                                <button
                                  onClick={() => {
                                    const newBoost: SlotBoost = { field, mode: 'near', weight: 2 };
                                    setDefinitions(defs => defs.map(def =>
                                      def.index === slot.index
                                        ? { ...def, boosts: [...def.boosts, newBoost] }
                                        : def
                                    ));
                                  }}
                                  className="w-full px-2 py-1 text-xs text-blue-600 hover:bg-blue-100 border border-dashed border-blue-300 rounded transition-colors"
                                >
                                  + Boost
                                </button>
                              );
                            }
                          })()}
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Global Rules Section */}
        <div className="bg-white rounded-xl shadow-sm mt-6">
          <button
            onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
            className="w-full px-6 py-4 border-b border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-slate-900">Global Filters</h2>
                {isFiltersExpanded ? (
                  <ChevronUp size={20} className="text-slate-400" />
                ) : (
                  <ChevronDown size={20} className="text-slate-400" />
                )}
              </div>
              {trackPoolCount !== null && (
                <div className="flex items-center gap-2">
                  <div className="text-xl font-bold text-blue-600">{trackPoolCount.toLocaleString()}</div>
                  <div className="text-xs text-slate-600">tracks</div>
                </div>
              )}
            </div>
          </button>
          {isFiltersExpanded && (
            <div className="p-6">
              <div className="space-y-4">
                {ruleGroups.map((group, groupIdx) => (
                <div key={groupIdx} className="border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <select
                      value={group.logic}
                      onChange={(e) => {
                        const newGroups = [...ruleGroups];
                        newGroups[groupIdx].logic = e.target.value as 'AND' | 'OR';
                        setRuleGroups(newGroups);
                      }}
                      className="px-3 py-2 text-sm font-medium border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="AND">Match ALL (AND)</option>
                      <option value="OR">Match ANY (OR)</option>
                    </select>
                    <button
                      onClick={() => {
                        const newGroups = ruleGroups.filter((_, i) => i !== groupIdx);
                        setRuleGroups(newGroups.length > 0 ? newGroups : [DEFAULT_RULE_GROUP]);
                      }}
                      className="text-sm text-red-600 hover:text-red-700 font-medium"
                    >
                      Remove Group
                    </button>
                  </div>
                  <div className="space-y-2">
                    {group.rules.map((rule, ruleIdx) => {
                      const selectedField = METADATA_FIELDS.find(f => f.value === rule.field);

                      return (
                        <div key={ruleIdx} className="flex items-center gap-3">
                          <select
                            value={rule.field}
                            onChange={(e) => {
                              const newGroups = [...ruleGroups];
                              const field = METADATA_FIELDS.find(f => f.value === e.target.value);
                              newGroups[groupIdx].rules[ruleIdx].field = e.target.value;

                              // Set default value based on field type
                              if (field?.type === 'number') {
                                newGroups[groupIdx].rules[ruleIdx].value = 0;
                              } else if (field?.type === 'boolean') {
                                newGroups[groupIdx].rules[ruleIdx].value = true;
                              } else {
                                newGroups[groupIdx].rules[ruleIdx].value = '';
                              }

                              setRuleGroups(newGroups);
                            }}
                            className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          >
                            <option value="">Select field...</option>
                            {METADATA_FIELDS.map(field => (
                              <option key={field.value} value={field.value}>
                                {field.label}
                              </option>
                            ))}
                          </select>
                          <select
                            value={rule.operator}
                            onChange={(e) => {
                              const newGroups = [...ruleGroups];
                              newGroups[groupIdx].rules[ruleIdx].operator = e.target.value as RuleOperator;
                              setRuleGroups(newGroups);
                            }}
                            className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          >
                            <option value="eq">is equal to</option>
                            <option value="neq">is not equal to</option>
                            <option value="in">is in</option>
                            <option value="nin">is not in</option>
                            <option value="gte">≥</option>
                            <option value="lte">≤</option>
                            <option value="between">between</option>
                            <option value="exists">exists</option>
                          </select>
                          {selectedField?.type === 'boolean' ? (
                            <select
                              value={rule.value === true ? 'true' : 'false'}
                              onChange={(e) => {
                                const newGroups = [...ruleGroups];
                                newGroups[groupIdx].rules[ruleIdx].value = e.target.value === 'true';
                                setRuleGroups(newGroups);
                              }}
                              className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                              <option value="true">True</option>
                              <option value="false">False</option>
                            </select>
                          ) : fieldOptions[rule.field] && fieldOptions[rule.field].length > 0 ? (
                            <select
                              value={typeof rule.value === 'string' ? rule.value : JSON.stringify(rule.value)}
                              onChange={(e) => {
                                const newGroups = [...ruleGroups];
                                newGroups[groupIdx].rules[ruleIdx].value = e.target.value;
                                setRuleGroups(newGroups);
                              }}
                              className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                              <option value="">Select value...</option>
                              {fieldOptions[rule.field]
                                .filter((option): option is string => option != null && option !== '')
                                .map(option => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                            </select>
                          ) : (
                            <input
                              type={selectedField?.type === 'number' ? 'number' : 'text'}
                              value={typeof rule.value === 'string' ? rule.value : JSON.stringify(rule.value)}
                              onChange={(e) => {
                                const newGroups = [...ruleGroups];
                                if (selectedField?.type === 'number') {
                                  newGroups[groupIdx].rules[ruleIdx].value = parseFloat(e.target.value) || 0;
                                } else {
                                  try {
                                    newGroups[groupIdx].rules[ruleIdx].value = JSON.parse(e.target.value);
                                  } catch {
                                    newGroups[groupIdx].rules[ruleIdx].value = e.target.value;
                                  }
                                }
                                setRuleGroups(newGroups);
                              }}
                              onKeyDown={(e) => {
                                // Auto-load tracks when user hits Enter
                                if (e.key === 'Enter' && rule.field && rule.value !== '') {
                                  e.preventDefault();
                                  loadTracks();
                                }
                              }}
                              placeholder="Value"
                              className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          )}
                          <button
                            onClick={() => {
                              const newGroups = [...ruleGroups];
                              newGroups[groupIdx].rules.splice(ruleIdx, 1);
                              setRuleGroups(newGroups);
                            }}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => {
                      const newGroups = [...ruleGroups];
                      newGroups[groupIdx].rules.push({
                        field: 'channel_id',
                        operator: 'eq',
                        value: '',
                      });
                      setRuleGroups(newGroups);
                    }}
                    className="mt-3 flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    <Plus size={14} />
                    Add Rule
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                setRuleGroups([...ruleGroups, {
                  logic: 'AND',
                  order: ruleGroups.length,
                  rules: [],
                }]);
              }}
              className="mt-4 flex items-center gap-2 px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
            >
              <Plus size={16} />
              Add Rule Group
            </button>
            </div>
          )}
        </div>

        {/* Track Pool Display */}
        {tracksLoaded && availableTracks.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm mt-6">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Track Pool</h2>
              <p className="text-sm text-slate-600 mt-1">{availableTracks.length} tracks available</p>
            </div>
            <div className="p-6">
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {availableTracks.map((track) => (
                  <div
                    key={track.id}
                    className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <button
                      onClick={() => handlePlayTrack(track)}
                      className={`p-2 rounded-lg transition-colors ${
                        currentTrack?.id === track.id && isPlaying
                          ? 'text-green-600 bg-green-100 hover:bg-green-200'
                          : 'text-blue-600 hover:bg-blue-100'
                      }`}
                    >
                      {currentTrack?.id === track.id && isPlaying ? (
                        <Pause size={16} />
                      ) : (
                        <Play size={16} />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {track.metadata?.track_name || track.file_path?.split('/').pop()}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {track.metadata?.artist_name || 'Unknown Artist'}
                      </div>
                    </div>
                    <div className="flex gap-2 text-xs text-slate-500">
                      <span>S:{typeof (track.metadata?.speed ?? track.speed) === 'number' ? (track.metadata?.speed ?? track.speed).toFixed(1) : (track.metadata?.speed ?? track.speed)}</span>
                      <span>I:{typeof (track.metadata?.intensity ?? track.intensity) === 'number' ? (track.metadata?.intensity ?? track.intensity).toFixed(1) : (track.metadata?.intensity ?? track.intensity)}</span>
                      <span>B:{typeof (track.metadata?.brightness ?? track.brightness) === 'number' ? (track.metadata?.brightness ?? track.brightness).toFixed(1) : (track.metadata?.brightness ?? track.brightness)}</span>
                    </div>
                    <button
                      onClick={() => handleRemoveTrack(track.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Remove from track pool"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Slot Preview Modal */}
      {slotPreviewModal !== null && (
        <SlotPreviewModal
          channelId={channelId}
          energyTier={currentTier}
          slotIndex={slotPreviewModal}
          slotDefinition={definitions.find(d => d.index === slotPreviewModal)}
          globalRules={ruleGroups}
          availableTracks={availableTracks}
          onClose={() => setSlotPreviewModal(null)}
        />
      )}

      {/* Sequence Preview Modal */}
      {sequencePreviewModal && (
        <SequencePreviewModal
          channelId={channelId}
          energyTier={currentTier}
          definitions={definitions}
          globalRules={ruleGroups}
          availableTracks={availableTracks}
          onClose={() => setSequencePreviewModal(false)}
        />
      )}

      {/* Playback Continuation Modal */}
      {showPlaybackModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Playback Settings</h2>
              <button
                onClick={() => setShowPlaybackModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Playback Continuation</h3>
                <p className="text-sm text-slate-600 mb-4">
                  Choose how the playlist should behave when the user stops and resumes playback.
                </p>
              </div>

              {/* Restart from Beginning on Login */}
              <label className="flex items-start gap-4 p-4 border-2 rounded-lg cursor-pointer transition-all hover:bg-slate-50">
                <input
                  type="radio"
                  name="playbackContinuation"
                  value="restart_login"
                  checked={playbackContinuation === 'restart_login'}
                  onChange={(e) => setPlaybackContinuation(e.target.value as 'restart_login' | 'restart_session' | 'continue')}
                  className="mt-1 w-5 h-5 text-blue-600"
                />
                <div className="flex-1">
                  <div className="font-medium text-slate-900 mb-1">Restart from Beginning on Login</div>
                  <div className="text-sm text-slate-600">
                    Every time the user logs in to the app, the playlist will restart from the first track.
                    Playback also restarts when user stops and resumes during the same session.
                  </div>
                </div>
              </label>

              {/* Restart from Beginning Each Session */}
              <label className="flex items-start gap-4 p-4 border-2 rounded-lg cursor-pointer transition-all hover:bg-slate-50">
                <input
                  type="radio"
                  name="playbackContinuation"
                  value="restart_session"
                  checked={playbackContinuation === 'restart_session'}
                  onChange={(e) => setPlaybackContinuation(e.target.value as 'restart_login' | 'restart_session' | 'continue')}
                  className="mt-1 w-5 h-5 text-blue-600"
                />
                <div className="flex-1">
                  <div className="font-medium text-slate-900 mb-1">Restart from Beginning Each Session</div>
                  <div className="text-sm text-slate-600">
                    Each time the user stops and starts playback during a session, the playlist restarts
                    from the first track. Position is maintained across sessions only if the user doesn't
                    manually stop (sessions expire after 1 hour of inactivity).
                  </div>
                </div>
              </label>

              {/* Continue from Last Position */}
              <label className="flex items-start gap-4 p-4 border-2 rounded-lg cursor-pointer transition-all hover:bg-slate-50">
                <input
                  type="radio"
                  name="playbackContinuation"
                  value="continue"
                  checked={playbackContinuation === 'continue'}
                  onChange={(e) => setPlaybackContinuation(e.target.value as 'restart_login' | 'restart_session' | 'continue')}
                  className="mt-1 w-5 h-5 text-blue-600"
                />
                <div className="flex-1">
                  <div className="font-medium text-slate-900 mb-1">Continue from Last Position</div>
                  <div className="text-sm text-slate-600">
                    Resume playback from the next unplayed track when the user returns. Position is
                    preserved across logins and sessions, providing a continuous listening experience.
                  </div>
                </div>
              </label>
            </div>

            <div className="sticky bottom-0 bg-slate-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-slate-200">
              <button
                onClick={() => setShowPlaybackModal(false)}
                className="px-4 py-2 text-slate-700 hover:text-slate-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowPlaybackModal(false);
                  // Settings will be saved when user clicks "Save Strategy"
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load Sequence Modal */}
      {showLoadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div
            className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Load Saved Sequence</h2>
              <button
                onClick={() => setShowLoadModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6">
              {loadingSequences ? (
                <div className="text-center py-12 text-slate-600">Loading sequences...</div>
              ) : savedSequences.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-slate-600 mb-4">No saved sequences yet</p>
                  <p className="text-sm text-slate-500">Use "Save As" to save your current sequence</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {savedSequences.map((seq) => (
                    <div
                      key={seq.id}
                      className="border border-slate-200 rounded-lg p-4 hover:border-slate-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-slate-900 text-lg mb-1">{seq.name}</h3>
                          {seq.description && (
                            <p className="text-sm text-slate-600 mb-2">{seq.description}</p>
                          )}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                            <span>{seq.num_slots} slots</span>
                            <span>•</span>
                            <span>Window: {seq.recent_repeat_window}</span>
                            {seq.energy_tier && (
                              <>
                                <span>•</span>
                                <span>{seq.energy_tier.charAt(0).toUpperCase() + seq.energy_tier.slice(1)}</span>
                              </>
                            )}
                            <span>•</span>
                            <span>{new Date(seq.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleLoadSequence(seq);
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            title="Load this sequence"
                            type="button"
                          >
                            <FolderOpen size={16} />
                            Load
                          </button>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDuplicateSequence(seq);
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                            title="Duplicate this sequence"
                            type="button"
                          >
                            <Copy size={16} />
                            Duplicate
                          </button>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDeleteSequence(seq);
                            }}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete this sequence"
                            type="button"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-slate-50 px-6 py-4 flex items-center justify-between border-t border-slate-200">
              <label className="flex items-center gap-2 px-4 py-2 text-slate-700 hover:text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer">
                <Upload size={18} />
                Import File
                <input
                  type="file"
                  accept=".json,.csv"
                  onChange={handleUploadJSON}
                  className="hidden"
                  title="Import a JSON or CSV sequence file"
                />
              </label>
              <button
                onClick={() => setShowLoadModal(false)}
                className="px-4 py-2 text-slate-700 hover:text-slate-900 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Sequence Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="sticky top-0 bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Save Sequence</h2>
              <button
                onClick={() => setShowSaveModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Sequence Name <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={saveSequenceName}
                  onChange={(e) => setSaveSequenceName(e.target.value)}
                  placeholder="Enter a name for this sequence"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={saveSequenceDescription}
                  onChange={(e) => setSaveSequenceDescription(e.target.value)}
                  placeholder="Enter an optional description"
                  rows={3}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                <p className="text-sm font-semibold text-slate-900">This will save:</p>
                <ul className="text-sm text-slate-700 space-y-1">
                  <li>• Channel: {channel?.channel_name}</li>
                  <li>• Energy Tier: {currentTier}</li>
                  <li>• {numSlots} slots</li>
                  <li>• {definitions.length} slot definitions</li>
                  <li>• {ruleGroups.length} rule groups</li>
                  <li>• Playback continuation: {playbackContinuation}</li>
                </ul>
              </div>
            </div>

            <div className="sticky bottom-0 bg-slate-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-slate-200">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 text-slate-700 hover:text-slate-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSequence}
                disabled={!saveSequenceName.trim()}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={18} />
                Save Sequence
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Sequence Modal */}
      {showDuplicateModal && (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Duplicate Sequence</h2>
              <button
                onClick={() => {
                  setShowDuplicateModal(false);
                  setDuplicateSequence(null);
                  setDuplicateName('');
                }}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  New Sequence Name <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={duplicateName}
                  onChange={(e) => setDuplicateName(e.target.value)}
                  placeholder="Enter a name for the duplicate"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && duplicateName.trim()) {
                      confirmDuplicate();
                    }
                  }}
                />
              </div>

              {duplicateSequence && (
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-sm text-slate-700 mb-2">
                    <span className="font-semibold">Source:</span> {duplicateSequence.name}
                  </p>
                  <p className="text-xs text-slate-600">
                    This will create a copy of the sequence with all its settings, slots, rules, and boosts.
                  </p>
                </div>
              )}
            </div>

            <div className="bg-slate-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-slate-200">
              <button
                onClick={() => {
                  setShowDuplicateModal(false);
                  setDuplicateSequence(null);
                  setDuplicateName('');
                }}
                className="px-4 py-2 text-slate-700 hover:text-slate-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDuplicate}
                disabled={!duplicateName.trim()}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Copy size={18} />
                Duplicate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Sequence Modal */}
      {showRenameModal && (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Rename Sequence</h2>
              <button
                onClick={() => {
                  setShowRenameModal(false);
                  setNewSequenceName('');
                }}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Sequence Name <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={newSequenceName}
                  onChange={(e) => setNewSequenceName(e.target.value)}
                  placeholder="Enter new sequence name"
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newSequenceName.trim()) {
                      confirmRename();
                    }
                  }}
                />
              </div>

              <div className="bg-slate-50 rounded-lg p-4">
                <p className="text-sm text-slate-700 mb-2">
                  <span className="font-semibold">Current Name:</span> {loadedSequenceName}
                </p>
                <p className="text-xs text-slate-600">
                  This will rename the saved sequence. The change will be reflected everywhere this sequence is used.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-slate-200">
              <button
                onClick={() => {
                  setShowRenameModal(false);
                  setNewSequenceName('');
                }}
                className="px-4 py-2 text-slate-700 hover:text-slate-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRename}
                disabled={!newSequenceName.trim()}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Edit2 size={18} />
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved Changes Dialog */}
      {showUnsavedDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <h3 className="text-xl font-bold text-slate-900 mb-2">
                Unsaved Changes
              </h3>
              <p className="text-slate-600 mb-6">
                You have unsaved changes. What would you like to do?
              </p>

              <div className="flex flex-col gap-3">
                <button
                  onClick={handleSaveAndNavigate}
                  disabled={isSaving}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={handleDiscardAndNavigate}
                  className="w-full px-4 py-3 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors font-medium"
                >
                  Discard Changes
                </button>
                <button
                  onClick={handleCancelNavigation}
                  className="w-full px-4 py-3 border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

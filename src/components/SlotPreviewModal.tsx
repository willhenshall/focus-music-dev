import { useState, useEffect } from 'react';
import { X, Play, Pause } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useMusicPlayer } from '../contexts/MusicPlayerContext';

interface SlotPreviewModalProps {
  channelId: string;
  energyTier: string;
  slotIndex: number;
  slotDefinition: any;
  globalRules: any[];
  availableTracks?: any[];
  onClose: () => void;
}

export function SlotPreviewModal({
  channelId,
  energyTier,
  slotIndex,
  slotDefinition,
  globalRules,
  availableTracks,
  onClose,
}: SlotPreviewModalProps) {
  const [tracks, setTracks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { setAdminPreview, toggleAdminPlayback, currentTrack, isPlaying, isAdminMode } = useMusicPlayer();

  useEffect(() => {
    loadSlotTracks();
  }, []);

  async function loadSlotTracks() {
    setLoading(true);
    try {
      // CRITICAL: Load ALL tracks from ENTIRE LIBRARY
      // Slot sequencer is NOT limited to any channel or energy level
      // Track pool is DEFINED ENTIRELY by Global Filters
      let query = supabase
        .from('audio_tracks')
        .select('*')
        .is('deleted_at', null)
        .limit(50);

      // Apply global filters - these DEFINE the complete track pool
      globalRules.forEach(group => {
        group.rules.forEach((rule: any) => {
          if (rule.field && rule.value !== '') {
            // Check if this is a JSONB metadata field (contains ->>, ->, or #>)
            const isMetadataField = rule.field.includes('->') || rule.field.includes('#>');

            if (isMetadataField) {
              // For metadata fields, use filter() method
              const cleanField = rule.field.replace(/['"]/g, '');

              switch (rule.operator) {
                case 'eq':
                  query = query.filter(cleanField, 'eq', rule.value);
                  break;
                case 'neq':
                  query = query.filter(cleanField, 'neq', rule.value);
                  break;
                case 'gte':
                  query = query.filter(cleanField, 'gte', rule.value);
                  break;
                case 'lte':
                  query = query.filter(cleanField, 'lte', rule.value);
                  break;
                case 'in':
                  if (Array.isArray(rule.value)) {
                    query = query.filter(cleanField, 'in', `(${rule.value.join(',')})`);
                  }
                  break;
              }
            } else {
              // Regular column fields
              switch (rule.operator) {
                case 'eq':
                  query = query.eq(rule.field, rule.value);
                  break;
                case 'neq':
                  query = query.neq(rule.field, rule.value);
                  break;
                case 'gte':
                  query = query.gte(rule.field, rule.value);
                  break;
                case 'lte':
                  query = query.lte(rule.field, rule.value);
                  break;
                case 'in':
                  if (Array.isArray(rule.value)) {
                    query = query.in(rule.field, rule.value);
                  }
                  break;
              }
            }
          }
        });
      });

      const { data, error } = await query;

      if (error) throw error;

      // Sort by slot targets (check both metadata object and direct fields)
      const sorted = (data || []).sort((a, b) => {
        let scoreA = 0;
        let scoreB = 0;

        Object.entries(slotDefinition.targets).forEach(([field, target]: [string, any]) => {
          // Use direct field access
          const valueA = a[field] ?? 0;
          const valueB = b[field] ?? 0;

          // Apply boost weighting
          const boost = slotDefinition.boosts?.find((b: any) => b.field === field)?.weight || 1;
          scoreA += Math.abs(valueA - target) * boost;
          scoreB += Math.abs(valueB - target) * boost;
        });

        return scoreA - scoreB;
      });

      setTracks(sorted);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  }

  function handlePlayTrack(track: any) {
    if (currentTrack?.id === track.id && isPlaying) {
      toggleAdminPlayback();
    } else {
      setAdminPreview(track, true);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Slot {slotIndex} Preview</h2>
            <p className="text-sm text-slate-600 mt-1">
              Tracks matching this slot's criteria
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" />
                <p className="mt-4 text-slate-600">Loading tracks...</p>
              </div>
            </div>
          ) : tracks.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-600">No tracks match this slot's criteria</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tracks.map((track, idx) => (
                <div
                  key={track.id}
                  className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <span className="text-sm text-slate-500 w-8">{idx + 1}</span>
                  <button
                    onClick={() => handlePlayTrack(track)}
                    className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                  >
                    {currentTrack?.id === track.id && isPlaying ? (
                      <Pause size={16} />
                    ) : (
                      <Play size={16} />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">
                      {track.track_name || track.file_path?.split('/').pop()}
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {track.artist_name || 'Unknown Artist'}
                    </div>
                  </div>
                  <div className="flex gap-2 text-xs text-slate-500">
                    <span>S:{track.speed != null ? Number(track.speed).toFixed(1) : 'N/A'}</span>
                    <span>I:{track.intensity != null ? Number(track.intensity).toFixed(1) : 'N/A'}</span>
                    <span>B:{track.brightness != null ? Number(track.brightness).toFixed(1) : 'N/A'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-200">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { X, Play, Pause, SkipForward } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useMusicPlayer } from '../contexts/MusicPlayerContext';
import { selectNextTrack } from '../lib/slotStrategyEngine';

interface SequencePreviewModalProps {
  channelId: string;
  energyTier: string;
  definitions: any[];
  globalRules: any[];
  availableTracks: any[];
  onClose: () => void;
}

export function SequencePreviewModal({
  channelId,
  energyTier,
  definitions,
  globalRules,
  availableTracks,
  onClose,
}: SequencePreviewModalProps) {
  const [sequence, setSequence] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [trackCount, setTrackCount] = useState(20);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const { setAdminPreview, toggleAdminPlayback, currentTrack, isPlaying } = useMusicPlayer();

  useEffect(() => {
    generateSequence();
  }, [trackCount, availableTracks]);

  async function generateSequence() {
    setLoading(true);
    try {
      // Use availableTracks directly - this is a confidence monitor showing what the user will hear
      const generatedSequence: any[] = [];
      const usedTracks = new Set<string>();

      if (availableTracks.length === 0) {
        setSequence([]);
        setLoading(false);
        return;
      }

      for (let i = 0; i < trackCount && availableTracks.length > 0; i++) {
        const slotIndex = (i % definitions.length) + 1;
        const slotDef = definitions[i % definitions.length];

        if (!slotDef || !slotDef.targets) {
          continue;
        }

        // Score tracks for this slot (simple version matching the editor)
        const candidatesWithScores = availableTracks
          .filter(t => !usedTracks.has(t.id))
          .map(track => {
            let score = 0;
            const targets = slotDef.targets;

            // Simple distance calculation for each target field
            if (targets.speed !== undefined && track.speed !== null) {
              score += Math.max(0, 1 - Math.abs(targets.speed - track.speed) / 5);
            }
            if (targets.intensity !== undefined && track.intensity !== null) {
              score += Math.max(0, 1 - Math.abs(targets.intensity - track.intensity) / 5);
            }
            if (targets.brightness !== undefined && track.brightness !== null) {
              score += Math.max(0, 1 - Math.abs(targets.brightness - track.brightness) / 5);
            }
            if (targets.complexity !== undefined && track.complexity !== null) {
              score += Math.max(0, 1 - Math.abs(targets.complexity - track.complexity) / 5);
            }
            if (targets.valence !== undefined && track.valence !== null) {
              score += Math.max(0, 1 - Math.abs(targets.valence - track.valence));
            }
            if (targets.arousal !== undefined && track.arousal !== null) {
              score += Math.max(0, 1 - Math.abs(targets.arousal - track.arousal));
            }

            return { track, score };
          });

        // Sort by score and pick best
        candidatesWithScores.sort((a, b) => b.score - a.score);

        if (candidatesWithScores.length > 0) {
          const selected = candidatesWithScores[0].track;
          generatedSequence.push({
            ...selected,
            slotIndex,
            score: candidatesWithScores[0].score,
          });
          usedTracks.add(selected.id);
        }
      }

      setSequence(generatedSequence);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  }

  function handlePlaySequence() {
    if (sequence.length === 0) return;

    if (isPlaying && playingIndex !== null) {
      toggleAdminPlayback();
      setPlayingIndex(null);
    } else {
      setAdminPreview(sequence[0], true);
      setPlayingIndex(0);
    }
  }

  function handlePlayTrack(track: any, index: number) {
    if (currentTrack?.id === track.id && isPlaying) {
      toggleAdminPlayback();
      setPlayingIndex(null);
    } else {
      setAdminPreview(track, true);
      setPlayingIndex(index);
    }
  }

  useEffect(() => {
    // Update playing index when track changes
    if (currentTrack && isPlaying) {
      const index = sequence.findIndex(t => t.id === currentTrack.id);
      if (index !== -1) {
        setPlayingIndex(index);
      }
    } else {
      setPlayingIndex(null);
    }
  }, [currentTrack, isPlaying, sequence]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Sequence Output Preview</h2>
            <p className="text-sm text-slate-600 mt-1">
              Preview the track sequence this strategy will generate
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-slate-700">
              Preview Length:
            </label>
            <input
              type="number"
              min="1"
              max="100"
              value={trackCount}
              onChange={(e) => setTrackCount(parseInt(e.target.value) || 20)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-24"
            />
            <span className="text-sm text-slate-600">tracks</span>
            <div className="flex-1"></div>
            <button
              onClick={handlePlaySequence}
              disabled={sequence.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPlaying && playingIndex !== null ? (
                <>
                  <Pause size={16} />
                  Pause Sequence
                </>
              ) : (
                <>
                  <Play size={16} />
                  Play Sequence
                </>
              )}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" />
                <p className="mt-4 text-slate-600">Generating sequence...</p>
              </div>
            </div>
          ) : sequence.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-600">No tracks available to generate sequence</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sequence.map((track, idx) => (
                <div
                  key={`${track.id}-${idx}`}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                    playingIndex === idx
                      ? 'bg-green-100 border-2 border-green-500'
                      : 'bg-slate-50 hover:bg-slate-100 border-2 border-transparent'
                  }`}
                >
                  <span className="text-sm text-slate-500 w-8">{idx + 1}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-1 rounded">
                      Slot {track.slotIndex}
                    </span>
                  </div>
                  <button
                    onClick={() => handlePlayTrack(track, idx)}
                    className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                  >
                    {playingIndex === idx && isPlaying ? (
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
                    <span>C:{track.complexity != null ? Number(track.complexity).toFixed(1) : 'N/A'}</span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {Math.floor((track.duration_seconds ?? 0) / 60)}:{String((track.duration_seconds ?? 0) % 60).padStart(2, '0')}
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

import { useState, useEffect } from 'react';
import { Music2, Search, ChevronLeft, ChevronRight, Radio, Trash2, Clock } from 'lucide-react';
import { supabase, AudioTrack, AudioChannel } from '../lib/supabase';
import { TrackDetailModal } from './TrackDetailModal';
import { useMusicPlayer } from '../contexts/MusicPlayerContext';

export function DeletedTracks() {
  const { setAdminPreview } = useMusicPlayer();
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [channels, setChannels] = useState<AudioChannel[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedTrack, setSelectedTrack] = useState<AudioTrack | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalTracks, setTotalTracks] = useState(0);
  const tracksPerPage = 50;

  useEffect(() => {
    loadChannels();
    loadTracks();
  }, [currentPage, searchQuery]);

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

    let query = supabase
      .from('audio_tracks')
      .select('*', { count: 'exact' })
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    if (searchQuery) {
      const searchTerms = searchQuery.trim().split(/\s+/).filter(term => term.length > 0);
      searchTerms.forEach(term => {
        query = query.or(`track_name.ilike.%${term}%,artist_name.ilike.%${term}%,track_id.ilike.%${term}%,metadata->>album_name.ilike.%${term}%,genre.ilike.%${term}%,tempo.ilike.%${term}%`);
      });
    }

    const from = (currentPage - 1) * tracksPerPage;
    const to = from + tracksPerPage - 1;

    const { data, count, error } = await query.range(from, to);

    if (data && !error) {
      setTracks(data);
      setTotalTracks(count || 0);
    }

    setLoading(false);
  };

  const getChannelAssignments = (trackId: string) => {
    const assignments: Array<{ channelName: string; energy: string }> = [];

    channels.forEach(channel => {
      if (channel.playlist_data) {
        ['low', 'medium', 'high'].forEach(energy => {
          const energyData = channel.playlist_data[energy];
          if (energyData && energyData.tracks) {
            const found = energyData.tracks.some(
              (t: any) => t.track_id?.toString() === trackId
            );
            if (found) {
              assignments.push({
                channelName: channel.channel_name,
                energy: energy,
              });
            }
          }
        });
      }
    });

    return assignments;
  };

  const getDaysUntilDeletion = (deletedAt: string) => {
    const deletedDate = new Date(deletedAt);
    const deletionDate = new Date(deletedDate.getTime() + 28 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const daysRemaining = Math.ceil((deletionDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return { daysRemaining, deletionDate };
  };

  const totalPages = Math.ceil(totalTracks / tracksPerPage);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  if (loading && currentPage === 1) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <Trash2 className="text-red-600" size={28} />
            Deleted Tracks
          </h2>
          <p className="text-slate-600 mt-1">Tracks will be permanently deleted after 28 days</p>
        </div>
        <div className="text-sm text-slate-600 font-medium">
          {totalTracks} deleted track{totalTracks !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Search deleted tracks..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {tracks.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <Trash2 size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500 text-lg">No deleted tracks found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Track</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Artist</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Duration</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Size</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Channels</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Deleted</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-700">Auto-Delete In</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tracks.map((track) => {
                  const { daysRemaining, deletionDate } = getDaysUntilDeletion(track.deleted_at!);
                  const channelAssignments = getChannelAssignments(track.metadata?.track_id);

                  return (
                    <tr
                      key={track.id}
                      onClick={() => setSelectedTrack(track)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-red-100 rounded flex items-center justify-center flex-shrink-0">
                            <Music2 className="text-red-600" size={20} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 truncate">
                              {track.metadata?.track_name || 'Untitled'}
                            </p>
                            <p className="text-xs text-slate-500 truncate">
                              ID: {track.metadata?.track_id}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {track.metadata?.artist_name || 'Unknown'}
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {track.duration_seconds
                          ? `${Math.floor(track.duration_seconds / 60)}:${String(Math.floor(track.duration_seconds % 60)).padStart(2, '0')}`
                          : 'N/A'}
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {formatFileSize(track.metadata?.file_size)}
                      </td>
                      <td className="py-3 px-4">
                        {channelAssignments.length > 0 ? (
                          <div className="flex items-center gap-1 flex-wrap">
                            {channelAssignments.slice(0, 3).map((assignment, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded text-xs"
                                title={`${assignment.channelName} (${assignment.energy})`}
                              >
                                <Radio size={12} className="text-slate-500" />
                                <span className="text-slate-700">{assignment.channelName}</span>
                              </div>
                            ))}
                            {channelAssignments.length > 3 && (
                              <span className="text-xs text-slate-500">
                                +{channelAssignments.length - 3}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-sm">None</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600 text-sm">
                        {new Date(track.deleted_at!).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Clock size={14} className={daysRemaining <= 7 ? 'text-red-500' : 'text-orange-500'} />
                          <span className={`text-sm font-medium ${daysRemaining <= 7 ? 'text-red-600' : 'text-orange-600'}`}>
                            {daysRemaining} day{daysRemaining !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {deletionDate.toLocaleDateString()}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
              <p className="text-sm text-slate-600">
                Showing {((currentPage - 1) * tracksPerPage) + 1} to {Math.min(currentPage * tracksPerPage, totalTracks)} of {totalTracks} deleted tracks
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
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
                        className={`w-10 h-10 rounded-lg font-medium transition-colors ${
                          currentPage === pageNum
                            ? 'bg-blue-600 text-white'
                            : 'border border-slate-300 hover:bg-slate-50 text-slate-700'
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
        </div>
      )}

      {selectedTrack && (
        <TrackDetailModal
          track={selectedTrack}
          channelAssignments={getChannelAssignments(selectedTrack.metadata?.track_id)}
          onClose={() => {
            setSelectedTrack(null);
            setAdminPreview(null);
          }}
          onTrackDeleted={() => {
            loadTracks();
          }}
        />
      )}
    </div>
  );
}

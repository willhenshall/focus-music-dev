import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Play, SkipForward, Users, Clock } from 'lucide-react';
import { getTopTracks, getTopSkippedTracks } from '../lib/analyticsService';
import { supabase } from '../lib/supabase';

type TopTrack = {
  track_id: string;
  play_count: number;
  skip_count: number;
  completion_rate: number;
  track_name?: string;
  artist_name?: string;
};

type TopSkippedTrack = {
  track_id: string;
  skip_count: number;
  play_count: number;
  skip_rate: number;
  track_name?: string;
  artist_name?: string;
};

export function AnalyticsDashboard() {
  const [timeRange, setTimeRange] = useState<number | undefined>(7);
  const [topTracks, setTopTracks] = useState<TopTrack[]>([]);
  const [topSkippedTracks, setTopSkippedTracks] = useState<TopSkippedTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(10);

  useEffect(() => {
    loadAnalytics();
  }, [timeRange, limit]);

  const loadAnalytics = async () => {
    setLoading(true);

    const [topTracksData, topSkippedData] = await Promise.all([
      getTopTracks(limit, timeRange),
      getTopSkippedTracks(limit, timeRange),
    ]);

    const trackIds = [
      ...topTracksData.map((t: any) => t.track_id),
      ...topSkippedData.map((t: any) => t.track_id),
    ];

    const { data: tracks } = await supabase
      .from('audio_tracks')
      .select('track_id, track_name, artist_name')
      .in('track_id', trackIds);

    const trackMap = new Map();
    tracks?.forEach((track: any) => {
      if (track.track_id) {
        trackMap.set(track.track_id, {
          track_name: track.track_name,
          artist_name: track.artist_name,
        });
      }
    });

    const enrichedTopTracks = topTracksData.map((t: any) => ({
      ...t,
      ...trackMap.get(t.track_id),
    }));

    const enrichedSkippedTracks = topSkippedData.map((t: any) => ({
      ...t,
      ...trackMap.get(t.track_id),
    }));

    setTopTracks(enrichedTopTracks);
    setTopSkippedTracks(enrichedSkippedTracks);
    setLoading(false);
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  const formatPercentage = (num: number) => {
    return `${Math.round(num)}%`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Track Analytics</h2>
        <div className="flex gap-3">
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={10}>Top 10</option>
            <option value={25}>Top 25</option>
            <option value={50}>Top 50</option>
            <option value={100}>Top 100</option>
          </select>
          <select
            value={timeRange || 'all'}
            onChange={(e) => setTimeRange(e.target.value === 'all' ? undefined : Number(e.target.value))}
            className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Time</option>
            <option value={7}>Last 7 Days</option>
            <option value={30}>Last 30 Days</option>
            <option value={90}>Last 90 Days</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-slate-200">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
                <h3 className="text-lg font-semibold text-slate-900">Most Played Tracks</h3>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {topTracks.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  No play data available yet
                </div>
              ) : (
                topTracks.map((track, index) => (
                  <div key={track.track_id} className="p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold text-sm">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-slate-900 truncate">
                          {track.track_name || track.track_id}
                        </h4>
                        {track.artist_name && (
                          <p className="text-sm text-slate-600 truncate">{track.artist_name}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2">
                          <div className="flex items-center gap-1 text-sm text-slate-600">
                            <Play className="w-4 h-4" />
                            <span>{formatNumber(track.play_count)} plays</span>
                          </div>
                          <div className="flex items-center gap-1 text-sm text-slate-600">
                            <SkipForward className="w-4 h-4" />
                            <span>{formatNumber(track.skip_count)} skips</span>
                          </div>
                          <div className="flex items-center gap-1 text-sm text-slate-600">
                            <Clock className="w-4 h-4" />
                            <span>{formatPercentage(track.completion_rate)} avg</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-slate-200">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-red-600" />
                <h3 className="text-lg font-semibold text-slate-900">Most Skipped Tracks</h3>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {topSkippedTracks.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  No skip data available yet
                </div>
              ) : (
                topSkippedTracks.map((track, index) => (
                  <div key={track.track_id} className="p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-100 text-red-700 flex items-center justify-center font-bold text-sm">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-slate-900 truncate">
                          {track.track_name || track.track_id}
                        </h4>
                        {track.artist_name && (
                          <p className="text-sm text-slate-600 truncate">{track.artist_name}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2">
                          <div className="flex items-center gap-1 text-sm text-slate-600">
                            <SkipForward className="w-4 h-4" />
                            <span>{formatNumber(track.skip_count)} skips</span>
                          </div>
                          <div className="flex items-center gap-1 text-sm text-slate-600">
                            <Play className="w-4 h-4" />
                            <span>{formatNumber(track.play_count)} plays</span>
                          </div>
                          <div className="flex items-center gap-1 text-sm text-red-600 font-medium">
                            <span>{formatPercentage(track.skip_rate)} skip rate</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

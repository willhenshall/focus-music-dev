import { Play, Pause, Presentation, ChevronUp, ChevronDown } from 'lucide-react';
import { useMusicPlayer } from '../contexts/MusicPlayerContext';
import { useImageSet } from '../contexts/ImageSetContext';
import { useAuth } from '../contexts/AuthContext';
import { useState } from 'react';
import SessionTimer from './SessionTimer';

type NowPlayingFooterProps = {
  onOpenSlideshow: () => void;
};

export function NowPlayingFooter({ onOpenSlideshow }: NowPlayingFooterProps) {
  const { activeChannel, isPlaying, currentTrack, toggleChannel, isAdminMode, adminPreviewTrack, toggleAdminPlayback, playlist, currentTrackIndex } = useMusicPlayer();
  const { channelImages } = useImageSet();
  const { profile } = useAuth();
  const [isQueueExpanded, setIsQueueExpanded] = useState(false);

  // Show footer if there's an active channel OR if admin is previewing a track
  if (!activeChannel && !isAdminMode) {
    return null;
  }

  // In admin mode, use admin preview track
  const displayTrack = isAdminMode ? adminPreviewTrack : currentTrack;

  const scrollToActiveChannel = () => {
    const channelCard = document.querySelector(`[data-channel-id="${activeChannel.id}"]`);
    if (channelCard) {
      const header = document.querySelector('header');
      const headerHeight = header ? header.offsetHeight : 0;

      // Add gap spacing (16px on mobile, 20px on desktop matching the grid gap)
      const gapSpacing = window.innerWidth >= 768 ? 20 : 16;

      const cardTop = channelCard.getBoundingClientRect().top + window.scrollY;
      const scrollToPosition = cardTop - headerHeight - gapSpacing;

      window.scrollTo({
        top: scrollToPosition,
        behavior: 'smooth'
      });
    }
  };

  // Use the same logic as the channel cards: prioritize channelImages over image_url
  const channelImage = activeChannel ? (channelImages[activeChannel.id] || activeChannel.image_url) : null;

  // Get next tracks for queue
  const nextTracks = playlist.slice(currentTrackIndex + 1, currentTrackIndex + 11);

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg z-50" data-testid="player-footer">
      {/* Queue Display - Only for admins */}
      {profile?.is_admin && isQueueExpanded && nextTracks.length > 0 && (
        <div className="bg-slate-50 border-b border-slate-200 max-h-96 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="mb-3 text-xs font-bold text-slate-700 uppercase tracking-wide">
              Next {nextTracks.length} Track{nextTracks.length !== 1 ? 's' : ''} in Queue
            </div>
            <div className="space-y-2">
              {nextTracks.map((track, index) => (
                <div
                  key={`${track.metadata?.track_id}-${index}`}
                  className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all"
                >
                  <div className="w-7 h-7 flex items-center justify-center bg-slate-900 text-white text-xs font-bold rounded-lg flex-shrink-0">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-slate-900 truncate">
                      {track.track_name || 'Unknown Track'}
                    </div>
                    <div className="text-xs text-slate-600 truncate mt-0.5">
                      {track.artist_name || 'Unknown Artist'}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 flex-shrink-0 font-medium">
                    BPM: {track.tempo || 'N/A'}
                  </div>
                  <div className="text-xs font-mono text-slate-400 flex-shrink-0">
                    {track.track_id}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
        {/* Left: Now playing info - clickable to scroll to card (only for non-admin mode) */}
        {isAdminMode ? (
          <div className="flex-1 min-w-0 flex items-center gap-3">
            {/* Text content for admin preview */}
            <div className="flex-1 min-w-0">
              <div className="text-xs text-amber-600 mb-0.5 font-medium">Admin Preview</div>
              <div className="font-semibold text-slate-900 truncate">
                {displayTrack?.track_name || displayTrack?.file_path?.split('/').pop() || 'No Track'}
              </div>
              <div className="text-sm text-slate-600 truncate">
                {displayTrack?.artist_name || 'Unknown Artist'}
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={scrollToActiveChannel}
            className="flex-1 min-w-0 text-left hover:bg-slate-50 -mx-2 px-2 py-1 rounded transition-colors flex items-center gap-3"
          >
            {/* Channel Image */}
            {channelImage && (
              <img
                src={channelImage}
                alt={activeChannel?.channel_name}
                className="w-14 h-14 rounded object-cover flex-shrink-0"
              />
            )}

            {/* Text content */}
            <div className="flex-1 min-w-0">
              <div className="text-xs text-slate-500 mb-0.5" data-testid="player-now-playing">Now playing...</div>
              <div className="font-semibold text-slate-900 truncate">
                {activeChannel?.channel_name}
              </div>
              <div className="text-sm text-slate-600 truncate" data-testid="player-track-info">
                {displayTrack?.artist_name || 'Unknown Artist'} • {displayTrack?.track_name || 'No Track'}
              </div>
            </div>
          </button>
        )}

        {/* Center: Timer and Play/Pause button */}
        <div className="flex items-center gap-3">
          {/* Global Timer Button */}
          {!isAdminMode && (
            <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
              <SessionTimer />
            </div>
          )}

          {/* Play/Pause Button */}
          <button
            onClick={() => isAdminMode ? toggleAdminPlayback() : toggleChannel(activeChannel!, !isPlaying, true, channelImage || undefined)}
            data-testid="player-play-pause"
            data-playing={isPlaying}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-md ${
              isPlaying
                ? 'bg-slate-900 text-white hover:bg-slate-800'
                : 'bg-white text-slate-700 hover:bg-slate-50 border-2 border-slate-300'
            }`}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5" fill="currentColor" />
            ) : (
              <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
            )}
          </button>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-2">
          {/* Queue button - Only for admins */}
          {profile?.is_admin && !isAdminMode && (
            <button
              onClick={() => setIsQueueExpanded(!isQueueExpanded)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-all"
              title={isQueueExpanded ? 'Hide queue' : 'Show queue'}
            >
              {isQueueExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              <span className="hidden sm:inline font-bold">Queue</span>
            </button>
          )}

          {/* Slideshow button (hide in admin mode) */}
          {!isAdminMode && (
            <button
              onClick={onOpenSlideshow}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-all"
            >
              <Presentation className="w-5 h-5" />
              <span className="hidden sm:inline">Slideshow</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

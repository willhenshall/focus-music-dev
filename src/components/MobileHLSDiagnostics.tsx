/**
 * Mobile HLS Diagnostics Panel
 * 
 * A mobile-optimized diagnostics panel for monitoring native HLS playback
 * on iOS Safari. Shows quality tier, bandwidth, buffer health, playlist info,
 * and more by inferring data from network activity since native HLS doesn't 
 * expose ABR internals.
 */

import { X, Wifi, WifiOff, Activity, Clock, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle, Radio, Gauge, Layers, History, RefreshCw, Music, ListMusic, SkipForward, Loader2, CheckCircle2, Play, Zap } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { NativeHLSMonitor, getNativeHLSMonitor } from '../lib/nativeHLSMonitor';
import type { NativeHLSMetrics, QualityTier, TierSwitch, SegmentRequest } from '../lib/types/nativeHLSMetrics';
import { TIER_BANDWIDTHS } from '../lib/types/nativeHLSMetrics';
import { useMusicPlayer } from '../contexts/MusicPlayerContext';

interface MobileHLSDiagnosticsProps {
  onClose: () => void;
  audioElement?: HTMLAudioElement | null;
}

/**
 * Find the active audio element in the DOM
 * The streaming engine creates audio elements that we can monitor
 */
function findAudioElement(): HTMLAudioElement | null {
  // Try to find an audio element that's currently playing or has a source
  const audioElements = document.querySelectorAll('audio');
  for (const audio of audioElements) {
    if (!audio.paused || audio.currentSrc) {
      return audio;
    }
  }
  // Fall back to first audio element
  return audioElements[0] || null;
}

// Tier display configuration
const TIER_CONFIG: Record<QualityTier, { label: string; color: string; bgColor: string; bitrate: string }> = {
  low: { label: 'LOW', color: 'text-orange-600', bgColor: 'bg-orange-100', bitrate: '32k' },
  medium: { label: 'MED', color: 'text-yellow-600', bgColor: 'bg-yellow-100', bitrate: '64k' },
  high: { label: 'HIGH', color: 'text-blue-600', bgColor: 'bg-blue-100', bitrate: '96k' },
  premium: { label: 'MAX', color: 'text-green-600', bgColor: 'bg-green-100', bitrate: '128k' },
  unknown: { label: '---', color: 'text-slate-500', bgColor: 'bg-slate-100', bitrate: '-' },
};

// Connection type colors
const CONNECTION_COLORS: Record<string, string> = {
  '4g': 'text-green-600',
  '3g': 'text-yellow-600',
  '2g': 'text-orange-600',
  'slow-2g': 'text-red-600',
  'unknown': 'text-slate-500',
};

export function MobileHLSDiagnostics({ onClose, audioElement }: MobileHLSDiagnosticsProps) {
  const [metrics, setMetrics] = useState<NativeHLSMetrics | null>(null);
  const [monitor, setMonitor] = useState<NativeHLSMonitor | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'playlist' | 'history' | 'segments'>('overview');
  
  // Get playlist and track info from music player context
  const { playlist, currentTrackIndex, currentTrack, audioMetrics, isPlaying, audioEngine } = useMusicPlayer();
  
  // Initialize monitor when component mounts
  useEffect(() => {
    const hlsMonitor = getNativeHLSMonitor({ debug: false });
    setMonitor(hlsMonitor);
    
    // Use provided audio element or find one in the DOM
    const audio = audioElement || findAudioElement();
    
    if (audio) {
      hlsMonitor.start(audio);
    } else {
      // If no audio element yet, try again in a moment
      const retryTimeout = setTimeout(() => {
        const foundAudio = findAudioElement();
        if (foundAudio) {
          hlsMonitor.start(foundAudio);
        }
      }, 1000);
      
      return () => {
        clearTimeout(retryTimeout);
        hlsMonitor.stop();
      };
    }
    
    return () => {
      hlsMonitor.stop();
    };
  }, [audioElement]);
  
  // Update metrics periodically
  useEffect(() => {
    if (!monitor) return;
    
    const updateMetrics = () => {
      setMetrics(monitor.getMetrics());
    };
    
    // Initial update
    updateMetrics();
    
    // Update every 500ms
    const interval = setInterval(updateMetrics, 500);
    
    return () => clearInterval(interval);
  }, [monitor]);
  
  // Restart monitoring
  const handleRestart = useCallback(() => {
    if (monitor && audioElement) {
      monitor.stop();
      monitor.start(audioElement);
    }
  }, [monitor, audioElement]);
  
  // Format duration
  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };
  
  // Format timestamp
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  
  // Get direction icon
  const getDirectionIcon = (direction: TierSwitch['direction']) => {
    switch (direction) {
      case 'upgrade':
        return <TrendingUp className="w-3 h-3 text-green-600" />;
      case 'downgrade':
        return <TrendingDown className="w-3 h-3 text-red-600" />;
      default:
        return <Minus className="w-3 h-3 text-slate-400" />;
    }
  };
  
  // Render quality tier badge
  const renderTierBadge = (tier: QualityTier, size: 'sm' | 'lg' = 'sm') => {
    const config = TIER_CONFIG[tier];
    const sizeClasses = size === 'lg' 
      ? 'px-4 py-2 text-xl font-bold' 
      : 'px-2 py-1 text-xs font-semibold';
    
    return (
      <span className={`${config.bgColor} ${config.color} ${sizeClasses} rounded-lg inline-flex items-center gap-1`}>
        {config.label}
        {size === 'lg' && <span className="text-sm font-normal opacity-75">({config.bitrate})</span>}
      </span>
    );
  };
  
  // Render quality ladder
  const renderQualityLadder = () => {
    const tiers: QualityTier[] = ['premium', 'high', 'medium', 'low'];
    
    return (
      <div className="flex flex-col gap-1">
        {tiers.map((tier) => {
          const config = TIER_CONFIG[tier];
          const isActive = metrics?.currentTier === tier;
          const bandwidth = TIER_BANDWIDTHS[tier];
          
          return (
            <div 
              key={tier}
              className={`flex items-center justify-between px-3 py-2 rounded-lg transition-all ${
                isActive 
                  ? `${config.bgColor} ${config.color} ring-2 ring-offset-1 ring-${config.color.replace('text-', '')}`
                  : 'bg-slate-50 text-slate-400'
              }`}
            >
              <div className="flex items-center gap-2">
                {isActive && <Radio className="w-4 h-4 animate-pulse" />}
                <span className="font-semibold">{config.label}</span>
              </div>
              <div className="text-right">
                <div className="text-sm">{config.bitrate}</div>
                <div className="text-xs opacity-75">{Math.round(bandwidth / 1000)}k bw</div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };
  
  // Render Overview Tab
  const renderOverview = () => {
    if (!metrics) {
      return (
        <div className="flex flex-col items-center justify-center h-48 text-slate-400">
          <Activity className="w-8 h-8 mb-2 animate-pulse" />
          <p>Initializing monitor...</p>
        </div>
      );
    }
    
    return (
      <div className="space-y-4">
        {/* Current Quality - Hero Section */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-4 text-white">
          <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">Current Quality</div>
          <div className="flex items-center justify-between">
            <div>
              {renderTierBadge(metrics.currentTier, 'lg')}
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{metrics.bandwidthDisplay}</div>
              <div className="text-xs text-slate-400">estimated bandwidth</div>
            </div>
          </div>
        </div>
        
        {/* Quality Ladder */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">Quality Ladder</span>
          </div>
          {renderQualityLadder()}
        </div>
        
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Buffer Health */}
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Gauge className="w-4 h-4 text-blue-500" />
              <span className="text-xs text-slate-500">Buffer</span>
            </div>
            <div className="text-xl font-bold text-slate-800">
              {metrics.bufferLength.toFixed(1)}s
            </div>
            {metrics.isStalled && (
              <div className="flex items-center gap-1 mt-1 text-red-600 text-xs">
                <AlertTriangle className="w-3 h-3" />
                Stalled
              </div>
            )}
          </div>
          
          {/* Stall Count */}
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              <span className="text-xs text-slate-500">Stalls</span>
            </div>
            <div className={`text-xl font-bold ${metrics.stallCount > 0 ? 'text-orange-600' : 'text-green-600'}`}>
              {metrics.stallCount}
            </div>
            {metrics.stallCount === 0 && (
              <div className="flex items-center gap-1 mt-1 text-green-600 text-xs">
                <CheckCircle className="w-3 h-3" />
                Smooth
              </div>
            )}
          </div>
          
          {/* Network */}
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-2 mb-2">
              {metrics.connection ? (
                <Wifi className="w-4 h-4 text-green-500" />
              ) : (
                <WifiOff className="w-4 h-4 text-slate-400" />
              )}
              <span className="text-xs text-slate-500">Network</span>
            </div>
            <div className={`text-xl font-bold ${CONNECTION_COLORS[metrics.connection?.effectiveType || 'unknown']}`}>
              {metrics.connection?.effectiveType?.toUpperCase() || 'N/A'}
            </div>
            {metrics.connection && (
              <div className="text-xs text-slate-500 mt-1">
                {metrics.connection.downlink} Mbps • {metrics.connection.rtt}ms
              </div>
            )}
          </div>
          
          {/* Decoded Data */}
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-purple-500" />
              <span className="text-xs text-slate-500">Decoded</span>
            </div>
            <div className="text-xl font-bold text-slate-800">
              {Math.round(metrics.decodedBytesPerSecond / 1024)} KB/s
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {Math.round(metrics.inferredPlaybackBitrate / 1000)} kbps
            </div>
          </div>
        </div>
        
        {/* Tier Switches Summary */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-semibold text-slate-700">Quality Switches</span>
            </div>
            <span className="text-xs bg-slate-100 px-2 py-1 rounded-full text-slate-600">
              {metrics.tierSwitchHistory.length} total
            </span>
          </div>
          {metrics.tierSwitchHistory.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-3">No quality switches yet</p>
          ) : (
            <div className="space-y-2">
              {metrics.tierSwitchHistory.slice(-3).reverse().map((sw, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    {getDirectionIcon(sw.direction)}
                    <span className="text-slate-500">{TIER_CONFIG[sw.fromTier].label}</span>
                    <span className="text-slate-400">→</span>
                    <span className={TIER_CONFIG[sw.toTier].color}>{TIER_CONFIG[sw.toTier].label}</span>
                  </div>
                  <span className="text-xs text-slate-400">{formatTime(sw.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Monitoring Duration */}
        <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
          <Clock className="w-3 h-3" />
          <span>Monitoring for {formatDuration(metrics.monitoringDuration)}</span>
        </div>
      </div>
    );
  };
  
  // Render History Tab
  const renderHistory = () => {
    if (!metrics || metrics.tierSwitchHistory.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-48 text-slate-400">
          <History className="w-8 h-8 mb-2" />
          <p>No quality switches recorded</p>
          <p className="text-xs mt-1">Switches appear as Safari changes quality</p>
        </div>
      );
    }
    
    return (
      <div className="space-y-2">
        {metrics.tierSwitchHistory.slice().reverse().map((sw, i) => (
          <div 
            key={i}
            className={`p-3 rounded-lg border ${
              sw.direction === 'upgrade' 
                ? 'bg-green-50 border-green-200' 
                : sw.direction === 'downgrade'
                ? 'bg-red-50 border-red-200'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getDirectionIcon(sw.direction)}
                <div>
                  <div className="flex items-center gap-2">
                    {renderTierBadge(sw.fromTier)}
                    <span className="text-slate-400">→</span>
                    {renderTierBadge(sw.toTier)}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {sw.direction === 'upgrade' ? '📈 Upgraded' : sw.direction === 'downgrade' ? '📉 Downgraded' : 'No change'}
                  </div>
                </div>
              </div>
              <div className="text-xs text-slate-400">
                {formatTime(sw.timestamp)}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };
  
  // Format seconds to mm:ss
  const formatTimeMMSS = (seconds: number): string => {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Render Playlist Tab
  const renderPlaylist = () => {
    const nextTrack = playlist[currentTrackIndex + 1];
    const currentTime = audioEngine?.getCurrentTime() ?? 0;
    const duration = audioMetrics?.duration ?? 0;
    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
    
    // Prefetch info from metrics
    const prefetchProgress = audioMetrics?.prefetchProgress ?? 0;
    const prefetchReady = (audioMetrics?.prefetchReadyState ?? 0) >= 3; // HAVE_FUTURE_DATA
    const prefetchTrackId = audioMetrics?.prefetchedTrackId;
    
    // Crossfade timing (typically starts at -5s before track end)
    const crossfadeStart = duration > 5 ? duration - 5 : duration;
    const inCrossfadeZone = currentTime >= crossfadeStart && duration > 0;
    const timeToCrossfade = Math.max(0, crossfadeStart - currentTime);
    
    return (
      <div className="space-y-4">
        {/* Current Track Card */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-4 text-white">
          <div className="flex items-center gap-2 mb-3">
            <Play className="w-4 h-4" />
            <span className="text-xs uppercase tracking-wide opacity-80">Now Playing</span>
          </div>
          
          {currentTrack ? (
            <>
              <div className="font-bold text-lg mb-1 line-clamp-1">
                {currentTrack.track_name || 'Unknown Track'}
              </div>
              <div className="text-sm opacity-80 mb-3 line-clamp-1">
                {currentTrack.artist_name || 'Unknown Artist'}
              </div>
              
              {/* Progress Bar */}
              <div className="mb-2">
                <div className="h-2 bg-blue-900/50 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-white rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              
              {/* Time Display */}
              <div className="flex justify-between text-xs opacity-80">
                <span>{formatTimeMMSS(currentTime)}</span>
                <span>{formatTimeMMSS(duration)}</span>
              </div>
              
              {/* Track Details */}
              <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/20 text-xs">
                <div>
                  <span className="opacity-60">Track ID:</span>
                  <span className="ml-1 font-mono">{currentTrack.metadata?.track_id || '-'}</span>
                </div>
                <div>
                  <span className="opacity-60">Position:</span>
                  <span className="ml-1">{currentTrackIndex + 1} / {playlist.length}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-4 opacity-60">
              No track playing
            </div>
          )}
        </div>
        
        {/* Crossfade Status */}
        <div className={`rounded-xl p-4 border ${
          inCrossfadeZone 
            ? 'bg-amber-50 border-amber-200' 
            : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <SkipForward className={`w-4 h-4 ${inCrossfadeZone ? 'text-amber-600' : 'text-slate-500'}`} />
            <span className="text-sm font-semibold text-slate-700">Crossfade Status</span>
          </div>
          
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-slate-400 text-xs">Time to Crossfade</div>
              <div className={`font-semibold ${inCrossfadeZone ? 'text-amber-600' : 'text-slate-700'}`}>
                {inCrossfadeZone ? 'NOW' : formatTimeMMSS(timeToCrossfade)}
              </div>
            </div>
            <div>
              <div className="text-slate-400 text-xs">Crossfade Duration</div>
              <div className="font-semibold text-slate-700">5 sec</div>
            </div>
          </div>
          
          {inCrossfadeZone && (
            <div className="mt-2 text-xs text-amber-600 flex items-center gap-1">
              <Activity className="w-3 h-3 animate-pulse" />
              Crossfade in progress...
            </div>
          )}
        </div>
        
        {/* Startup Latency Card */}
        {audioMetrics?.startupLatency && (
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl border border-purple-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-semibold text-purple-800">Startup Latency</span>
              {audioMetrics.startupLatency.wasPrefetched && (
                <span className="px-2 py-0.5 text-[10px] font-bold bg-green-100 text-green-700 rounded-full">
                  PREFETCHED
                </span>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-2 bg-white/60 rounded-lg">
                <div className="text-purple-500 text-xs">Total Latency</div>
                <div className="font-bold text-purple-800">
                  {audioMetrics.startupLatency.totalLatencyMs > 0 
                    ? `${audioMetrics.startupLatency.totalLatencyMs}ms` 
                    : 'Measuring...'}
                </div>
              </div>
              <div className="p-2 bg-white/60 rounded-lg">
                <div className="text-purple-500 text-xs">Buffering Time</div>
                <div className="font-bold text-purple-800">
                  {audioMetrics.startupLatency.bufferingLatencyMs > 0 
                    ? `${audioMetrics.startupLatency.bufferingLatencyMs}ms` 
                    : '-'}
                </div>
              </div>
            </div>
            
            {/* Latency breakdown bar */}
            {audioMetrics.startupLatency.totalLatencyMs > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-[10px] text-purple-600 mb-1">
                  <span>Play Request</span>
                  <span>First Audio</span>
                </div>
                <div className="h-2 bg-purple-200 rounded-full overflow-hidden flex">
                  <div 
                    className="bg-purple-400 h-full" 
                    style={{ 
                      width: `${Math.min((audioMetrics.startupLatency.bufferingLatencyMs / audioMetrics.startupLatency.totalLatencyMs) * 100, 100)}%` 
                    }}
                    title="Buffering"
                  />
                  <div 
                    className="bg-purple-600 h-full flex-1" 
                    title="Play to first audio"
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-purple-500 mt-1">
                  <span>Buffering</span>
                  <span>Play→Audio</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Next Track / Prefetch Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <ListMusic className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">Up Next (Prefetch)</span>
          </div>
          
          {nextTrack ? (
            <>
              <div className="flex items-start gap-3 mb-3">
                <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
                  <Music className="w-6 h-6 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 line-clamp-1">
                    {nextTrack.track_name || 'Unknown Track'}
                  </div>
                  <div className="text-sm text-slate-500 line-clamp-1">
                    {nextTrack.artist_name || 'Unknown Artist'}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    ID: {nextTrack.metadata?.track_id || '-'}
                  </div>
                </div>
              </div>
              
              {/* Prefetch Progress */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Prefetch Progress</span>
                  <span className={`font-semibold ${prefetchReady ? 'text-green-600' : 'text-slate-600'}`}>
                    {prefetchReady ? 'Ready' : `${Math.round(prefetchProgress * 100)}%`} · State: {audioMetrics?.prefetchReadyState ?? 0}
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-300 ${
                      prefetchReady ? 'bg-green-500' : prefetchProgress > 0 ? 'bg-blue-500' : 'bg-slate-300'
                    }`}
                    style={{ width: `${Math.max(Math.min(prefetchProgress * 100, 100), prefetchProgress > 0 ? 5 : 0)}%` }}
                  />
                </div>
                
                {/* Prefetch Status */}
                <div className="flex items-center gap-2 text-xs">
                  {prefetchReady ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-green-600" />
                      <span className="text-green-600">Ready for seamless playback</span>
                    </>
                  ) : prefetchProgress > 0 ? (
                    <>
                      <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />
                      <span className="text-blue-600">Loading next track... ({Math.round(prefetchProgress * 100)}%)</span>
                    </>
                  ) : prefetchTrackId ? (
                    <>
                      <Loader2 className="w-3 h-3 text-slate-400 animate-spin" />
                      <span className="text-slate-500">Resolving URL for {prefetchTrackId}...</span>
                    </>
                  ) : (
                    <>
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span className="text-slate-500">Waiting to prefetch</span>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-4 text-slate-400">
              <ListMusic className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No more tracks in playlist</p>
            </div>
          )}
        </div>
        
        {/* Playlist Stats */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <ListMusic className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">Playlist Info</span>
          </div>
          
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-2 bg-slate-50 rounded-lg">
              <div className="text-slate-400 text-xs">Total Tracks</div>
              <div className="font-semibold text-slate-700">{playlist.length}</div>
            </div>
            <div className="p-2 bg-slate-50 rounded-lg">
              <div className="text-slate-400 text-xs">Remaining</div>
              <div className="font-semibold text-slate-700">{Math.max(0, playlist.length - currentTrackIndex - 1)}</div>
            </div>
            <div className="p-2 bg-slate-50 rounded-lg">
              <div className="text-slate-400 text-xs">Playback State</div>
              <div className={`font-semibold ${isPlaying ? 'text-green-600' : 'text-slate-500'}`}>
                {isPlaying ? 'Playing' : 'Paused'}
              </div>
            </div>
            <div className="p-2 bg-slate-50 rounded-lg">
              <div className="text-slate-400 text-xs">Audio Element</div>
              <div className="font-semibold text-slate-700 font-mono text-xs">
                {audioMetrics?.audioElement || '-'}
              </div>
            </div>
          </div>
        </div>
        
        {/* Upcoming Tracks Preview */}
        {playlist.length > currentTrackIndex + 1 && (
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <ListMusic className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-semibold text-slate-700">Queue Preview</span>
              <span className="text-xs text-slate-400">(next 5)</span>
            </div>
            
            <div className="space-y-2">
              {playlist.slice(currentTrackIndex + 1, currentTrackIndex + 6).map((track, i) => (
                <div 
                  key={track.metadata?.track_id || i}
                  className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg"
                >
                  <span className="text-xs text-slate-400 w-4">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-700 truncate">{track.track_name}</div>
                    <div className="text-xs text-slate-400 truncate">{track.artist_name}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };
  
  // Render Segments Tab
  const renderSegments = () => {
    if (!metrics || metrics.segmentHistory.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-48 text-slate-400">
          <Layers className="w-8 h-8 mb-2" />
          <p>No segments loaded yet</p>
          <p className="text-xs mt-1">Start playback to see segment data</p>
        </div>
      );
    }
    
    return (
      <div className="space-y-2">
        {metrics.segmentHistory.slice().reverse().map((seg, i) => {
          const config = TIER_CONFIG[seg.tier];
          return (
            <div 
              key={i}
              className="p-3 bg-white rounded-lg border border-slate-200"
            >
              <div className="flex items-center justify-between mb-2">
                {renderTierBadge(seg.tier)}
                <span className="text-xs text-slate-400">{formatTime(seg.startTime)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-slate-400">Download</div>
                  <div className="font-semibold text-slate-700">{seg.downloadTime.toFixed(0)}ms</div>
                </div>
                <div>
                  <div className="text-slate-400">Size {seg.isEstimatedSize && <span className="text-slate-300">~</span>}</div>
                  <div className="font-semibold text-slate-700">
                    {seg.transferSize > 0 
                      ? `${seg.isEstimatedSize ? '~' : ''}${Math.round(seg.transferSize / 1024)}KB` 
                      : '-'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Speed {seg.isEstimatedSize && <span className="text-slate-300">~</span>}</div>
                  <div className="font-semibold text-slate-700">
                    {seg.estimatedBandwidth > 0 
                      ? `${seg.isEstimatedSize ? '~' : ''}${(seg.estimatedBandwidth / 8_000_000).toFixed(1)} MB/s` 
                      : '-'}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };
  
  return (
    <div className="fixed inset-0 bg-slate-100 z-50 flex flex-col safe-area-inset">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Radio className="w-5 h-5 text-blue-600" />
          <div>
            <h1 className="text-lg font-bold text-slate-800">HLS Monitor</h1>
            <p className="text-xs text-slate-500">Native playback diagnostics</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRestart}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            title="Restart monitoring"
          >
            <RefreshCw className="w-5 h-5 text-slate-500" />
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>
      </div>
      
      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 px-4">
        <div className="flex gap-1 overflow-x-auto">
          {(['overview', 'playlist', 'history', 'segments'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'playlist' && renderPlaylist()}
        {activeTab === 'history' && renderHistory()}
        {activeTab === 'segments' && renderSegments()}
      </div>
      
      {/* Footer */}
      <div className="bg-white border-t border-slate-200 px-4 py-2 text-center">
        <p className="text-xs text-slate-400">
          Data inferred from network activity • Native HLS mode
        </p>
      </div>
    </div>
  );
}


import { X, Activity, Wifi, WifiOff, Radio, AlertCircle, CheckCircle, Clock, TrendingUp, Zap, Move, Link, Layers, PlayCircle, Server, Gauge, Heart } from 'lucide-react';
import { AudioMetrics } from '../lib/enterpriseAudioEngine';
import type { AudioEngineType } from '../contexts/MusicPlayerContext';
import { useState, useEffect, useRef } from 'react';

type AudioEngineDiagnosticsProps = {
  metrics: AudioMetrics | null;
  onClose: () => void;
  engineType?: AudioEngineType;
  isStreamingEngine?: boolean;
};

export function AudioEngineDiagnostics({ metrics, onClose, engineType = 'auto', isStreamingEngine = false }: AudioEngineDiagnosticsProps) {
  const [, setTick] = useState(0);
  const [position, setPosition] = useState({ x: window.innerWidth - 920, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick(prev => prev + 1);
    }, 250);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (dragRef.current) {
      const rect = dragRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      setIsDragging(true);
    }
  };

  if (!metrics) {
    return (
      <div
        ref={dragRef}
        style={{ left: `${position.x}px`, top: `${position.y}px` }}
        className="fixed bg-white border-2 border-slate-300 rounded-2xl shadow-2xl p-6 w-[400px] z-50"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Move className="w-4 h-4 text-slate-400 cursor-move" onMouseDown={handleMouseDown} />
            <h3 className="text-lg font-bold text-slate-900">Audio Engine Diagnostics</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>
        <div className="text-center text-slate-500 py-8">
          No audio engine active
        </div>
      </div>
    );
  }

  const getStatusColor = (state: string) => {
    if (state === 'playing') return 'text-green-600';
    if (state === 'loading' || state === 'paused') return 'text-yellow-600';
    if (state === 'error') return 'text-red-600';
    return 'text-slate-600';
  };

  const getConnectionQualityColor = (quality: string) => {
    switch (quality) {
      case 'excellent': return 'text-green-600 bg-green-50';
      case 'good': return 'text-blue-600 bg-blue-50';
      case 'fair': return 'text-yellow-600 bg-yellow-50';
      case 'poor': return 'text-orange-600 bg-orange-50';
      case 'offline': return 'text-red-600 bg-red-50';
      default: return 'text-slate-600 bg-slate-50';
    }
  };

  const getCircuitBreakerColor = (state: string) => {
    switch (state) {
      case 'closed': return 'text-green-600 bg-green-50';
      case 'half-open': return 'text-yellow-600 bg-yellow-50';
      case 'open': return 'text-red-600 bg-red-50';
      default: return 'text-slate-600 bg-slate-50';
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatBitrate = (bps: number) => {
    if (bps >= 1000000) return `${(bps / 1000000).toFixed(1)} Mbps`;
    if (bps >= 1000) return `${Math.round(bps / 1000)} kbps`;
    return `${bps} bps`;
  };

  // Determine delivery source from URL
  const getDeliverySource = (url: string | null): { source: string; type: 'hls' | 'mp3' | 'unknown' } => {
    if (!url) return { source: 'None', type: 'unknown' };
    if (url.includes('.m3u8') || url.includes('audio-hls')) {
      return { source: 'Supabase HLS', type: 'hls' };
    }
    if (url.includes('r2.dev') || url.includes('cloudflare')) {
      return { source: 'Cloudflare CDN', type: 'mp3' };
    }
    if (url.includes('supabase')) {
      return { source: 'Supabase Storage', type: 'mp3' };
    }
    return { source: 'Unknown', type: 'unknown' };
  };

  // Calculate overall health score (0-100)
  const calculateHealthScore = (): { score: number; status: 'excellent' | 'good' | 'fair' | 'poor' } => {
    if (!metrics) return { score: 0, status: 'poor' };
    
    let score = 100;
    
    // Deduct for failures
    if (metrics.failureCount > 0) score -= Math.min(metrics.failureCount * 10, 30);
    
    // Deduct for stalls
    if (metrics.stallCount > 0) score -= Math.min(metrics.stallCount * 5, 20);
    
    // Deduct for poor connection
    if (metrics.connectionQuality === 'poor') score -= 20;
    else if (metrics.connectionQuality === 'fair') score -= 10;
    else if (metrics.connectionQuality === 'offline') score -= 50;
    
    // Deduct for circuit breaker state
    if (metrics.circuitBreakerState === 'open') score -= 30;
    else if (metrics.circuitBreakerState === 'half-open') score -= 15;
    
    // HLS-specific deductions
    const hls = metrics.hls;
    if (hls?.isHLSActive) {
      // Buffer health
      const bufferRatio = hls.bufferLength / hls.targetBuffer;
      if (bufferRatio < 0.3) score -= 15;
      else if (bufferRatio < 0.5) score -= 5;
      
      // Fragment failures
      const totalFrags = hls.fragmentStats.loaded + hls.fragmentStats.failed;
      if (totalFrags > 0) {
        const failRate = hls.fragmentStats.failed / totalFrags;
        if (failRate > 0.1) score -= 20;
        else if (failRate > 0.05) score -= 10;
      }
    }
    
    score = Math.max(0, Math.min(100, score));
    
    if (score >= 90) return { score, status: 'excellent' };
    if (score >= 70) return { score, status: 'good' };
    if (score >= 50) return { score, status: 'fair' };
    return { score, status: 'poor' };
  };

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'excellent': return 'text-green-600 bg-green-50 border-green-200';
      case 'good': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'fair': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'poor': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-slate-600 bg-slate-50 border-slate-200';
    }
  };

  const deliveryInfo = getDeliverySource(metrics?.currentTrackUrl || null);
  const healthInfo = calculateHealthScore();
  const hlsMetrics = metrics?.hls;

  const exportDiagnostics = () => {
    const data = JSON.stringify(metrics, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audio-diagnostics-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      ref={dragRef}
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      className="fixed bg-white border-2 border-slate-300 rounded-2xl shadow-2xl w-[900px] z-50 select-none"
    >
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-slate-200 p-4 rounded-t-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Move
              className="w-5 h-5 text-slate-400 cursor-move hover:text-slate-600"
              onMouseDown={handleMouseDown}
              title="Drag to move"
            />
            <Activity className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-bold text-slate-900">Audio Engine Diagnostics</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportDiagnostics}
              className="px-3 py-1 text-xs font-bold bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Export
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>
        </div>
      </div>

      {/* Content - Grid Layout */}
      <div className="p-4 grid grid-cols-3 gap-3">
        {/* Row 1: Status, Network, Storage */}
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-700 uppercase">Status</span>
            <span className={`text-sm font-bold ${getStatusColor(metrics.playbackState)}`}>
              {metrics.playbackState.toUpperCase()}
            </span>
          </div>
          <div className="text-xs text-slate-600 font-mono truncate" title={metrics.currentTrackId || 'No track'}>
            {metrics.currentTrackId || 'No track loaded'}
          </div>
        </div>

        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            {metrics.isOnline ? (
              <Wifi className="w-4 h-4 text-green-600" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-600" />
            )}
            <span className="text-xs font-bold text-slate-700">Network</span>
          </div>
          <div className={`text-xs font-bold px-2 py-1 rounded ${getConnectionQualityColor(metrics.connectionQuality)}`}>
            {metrics.connectionQuality.toUpperCase()}
          </div>
        </div>

        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <Radio className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-bold text-slate-700">Storage</span>
          </div>
          <div className="text-xs font-bold text-slate-900 truncate" title={metrics.storageBackend}>
            {metrics.storageBackend}
          </div>
        </div>

        {/* Row 2: Retry Status (spans full width if active) */}
        {metrics.retryAttempt > 0 && (
          <div className="col-span-3 bg-amber-50 border-2 border-amber-200 rounded-xl p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-bold text-amber-900">RETRY IN PROGRESS</span>
              </div>
              <div className="flex gap-4 text-xs">
                <span className="text-amber-700">Attempt: <span className="font-bold text-amber-900">{metrics.retryAttempt}/{metrics.maxRetries}</span></span>
                {metrics.nextRetryIn > 0 && (
                  <span className="text-amber-700">Next: <span className="font-bold text-amber-900">{Math.ceil(metrics.nextRetryIn / 1000)}s</span></span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Row 3: Error (spans full width if present) */}
        {metrics.error && (
          <div className="col-span-3 bg-red-50 border-2 border-red-200 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <span className="text-xs font-bold text-red-900">ERROR</span>
              <span className="text-xs text-red-600 font-mono ml-auto">
                {metrics.errorCategory || 'unknown'}
              </span>
            </div>
            <div className="text-xs text-red-700">{metrics.error}</div>
          </div>
        )}

        {/* Row 4: Circuit Breaker, Performance, Buffer */}
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-purple-600" />
            <span className="text-xs font-bold text-slate-700">Circuit Breaker</span>
          </div>
          <div className="space-y-1">
            <div className={`text-xs font-bold px-2 py-1 rounded ${getCircuitBreakerColor(metrics.circuitBreakerState)}`}>
              {metrics.circuitBreakerState.toUpperCase()}
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">F/S:</span>
              <span className="font-bold">
                <span className="text-red-600">{metrics.failureCount}</span>
                <span className="text-slate-400">/</span>
                <span className="text-green-600">{metrics.successCount}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-bold text-slate-700">Performance</span>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600">Load:</span>
              <span className="font-bold">{Math.round(metrics.loadDuration)}ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Bandwidth:</span>
              <span className="font-bold">{metrics.estimatedBandwidth} kbps</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Success:</span>
              <span className={`font-bold ${metrics.sessionSuccessRate >= 95 ? 'text-green-600' : metrics.sessionSuccessRate >= 80 ? 'text-yellow-600' : 'text-red-600'}`}>
                {metrics.sessionSuccessRate}%
              </span>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-green-600" />
            <span className="text-xs font-bold text-slate-700">Buffer</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-600">Buffered:</span>
              <span className="font-bold">{Math.round(metrics.bufferPercentage)}%</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div
                className="bg-green-600 h-full rounded-full transition-all"
                style={{ width: `${Math.min(metrics.bufferPercentage, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">{formatBytes(metrics.bytesLoaded)}</span>
              <span className="text-slate-600">{formatBytes(metrics.totalBytes)}</span>
            </div>
          </div>
        </div>

        {/* Row 5: Playback, Stats */}
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-bold text-slate-700">Playback</span>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600">Time:</span>
              <span className="font-bold font-mono">
                {formatTime(metrics.currentTime)} / {formatTime(metrics.duration)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Volume:</span>
              <span className="font-bold">{Math.round(metrics.volume * 100)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Element:</span>
              <span className="font-bold">{metrics.audioElement?.toUpperCase() || 'NONE'}</span>
            </div>
          </div>
        </div>

        <div className="col-span-2 bg-slate-50 rounded-xl p-3 border border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-slate-600" />
            <span className="text-xs font-bold text-slate-700">Status Flags</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600">Waiting:</span>
              <span className={`font-bold ${metrics.isWaiting ? 'text-yellow-600' : 'text-slate-400'}`}>
                {metrics.isWaiting ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Stalled:</span>
              <span className={`font-bold ${metrics.isStalled ? 'text-red-600' : 'text-slate-400'}`}>
                {metrics.isStalled ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">MediaSess:</span>
              <span className={`font-bold ${metrics.mediaSessionActive ? 'text-green-600' : 'text-slate-400'}`}>
                {metrics.mediaSessionActive ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Stalls:</span>
              <span className="font-bold text-orange-600">{metrics.stallCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Recovery:</span>
              <span className="font-bold text-orange-600">{metrics.recoveryAttempts}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Ready:</span>
              <span className="font-bold text-slate-600">{metrics.readyState}</span>
            </div>
          </div>
        </div>

        {/* Row 6: Audio URLs */}
        <div className="col-span-3 bg-slate-50 rounded-xl p-3 border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <Link className="w-4 h-4 text-slate-600" />
            <span className="text-xs font-bold text-slate-700">Audio URLs</span>
          </div>
          <div className="space-y-2">
            {/* Current Track URL */}
            <div>
              <div className="text-xs font-bold text-slate-600 mb-1">Current Track:</div>
              {metrics.currentTrackUrl ? (
                <div className="bg-white border border-slate-200 rounded-lg p-2">
                  <div className="text-xs font-mono text-slate-900 break-all">
                    {metrics.currentTrackUrl}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic">No track loaded</div>
              )}
            </div>

            {/* Prefetch Track URL */}
            <div>
              <div className="text-xs font-bold text-slate-600 mb-1">Prefetch Track:</div>
              {metrics.prefetchedTrackUrl ? (
                <div className="bg-white border border-blue-200 rounded-lg p-2">
                  <div className="text-xs font-mono text-slate-900 break-all">
                    {metrics.prefetchedTrackUrl}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic">No prefetch active</div>
              )}
            </div>
          </div>
        </div>

        {/* Row 7: Prefetch (only if active) */}
        {metrics.prefetchedTrackId && (
          <div className="col-span-3 bg-blue-50 rounded-xl p-3 border border-blue-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold text-blue-900">PREFETCH</span>
                <span className="text-xs text-blue-700 font-mono truncate max-w-md" title={metrics.prefetchedTrackId}>
                  {metrics.prefetchedTrackId}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-blue-700">Progress: <span className="font-bold text-blue-900">{Math.round(metrics.prefetchProgress)}%</span></span>
                <span className="text-xs text-blue-700">Ready: <span className="font-bold text-blue-900">{metrics.prefetchReadyState}</span></span>
              </div>
            </div>
          </div>
        )}

        {/* Streaming Engine Section Header */}
        <div className="col-span-3 border-t border-slate-200 pt-3 mt-1">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-5 h-5 text-indigo-600" />
            <h4 className="text-sm font-bold text-slate-900">Streaming Engine</h4>
            {hlsMetrics?.isHLSActive && (
              <span className="px-2 py-0.5 text-xs font-bold bg-indigo-100 text-indigo-700 rounded-full">
                HLS ACTIVE
              </span>
            )}
            {isStreamingEngine && !hlsMetrics?.isHLSActive && (
              <span className="px-2 py-0.5 text-xs font-bold bg-amber-100 text-amber-700 rounded-full">
                MP3 FALLBACK
              </span>
            )}
          </div>
        </div>

        {/* Row 8: Delivery Source Card */}
        <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-200">
          <div className="flex items-center gap-2 mb-2">
            <Server className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-bold text-slate-700">Delivery Source</span>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-600">Engine:</span>
              <span className={`font-bold ${isStreamingEngine ? 'text-indigo-600' : 'text-slate-600'}`}>
                {isStreamingEngine ? 'Streaming' : 'Legacy'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Format:</span>
              <span className={`font-bold ${deliveryInfo.type === 'hls' ? 'text-indigo-600' : deliveryInfo.type === 'mp3' ? 'text-blue-600' : 'text-slate-400'}`}>
                {deliveryInfo.type === 'hls' ? 'HLS' : deliveryInfo.type === 'mp3' ? 'MP3' : 'None'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Source:</span>
              <span className="font-bold text-slate-900 truncate max-w-[120px]" title={deliveryInfo.source}>
                {deliveryInfo.source}
              </span>
            </div>
            {hlsMetrics?.isHLSActive && (
              <div className="flex justify-between">
                <span className="text-slate-600">HLS Mode:</span>
                <span className="font-bold text-indigo-600">
                  {hlsMetrics.isNativeHLS ? 'Native (Safari)' : 'hls.js'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Row 9: HLS Quality Card (only when HLS active) */}
        {hlsMetrics?.isHLSActive ? (
          <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-200">
            <div className="flex items-center gap-2 mb-2">
              <Gauge className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-bold text-slate-700">HLS Quality</span>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-600">Level:</span>
                <span className="font-bold text-indigo-600">
                  {hlsMetrics.currentLevel >= 0 ? `Level ${hlsMetrics.currentLevel}` : 'Auto'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Bandwidth:</span>
                <span className="font-bold text-slate-900">
                  {formatBitrate(hlsMetrics.bandwidthEstimate)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Levels:</span>
                <span className="font-bold text-slate-600">
                  {hlsMetrics.levels.length > 0 ? hlsMetrics.levels.length : '-'}
                </span>
              </div>
              {hlsMetrics.levels.length > 0 && (
                <div className="mt-1 pt-1 border-t border-indigo-200">
                  <div className="text-slate-500 text-[10px]">
                    {hlsMetrics.levels.map((l, i) => (
                      <span key={i} className={`${i === hlsMetrics.currentLevel ? 'text-indigo-600 font-bold' : ''}`}>
                        {formatBitrate(l.bitrate)}{i < hlsMetrics.levels.length - 1 ? ' • ' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
            <div className="flex items-center gap-2 mb-2">
              <Gauge className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-bold text-slate-400">HLS Quality</span>
            </div>
            <div className="text-xs text-slate-400 italic text-center py-2">
              Not using HLS
            </div>
          </div>
        )}

        {/* Row 10: Health Summary Card */}
        <div className={`rounded-xl p-3 border ${getHealthColor(healthInfo.status)}`}>
          <div className="flex items-center gap-2 mb-2">
            <Heart className="w-4 h-4" />
            <span className="text-xs font-bold">Playback Health</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">{healthInfo.score}</span>
              <span className="text-xs font-bold uppercase">{healthInfo.status}</span>
            </div>
            <div className="w-full bg-white/50 rounded-full h-2">
              <div
                className={`h-full rounded-full transition-all ${
                  healthInfo.status === 'excellent' ? 'bg-green-500' :
                  healthInfo.status === 'good' ? 'bg-blue-500' :
                  healthInfo.status === 'fair' ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${healthInfo.score}%` }}
              />
            </div>
          </div>
        </div>

        {/* Row 11: HLS Buffer Card (only when HLS active) */}
        {hlsMetrics?.isHLSActive && (
          <div className="col-span-3 bg-indigo-50 rounded-xl p-3 border border-indigo-200">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-bold text-slate-700">HLS Buffer</span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-slate-600 mb-1">Buffer Length</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold text-indigo-600">
                    {hlsMetrics.bufferLength.toFixed(1)}s
                  </span>
                  <span className="text-xs text-slate-500">/ {hlsMetrics.targetBuffer}s</span>
                </div>
                <div className="w-full bg-indigo-200 rounded-full h-1.5 mt-1">
                  <div
                    className={`h-full rounded-full transition-all ${
                      hlsMetrics.bufferLength / hlsMetrics.targetBuffer > 0.5 ? 'bg-indigo-600' :
                      hlsMetrics.bufferLength / hlsMetrics.targetBuffer > 0.25 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min((hlsMetrics.bufferLength / hlsMetrics.targetBuffer) * 100, 100)}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-600 mb-1">Segments Buffered</div>
                <span className="text-lg font-bold text-slate-900">{hlsMetrics.bufferedSegments}</span>
              </div>
              <div>
                <div className="text-xs text-slate-600 mb-1">Latency</div>
                <span className="text-lg font-bold text-slate-900">{Math.round(hlsMetrics.latency)}ms</span>
              </div>
            </div>
          </div>
        )}

        {/* Row 12: HLS Fragment Stats (only when HLS active) */}
        {hlsMetrics?.isHLSActive && (
          <div className="col-span-3 bg-indigo-50 rounded-xl p-3 border border-indigo-200">
            <div className="flex items-center gap-2 mb-2">
              <PlayCircle className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-bold text-slate-700">HLS Fragment Stats</span>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-slate-600 mb-1">Loaded</div>
                <span className="text-lg font-bold text-green-600">{hlsMetrics.fragmentStats.loaded}</span>
              </div>
              <div>
                <div className="text-xs text-slate-600 mb-1">Failed</div>
                <span className={`text-lg font-bold ${hlsMetrics.fragmentStats.failed > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                  {hlsMetrics.fragmentStats.failed}
                </span>
              </div>
              <div>
                <div className="text-xs text-slate-600 mb-1">Retried</div>
                <span className={`text-lg font-bold ${hlsMetrics.fragmentStats.retried > 0 ? 'text-yellow-600' : 'text-slate-400'}`}>
                  {hlsMetrics.fragmentStats.retried}
                </span>
              </div>
              <div>
                <div className="text-xs text-slate-600 mb-1">Success Rate</div>
                {(() => {
                  const total = hlsMetrics.fragmentStats.loaded + hlsMetrics.fragmentStats.failed;
                  const rate = total > 0 ? ((hlsMetrics.fragmentStats.loaded / total) * 100).toFixed(1) : '100.0';
                  return (
                    <span className={`text-lg font-bold ${parseFloat(rate) >= 99 ? 'text-green-600' : parseFloat(rate) >= 95 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {rate}%
                    </span>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

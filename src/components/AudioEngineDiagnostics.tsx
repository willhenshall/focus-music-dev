import { X, Activity, Radio, AlertCircle, CheckCircle, Clock, TrendingUp, Zap, Move, Link, Layers, PlayCircle, Server, Gauge, Heart, Copy, Check } from 'lucide-react';
import type { AudioMetrics } from '../lib/types/audioEngine';
import type { AudioEngineType } from '../contexts/MusicPlayerContext';
import { useState, useEffect, useRef } from 'react';

type AudioEngineDiagnosticsProps = {
  metrics: AudioMetrics | null;
  onClose: () => void;
  engineType?: AudioEngineType;
  isStreamingEngine?: boolean;
};

export function AudioEngineDiagnostics({ metrics, onClose, engineType: _engineType = 'auto', isStreamingEngine = false }: AudioEngineDiagnosticsProps) {
  const [, setTick] = useState(0);
  const [position, setPosition] = useState({ x: window.innerWidth - 820, y: 60 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [copiedUrl, setCopiedUrl] = useState<'current' | 'prefetch' | null>(null);
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

  const copyToClipboard = async (url: string, type: 'current' | 'prefetch') => {
    await navigator.clipboard.writeText(url);
    setCopiedUrl(type);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  if (!metrics) {
    return (
      <div
        ref={dragRef}
        style={{ left: `${position.x}px`, top: `${position.y}px` }}
        className="fixed bg-white border-2 border-slate-300 rounded-xl shadow-2xl p-4 w-[360px] z-50"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div onMouseDown={handleMouseDown} className="cursor-move">
              <Move className="w-4 h-4 text-slate-400" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Audio Engine Diagnostics</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>
        <div className="text-center text-slate-500 py-6 text-sm">
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

  // Compact stat row component
  const StatRow = ({ label, value, valueClass = '' }: { label: string; value: string | number; valueClass?: string }) => (
    <div className="flex justify-between items-center">
      <span className="text-[10px] text-slate-500">{label}</span>
      <span className={`text-[11px] font-semibold ${valueClass || 'text-slate-900'}`}>{value}</span>
    </div>
  );

  return (
    <div
      ref={dragRef}
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      className="fixed bg-white border border-slate-300 rounded-xl shadow-2xl w-[800px] z-50 select-none"
    >
      {/* Compact Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-slate-50 rounded-t-xl">
        <div className="flex items-center gap-2">
          <div
            className="cursor-move hover:bg-slate-100 rounded p-0.5"
            onMouseDown={handleMouseDown}
            title="Drag to move"
          >
            <Move className="w-4 h-4 text-slate-400 hover:text-slate-600" />
          </div>
          <Activity className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-bold text-slate-900">Audio Engine Diagnostics</h3>
        </div>
        <div className="flex items-center gap-3">
          {/* Quick Status Pills */}
          <div className="flex items-center gap-1.5">
            <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${getStatusColor(metrics.playbackState)} bg-opacity-10`}>
              {metrics.playbackState.toUpperCase()}
            </span>
            <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${getConnectionQualityColor(metrics.connectionQuality)}`}>
              {metrics.connectionQuality.toUpperCase()}
            </span>
            {hlsMetrics?.isHLSActive && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-700 rounded">
                HLS
              </span>
            )}
          </div>
          <button
            onClick={exportDiagnostics}
            className="px-2 py-1 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 rounded transition-colors"
          >
            Export
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-200 rounded transition-colors"
          >
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      </div>

      {/* Content - Compact Grid */}
      <div className="p-2 max-h-[580px] overflow-y-auto">
        {/* Alert Banners (Retry / Error) - only show if active */}
        {(metrics.retryAttempt > 0 || metrics.error) && (
          <div className="space-y-1.5 mb-2">
            {metrics.retryAttempt > 0 && (
              <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="w-3 h-3 text-amber-600" />
                  <span className="text-[10px] font-bold text-amber-900">RETRY</span>
                </div>
                <span className="text-[10px] text-amber-700">
                  Attempt <span className="font-bold">{metrics.retryAttempt}/{metrics.maxRetries}</span>
                  {metrics.nextRetryIn > 0 && <> · Next in <span className="font-bold">{Math.ceil(metrics.nextRetryIn / 1000)}s</span></>}
                </span>
              </div>
            )}
            {metrics.error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="w-3 h-3 text-red-600" />
                    <span className="text-[10px] font-bold text-red-900">ERROR</span>
                  </div>
                  <span className="text-[10px] text-red-600 font-mono">{metrics.errorCategory || 'unknown'}</span>
                </div>
                <div className="text-[10px] text-red-700 mt-0.5 truncate" title={metrics.error}>{metrics.error}</div>
              </div>
            )}
          </div>
        )}

        {/* Main 4-Column Grid */}
        <div className="grid grid-cols-4 gap-1.5">
          {/* Card: Circuit Breaker */}
          <div className="bg-slate-50 rounded-lg p-2 border border-slate-200">
            <div className="flex items-center gap-1 mb-1.5">
              <Zap className="w-3 h-3 text-purple-600" />
              <span className="text-[10px] font-bold text-slate-600 uppercase">Circuit Breaker</span>
            </div>
            <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded inline-block mb-1 ${getCircuitBreakerColor(metrics.circuitBreakerState)}`}>
              {metrics.circuitBreakerState.toUpperCase()}
            </div>
            <StatRow label="F/S" value={`${metrics.failureCount}/${metrics.successCount}`} valueClass={metrics.failureCount > 0 ? 'text-red-600' : 'text-green-600'} />
          </div>

          {/* Card: Performance */}
          <div className="bg-slate-50 rounded-lg p-2 border border-slate-200">
            <div className="flex items-center gap-1 mb-1.5">
              <TrendingUp className="w-3 h-3 text-blue-600" />
              <span className="text-[10px] font-bold text-slate-600 uppercase">Performance</span>
            </div>
            <StatRow label="Load" value={`${Math.round(metrics.loadDuration)}ms`} />
            <StatRow label="Bandwidth" value={`${metrics.estimatedBandwidth} kbps`} />
            <StatRow label="Success" value={`${metrics.sessionSuccessRate}%`} valueClass={metrics.sessionSuccessRate >= 95 ? 'text-green-600' : metrics.sessionSuccessRate >= 80 ? 'text-yellow-600' : 'text-red-600'} />
          </div>

          {/* Card: Buffer */}
          <div className="bg-slate-50 rounded-lg p-2 border border-slate-200">
            <div className="flex items-center gap-1 mb-1.5">
              <Clock className="w-3 h-3 text-green-600" />
              <span className="text-[10px] font-bold text-slate-600 uppercase">Buffer</span>
            </div>
            <div className="flex items-center gap-1 mb-1">
              <span className="text-[11px] font-bold">{Math.round(metrics.bufferPercentage)}%</span>
              <div className="flex-1 bg-slate-200 rounded-full h-1.5">
                <div
                  className="bg-green-500 h-full rounded-full transition-all"
                  style={{ width: `${Math.min(metrics.bufferPercentage, 100)}%` }}
                />
              </div>
            </div>
            <StatRow label="Loaded" value={formatBytes(metrics.bytesLoaded)} />
            <StatRow label="Total" value={formatBytes(metrics.totalBytes)} />
          </div>

          {/* Card: Playback Health */}
          <div className={`rounded-lg p-2 border ${getHealthColor(healthInfo.status)}`}>
            <div className="flex items-center gap-1 mb-1.5">
              <Heart className="w-3 h-3" />
              <span className="text-[10px] font-bold uppercase">Health</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold">{healthInfo.score}</span>
              <div className="flex-1">
                <div className="text-[10px] font-bold uppercase mb-0.5">{healthInfo.status}</div>
                <div className="w-full bg-white/50 rounded-full h-1.5">
                  <div
                    className={`h-full rounded-full ${
                      healthInfo.status === 'excellent' ? 'bg-green-500' :
                      healthInfo.status === 'good' ? 'bg-blue-500' :
                      healthInfo.status === 'fair' ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${healthInfo.score}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card: Playback Info */}
          <div className="bg-slate-50 rounded-lg p-2 border border-slate-200">
            <div className="flex items-center gap-1 mb-1.5">
              <CheckCircle className="w-3 h-3 text-blue-600" />
              <span className="text-[10px] font-bold text-slate-600 uppercase">Playback</span>
            </div>
            <StatRow label="Time" value={`${formatTime(metrics.currentTime)} / ${formatTime(metrics.duration)}`} />
            <StatRow label="Volume" value={`${Math.round(metrics.volume * 100)}%`} />
            <StatRow label="Element" value={metrics.audioElement?.toUpperCase() || 'NONE'} />
          </div>

          {/* Card: Status Flags - spans 2 columns */}
          <div className="col-span-2 bg-slate-50 rounded-lg p-2 border border-slate-200">
            <div className="flex items-center gap-1 mb-1.5">
              <Activity className="w-3 h-3 text-slate-600" />
              <span className="text-[10px] font-bold text-slate-600 uppercase">Status Flags</span>
            </div>
            <div className="grid grid-cols-3 gap-x-3 gap-y-0.5">
              <StatRow label="Waiting" value={metrics.isWaiting ? 'Yes' : 'No'} valueClass={metrics.isWaiting ? 'text-yellow-600' : 'text-slate-400'} />
              <StatRow label="Stalled" value={metrics.isStalled ? 'Yes' : 'No'} valueClass={metrics.isStalled ? 'text-red-600' : 'text-slate-400'} />
              <StatRow label="MediaSess" value={metrics.mediaSessionActive ? 'Yes' : 'No'} valueClass={metrics.mediaSessionActive ? 'text-green-600' : 'text-slate-400'} />
              <StatRow label="Stalls" value={metrics.stallCount} valueClass="text-orange-600" />
              <StatRow label="Recovery" value={metrics.recoveryAttempts} valueClass="text-orange-600" />
              <StatRow label="Ready" value={metrics.readyState} />
            </div>
          </div>

          {/* Card: Storage */}
          <div className="bg-slate-50 rounded-lg p-2 border border-slate-200">
            <div className="flex items-center gap-1 mb-1.5">
              <Radio className="w-3 h-3 text-blue-600" />
              <span className="text-[10px] font-bold text-slate-600 uppercase">Storage</span>
            </div>
            <div className="text-[11px] font-semibold text-slate-900 truncate" title={metrics.storageBackend}>
              {metrics.storageBackend}
            </div>
            <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5" title={metrics.currentTrackId || ''}>
              {metrics.currentTrackId || 'No track'}
            </div>
          </div>
        </div>

        {/* URLs Section - Compact single-line with copy */}
        <div className="mt-2 bg-slate-50 rounded-lg p-2 border border-slate-200">
          <div className="flex items-center gap-1 mb-1.5">
            <Link className="w-3 h-3 text-slate-600" />
            <span className="text-[10px] font-bold text-slate-600 uppercase">Audio URLs</span>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 w-14 flex-shrink-0">Current:</span>
              {metrics.currentTrackUrl ? (
                <>
                  <div className="flex-1 bg-white border border-slate-200 rounded px-1.5 py-0.5 overflow-hidden">
                    <span className="text-[10px] font-mono text-slate-700 truncate block">{metrics.currentTrackUrl}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(metrics.currentTrackUrl!, 'current')}
                    className="p-1 hover:bg-slate-200 rounded transition-colors flex-shrink-0"
                    title="Copy URL"
                  >
                    {copiedUrl === 'current' ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3 text-slate-400" />}
                  </button>
                </>
              ) : (
                <span className="text-[10px] text-slate-400 italic">No track loaded</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 w-14 flex-shrink-0">Prefetch:</span>
              {metrics.prefetchedTrackUrl ? (
                <>
                  <div className="flex-1 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 overflow-hidden">
                    <span className="text-[10px] font-mono text-slate-700 truncate block">{metrics.prefetchedTrackUrl}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(metrics.prefetchedTrackUrl!, 'prefetch')}
                    className="p-1 hover:bg-slate-200 rounded transition-colors flex-shrink-0"
                    title="Copy URL"
                  >
                    {copiedUrl === 'prefetch' ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3 text-slate-400" />}
                  </button>
                </>
              ) : (
                <span className="text-[10px] text-slate-400 italic">No prefetch active</span>
              )}
            </div>
          </div>
        </div>

        {/* Prefetch Status - Compact inline */}
        {metrics.prefetchedTrackId && (
          <div className="mt-1.5 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-2 py-1.5">
            <TrendingUp className="w-3 h-3 text-blue-600 flex-shrink-0" />
            <span className="text-[10px] font-bold text-blue-900">PREFETCH</span>
            <span className="text-[10px] text-blue-700 font-mono truncate flex-1" title={metrics.prefetchedTrackId}>
              {metrics.prefetchedTrackId}
            </span>
            <span className="text-[10px] text-blue-700">
              <span className="font-bold">{Math.round(metrics.prefetchProgress)}%</span>
              <span className="mx-1">·</span>
              Ready: <span className="font-bold">{metrics.prefetchReadyState}</span>
            </span>
          </div>
        )}

        {/* Streaming Engine Section */}
        <div className="mt-2 pt-2 border-t border-slate-200">
          <div className="flex items-center gap-2 mb-1.5">
            <Layers className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-bold text-slate-900">Streaming Engine</span>
            {hlsMetrics?.isHLSActive && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-700 rounded">
                HLS ACTIVE
              </span>
            )}
            {isStreamingEngine && !hlsMetrics?.isHLSActive && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 rounded">
                MP3 FALLBACK
              </span>
            )}
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {/* Delivery Source */}
            <div className="bg-indigo-50 rounded-lg p-2 border border-indigo-200">
              <div className="flex items-center gap-1 mb-1.5">
                <Server className="w-3 h-3 text-indigo-600" />
                <span className="text-[10px] font-bold text-slate-600 uppercase">Delivery</span>
              </div>
              <StatRow label="Engine" value={isStreamingEngine ? 'Streaming' : 'Legacy'} valueClass={isStreamingEngine ? 'text-indigo-600' : ''} />
              <StatRow label="Format" value={deliveryInfo.type === 'hls' ? 'HLS' : deliveryInfo.type === 'mp3' ? 'MP3' : 'None'} valueClass={deliveryInfo.type === 'hls' ? 'text-indigo-600' : ''} />
              <StatRow label="Source" value={deliveryInfo.source} />
              {hlsMetrics?.isHLSActive && (
                <StatRow label="Mode" value={hlsMetrics.isNativeHLS ? 'Native' : 'hls.js'} valueClass="text-indigo-600" />
              )}
            </div>

            {/* HLS Quality */}
            {hlsMetrics?.isHLSActive ? (
              <div className="bg-indigo-50 rounded-lg p-2 border border-indigo-200">
                <div className="flex items-center gap-1 mb-1.5">
                  <Gauge className="w-3 h-3 text-indigo-600" />
                  <span className="text-[10px] font-bold text-slate-600 uppercase">HLS Quality</span>
                </div>
                <StatRow label="Level" value={hlsMetrics.currentLevel >= 0 ? `L${hlsMetrics.currentLevel}` : 'Auto'} valueClass="text-indigo-600" />
                <StatRow label="Bandwidth" value={formatBitrate(hlsMetrics.bandwidthEstimate)} />
                <StatRow label="Levels" value={hlsMetrics.levels.length || '-'} />
              </div>
            ) : (
              <div className="bg-slate-50 rounded-lg p-2 border border-slate-200 opacity-50">
                <div className="flex items-center gap-1 mb-1.5">
                  <Gauge className="w-3 h-3 text-slate-400" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase">HLS Quality</span>
                </div>
                <div className="text-[10px] text-slate-400 italic text-center py-1">Not using HLS</div>
              </div>
            )}

            {/* HLS Buffer */}
            {hlsMetrics?.isHLSActive ? (
              <div className="bg-indigo-50 rounded-lg p-2 border border-indigo-200">
                <div className="flex items-center gap-1 mb-1.5">
                  <Clock className="w-3 h-3 text-indigo-600" />
                  <span className="text-[10px] font-bold text-slate-600 uppercase">HLS Buffer</span>
                </div>
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[11px] font-bold text-indigo-600">{hlsMetrics.bufferLength.toFixed(1)}s</span>
                  <span className="text-[10px] text-slate-500">/ {hlsMetrics.targetBuffer}s</span>
                </div>
                <div className="w-full bg-indigo-200 rounded-full h-1 mb-1">
                  <div
                    className={`h-full rounded-full ${
                      hlsMetrics.bufferLength / hlsMetrics.targetBuffer > 0.5 ? 'bg-indigo-600' :
                      hlsMetrics.bufferLength / hlsMetrics.targetBuffer > 0.25 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min((hlsMetrics.bufferLength / hlsMetrics.targetBuffer) * 100, 100)}%` }}
                  />
                </div>
                <StatRow label="Segments" value={hlsMetrics.bufferedSegments} />
                <StatRow label="Latency" value={`${Math.round(hlsMetrics.latency)}ms`} />
              </div>
            ) : (
              <div className="bg-slate-50 rounded-lg p-2 border border-slate-200 opacity-50">
                <div className="flex items-center gap-1 mb-1.5">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase">HLS Buffer</span>
                </div>
                <div className="text-[10px] text-slate-400 italic text-center py-1">N/A</div>
              </div>
            )}

            {/* HLS Fragment Stats */}
            {hlsMetrics?.isHLSActive ? (
              <div className="bg-indigo-50 rounded-lg p-2 border border-indigo-200">
                <div className="flex items-center gap-1 mb-1.5">
                  <PlayCircle className="w-3 h-3 text-indigo-600" />
                  <span className="text-[10px] font-bold text-slate-600 uppercase">Fragments</span>
                </div>
                <StatRow label="Loaded" value={hlsMetrics.fragmentStats.loaded} valueClass="text-green-600" />
                <StatRow label="Failed" value={hlsMetrics.fragmentStats.failed} valueClass={hlsMetrics.fragmentStats.failed > 0 ? 'text-red-600' : 'text-slate-400'} />
                <StatRow label="Retried" value={hlsMetrics.fragmentStats.retried} valueClass={hlsMetrics.fragmentStats.retried > 0 ? 'text-yellow-600' : 'text-slate-400'} />
                {(() => {
                  const total = hlsMetrics.fragmentStats.loaded + hlsMetrics.fragmentStats.failed;
                  const rate = total > 0 ? ((hlsMetrics.fragmentStats.loaded / total) * 100).toFixed(0) : '100';
                  return <StatRow label="Success" value={`${rate}%`} valueClass={parseFloat(rate) >= 99 ? 'text-green-600' : parseFloat(rate) >= 95 ? 'text-yellow-600' : 'text-red-600'} />;
                })()}
              </div>
            ) : (
              <div className="bg-slate-50 rounded-lg p-2 border border-slate-200 opacity-50">
                <div className="flex items-center gap-1 mb-1.5">
                  <PlayCircle className="w-3 h-3 text-slate-400" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Fragments</span>
                </div>
                <div className="text-[10px] text-slate-400 italic text-center py-1">N/A</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

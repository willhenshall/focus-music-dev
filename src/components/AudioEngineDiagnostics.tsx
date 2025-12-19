import { X, Activity, Radio, AlertCircle, CheckCircle, Clock, TrendingUp, Zap, Move, Link, Layers, PlayCircle, Server, Gauge, Heart, Copy, Check, Music, Minus, Maximize2, FileJson, RefreshCw } from 'lucide-react';
import type { AudioMetrics } from '../lib/types/audioEngine';
import type { AudioEngineType } from '../contexts/MusicPlayerContext';
import { useState, useEffect, useMemo, useRef, type ComponentType } from 'react';

type TrackInfo = {
  trackName?: string | null;
  artistName?: string | null;
};

type FastStartSnapshot =
  | {
      requestedAt: number;
      firstPlayingAt: number;
      firstAudioMs: number;
      trackId?: string;
      playbackSessionId?: number;
      channelId?: string;
      energyLevel?: 'low' | 'medium' | 'high';
      source: string;
    }
  | null;

type AudioEngineDiagnosticsProps = {
  metrics: AudioMetrics | null;
  onClose: () => void;
  engineType?: AudioEngineType;
  isStreamingEngine?: boolean;
  currentTrackInfo?: TrackInfo;
  prefetchTrackInfo?: TrackInfo;
  currentTrackFilePath?: string | null;
  prefetchTrackFilePath?: string | null;
};

export type DeliverySource = { source: string; type: 'hls' | 'mp3' | 'unknown' };

// Determine delivery source from URL
export function getDeliverySource(url: string | null): DeliverySource {
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
}

type HealthScoreInput = {
  failureCount: number;
  stallCount: number;
  connectionQuality: 'excellent' | 'good' | 'fair' | 'poor' | 'offline';
  circuitBreakerState: 'closed' | 'open' | 'half-open';
  hls?: {
    isHLSActive: boolean;
    bufferLength: number;
    targetBuffer: number;
    fragmentStats: { loaded: number; failed: number; retried: number };
  };
};

// Calculate overall health score (0-100)
export function calculateHealthScore(metrics: HealthScoreInput | null): { score: number; status: 'excellent' | 'good' | 'fair' | 'poor' } {
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
}

export function formatBitrate(bps: number) {
  if (bps >= 1000000) return `${(bps / 1000000).toFixed(1)} Mbps`;
  if (bps >= 1000) return `${Math.round(bps / 1000)} kbps`;
  return `${bps} bps`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeInitialPosition() {
  if (typeof window === 'undefined') return { x: 24, y: 24 };
  return { x: Math.max(8, window.innerWidth - 980), y: 60 };
}

function fileNameFromPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const cleaned = path.split('?')[0];
  const parts = cleaned.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

type TabId = 'summary' | 'fast-start' | 'streaming' | 'prefetch' | 'tracks' | 'benchmarks' | 'raw';

export function AudioEngineDiagnostics({
  metrics,
  onClose,
  engineType: _engineType = 'auto',
  isStreamingEngine = false,
  currentTrackInfo,
  prefetchTrackInfo,
  currentTrackFilePath,
  prefetchTrackFilePath,
}: AudioEngineDiagnosticsProps) {
  const [, setTick] = useState(0);
  const [position, setPosition] = useState(safeInitialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [copiedUrl, setCopiedUrl] = useState<'current' | 'prefetch' | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>(() => (sessionStorage.getItem('audioDiagnosticsTab') as TabId) || 'summary');
  const [isMinimized, setIsMinimized] = useState<boolean>(() => sessionStorage.getItem('audioDiagnosticsMinimized') === 'true');
  const [debugFastStart, setDebugFastStart] = useState<FastStartSnapshot>(null);
  const [debugFastStartEnabled, setDebugFastStartEnabled] = useState<boolean | null>(null);
  const [fastStartHistory, setFastStartHistory] = useState<Array<{ firstAudioMs: number; timestamp: number; trackId?: string; playbackSessionId?: number; source?: string }>>([]);
  const lastFastStartKeyRef = useRef<string | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const dragRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick(prev => prev + 1);

      // Pull extra diagnostics from the existing debug interface (admin/dev only).
      // This avoids touching the protected audio engine while still showing fast-start and cache state.
      try {
        const dbg = (window as any).__playerDebug;
        const snapshot = dbg?.getMetrics?.() ?? null;
        const fastStart: FastStartSnapshot = snapshot?.fastStart ?? null;
        const enabled: boolean | null = typeof snapshot?.fastStartEnabled === 'boolean' ? snapshot.fastStartEnabled : null;
        setDebugFastStart(fastStart);
        setDebugFastStartEnabled(enabled);

        if (fastStart && typeof fastStart.firstAudioMs === 'number') {
          const key = `${fastStart.firstPlayingAt}:${fastStart.playbackSessionId ?? ''}:${fastStart.trackId ?? ''}`;
          if (lastFastStartKeyRef.current !== key) {
            lastFastStartKeyRef.current = key;
            setFastStartHistory(prev => {
              const next = [
                ...prev,
                {
                  firstAudioMs: fastStart.firstAudioMs,
                  timestamp: Date.now(),
                  trackId: fastStart.trackId,
                  playbackSessionId: fastStart.playbackSessionId,
                  source: fastStart.source,
                },
              ];
              return next.slice(-50);
            });
          }
        }
      } catch {
        // ignore
      }
    }, 250);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    sessionStorage.setItem('audioDiagnosticsTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    sessionStorage.setItem('audioDiagnosticsMinimized', String(isMinimized));
  }, [isMinimized]);

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) return;
      const w = typeof window !== 'undefined' ? window.innerWidth : 1024;
      const h = typeof window !== 'undefined' ? window.innerHeight : 768;
      const nextX = clamp(e.clientX - dragOffset.x, 8, Math.max(8, w - 260));
      const nextY = clamp(e.clientY - dragOffset.y, 8, Math.max(8, h - 72));
      setPosition({ x: nextX, y: nextY });
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) return;
      setIsDragging(false);
      pointerIdRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isDragging, dragOffset]);

  const handleDragPointerDown = (e: React.PointerEvent) => {
    if (dragRef.current) {
      const rect = dragRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      pointerIdRef.current = e.pointerId;
      setIsDragging(true);
    }
  };

  const copyToClipboard = async (url: string, type: 'current' | 'prefetch') => {
    await navigator.clipboard.writeText(url);
    setCopiedUrl(type);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const fastStartStats = useMemo(() => {
    if (fastStartHistory.length === 0) return null;
    const sorted = [...fastStartHistory].map(x => x.firstAudioMs).sort((a, b) => a - b);
    const p = (pct: number) => {
      const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((pct / 100) * (sorted.length - 1))));
      return sorted[idx];
    };
    return {
      count: fastStartHistory.length,
      lastMs: fastStartHistory[fastStartHistory.length - 1]?.firstAudioMs ?? null,
      p50Ms: p(50),
      p95Ms: p(95),
      minMs: sorted[0],
      maxMs: sorted[sorted.length - 1],
    };
  }, [fastStartHistory]);

  if (!metrics) {
    return (
      <div
        ref={dragRef}
        style={{ left: `${position.x}px`, top: `${position.y}px` }}
        className="fixed bg-white border-2 border-slate-300 rounded-xl shadow-2xl p-4 w-[360px] max-w-[calc(100vw-16px)] z-50"
        data-testid="audio-diagnostics-modal"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div
              onPointerDown={handleDragPointerDown}
              className="cursor-move touch-none"
              data-testid="audio-diagnostics-drag-handle"
            >
              <Move className="w-4 h-4 text-slate-400" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">Audio Engine Diagnostics</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
            data-testid="audio-diagnostics-close"
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
  const healthInfo = calculateHealthScore(metrics as any);
  const hlsMetrics = metrics?.hls;

  const exportDiagnostics = () => {
    const dbg = (window as any).__playerDebug;
    const snapshot = dbg?.getMetrics?.() ?? null;
    const combined = { ...metrics, _debug: snapshot ? { fastStart: snapshot.fastStart, fastStartEnabled: snapshot.fastStartEnabled, fastStartCache: snapshot.fastStartCache, playbackSessionId: snapshot.playbackSessionId } : null };
    const data = JSON.stringify(combined, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audio-diagnostics-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Stat row component
  const StatRow = ({ label, value, valueClass = '' }: { label: string; value: string | number; valueClass?: string }) => (
    <div className="flex justify-between items-center">
      <span className="text-[11px] text-slate-500">{label}</span>
      <span className={`text-[13px] font-semibold ${valueClass || 'text-slate-900'}`}>{value}</span>
    </div>
  );

  const tabs: Array<{ id: TabId; label: string; icon: ComponentType<any> }> = useMemo(() => ([
    { id: 'summary', label: 'Summary', icon: Activity },
    { id: 'fast-start', label: 'Fast start', icon: Zap },
    { id: 'streaming', label: 'Streaming / HLS', icon: Layers },
    { id: 'prefetch', label: 'Prefetch', icon: TrendingUp },
    { id: 'tracks', label: 'Tracks & URLs', icon: Link },
    { id: 'benchmarks', label: 'Benchmarks', icon: Gauge },
    { id: 'raw', label: 'Raw', icon: FileJson },
  ]), []);

  const resetPosition = () => {
    setPosition(safeInitialPosition());
  };

  const currentFileName = fileNameFromPath(currentTrackFilePath) ?? fileNameFromPath(metrics.currentTrackUrl);
  const prefetchFileName = fileNameFromPath(prefetchTrackFilePath) ?? fileNameFromPath(metrics.prefetchedTrackUrl);

  if (isMinimized) {
    return (
      <div
        ref={dragRef}
        style={{ left: `${position.x}px`, top: `${position.y}px` }}
        className="fixed bg-white border border-slate-300 rounded-xl shadow-2xl w-[360px] max-w-[calc(100vw-16px)] z-50"
        data-testid="audio-diagnostics-modal"
      >
        <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-xl border-b border-slate-200">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onPointerDown={handleDragPointerDown}
              className="cursor-move touch-none hover:bg-slate-100 rounded p-1"
              title="Drag"
              data-testid="audio-diagnostics-drag-handle"
            >
              <Move className="w-4 h-4 text-slate-500" />
            </button>
            <div className="min-w-0">
              <div className="text-[12px] font-bold text-slate-900 truncate">Audio Diagnostics</div>
              <div className="text-[10px] text-slate-500 truncate">
                {currentTrackInfo?.trackName ? `${currentTrackInfo.trackName}${currentTrackInfo.artistName ? ` · ${currentTrackInfo.artistName}` : ''}` : 'No track'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`px-2 py-1 text-[10px] font-bold rounded ${getStatusColor(metrics.playbackState)} bg-opacity-10`}>
              {metrics.playbackState.toUpperCase()}
            </span>
            {typeof fastStartStats?.lastMs === 'number' && (
              <span className="px-2 py-1 text-[10px] font-bold bg-slate-100 text-slate-700 rounded">
                {Math.round(fastStartStats.lastMs)}ms
              </span>
            )}
            <button
              onClick={() => setIsMinimized(false)}
              className="p-1.5 hover:bg-slate-200 rounded transition-colors"
              title="Expand"
              data-testid="audio-diagnostics-expand"
            >
              <Maximize2 className="w-4 h-4 text-slate-600" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-200 rounded transition-colors"
              title="Close"
              data-testid="audio-diagnostics-close"
            >
              <X className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={dragRef}
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      className="fixed bg-white border border-slate-300 rounded-xl shadow-2xl w-[calc(100vw-16px)] max-w-[960px] z-50 select-none"
      data-testid="audio-diagnostics-modal"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-slate-50 rounded-t-xl">
        <div className="flex items-center gap-2.5">
          <div
            className="cursor-move hover:bg-slate-100 rounded p-1"
            onPointerDown={handleDragPointerDown}
            title="Drag to move"
            data-testid="audio-diagnostics-drag-handle"
          >
            <Move className="w-5 h-5 text-slate-400 hover:text-slate-600" />
          </div>
          <Activity className="w-5 h-5 text-blue-600" />
          <h3 className="text-base font-bold text-slate-900">Audio Engine Diagnostics</h3>
        </div>
        <div className="flex items-center gap-3">
          {/* Quick Status Pills */}
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 text-[11px] font-bold rounded ${getStatusColor(metrics.playbackState)} bg-opacity-10`}>
              {metrics.playbackState.toUpperCase()}
            </span>
            <span className={`px-2 py-1 text-[11px] font-bold rounded ${getConnectionQualityColor(metrics.connectionQuality)}`}>
              {metrics.connectionQuality.toUpperCase()}
            </span>
            {hlsMetrics?.isHLSActive && (
              <span className="px-2 py-1 text-[11px] font-bold bg-indigo-100 text-indigo-700 rounded">
                HLS
              </span>
            )}
          </div>
          <button
            onClick={resetPosition}
            className="p-1.5 hover:bg-slate-200 rounded transition-colors"
            title="Reset position"
            data-testid="audio-diagnostics-reset-position"
          >
            <RefreshCw className="w-4 h-4 text-slate-600" />
          </button>
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1.5 hover:bg-slate-200 rounded transition-colors"
            title="Minimize"
            data-testid="audio-diagnostics-minimize"
          >
            <Minus className="w-4 h-4 text-slate-600" />
          </button>
          <button
            onClick={exportDiagnostics}
            className="px-3 py-1.5 text-[11px] font-bold bg-slate-100 hover:bg-slate-200 rounded transition-colors"
          >
            Export
          </button>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-200 rounded transition-colors"
            data-testid="audio-diagnostics-close"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-2 py-2 border-b border-slate-200 bg-white">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-semibold whitespace-nowrap transition-colors ${
                  isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
                data-testid={`audio-diagnostics-tab-${t.id}`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content Grid */}
      <div className="p-3 max-h-[650px] overflow-y-auto">
        {activeTab === 'summary' && (
          <>
        {/* Alert Banners (Retry / Error) - only show if active */}
        {(metrics.retryAttempt > 0 || metrics.error) && (
          <div className="space-y-2 mb-3">
            {metrics.retryAttempt > 0 && (
              <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span className="text-[11px] font-bold text-amber-900">RETRY</span>
                </div>
                <span className="text-[11px] text-amber-700">
                  Attempt <span className="font-bold">{metrics.retryAttempt}/{metrics.maxRetries}</span>
                  {metrics.nextRetryIn > 0 && <> · Next in <span className="font-bold">{Math.ceil(metrics.nextRetryIn / 1000)}s</span></>}
                </span>
              </div>
            )}
            {metrics.error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    <span className="text-[11px] font-bold text-red-900">ERROR</span>
                  </div>
                  <span className="text-[11px] text-red-600 font-mono">{metrics.errorCategory || 'unknown'}</span>
                </div>
                <div className="text-[11px] text-red-700 mt-1 truncate" title={metrics.error}>{metrics.error}</div>
              </div>
            )}
          </div>
        )}

        {/* Main 4-Column Grid */}
        <div className="grid grid-cols-4 gap-2">
          {/* Card: Circuit Breaker */}
          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className="w-4 h-4 text-purple-600" />
              <span className="text-[11px] font-bold text-slate-600 uppercase">Circuit Breaker</span>
            </div>
            <div className={`text-[11px] font-bold px-2 py-1 rounded inline-block mb-1.5 ${getCircuitBreakerColor(metrics.circuitBreakerState)}`}>
              {metrics.circuitBreakerState.toUpperCase()}
            </div>
            <StatRow label="F/S" value={`${metrics.failureCount}/${metrics.successCount}`} valueClass={metrics.failureCount > 0 ? 'text-red-600' : 'text-green-600'} />
          </div>

          {/* Card: Performance */}
          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <span className="text-[11px] font-bold text-slate-600 uppercase">Performance</span>
            </div>
            <StatRow label="Load" value={`${Math.round(metrics.loadDuration)}ms`} />
            <StatRow label="Bandwidth" value={`${metrics.estimatedBandwidth} kbps`} />
            <StatRow label="Success" value={`${metrics.sessionSuccessRate}%`} valueClass={metrics.sessionSuccessRate >= 95 ? 'text-green-600' : metrics.sessionSuccessRate >= 80 ? 'text-yellow-600' : 'text-red-600'} />
          </div>

          {/* Card: Buffer */}
          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <div className="flex items-center gap-1.5 mb-2">
              <Clock className="w-4 h-4 text-green-600" />
              <span className="text-[11px] font-bold text-slate-600 uppercase">Buffer</span>
            </div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-[13px] font-bold">{Math.round(metrics.bufferPercentage)}%</span>
              <div className="flex-1 bg-slate-200 rounded-full h-2">
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
          <div className={`rounded-lg p-2.5 border ${getHealthColor(healthInfo.status)}`}>
            <div className="flex items-center gap-1.5 mb-2">
              <Heart className="w-4 h-4" />
              <span className="text-[11px] font-bold uppercase">Health</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{healthInfo.score}</span>
              <div className="flex-1">
                <div className="text-[11px] font-bold uppercase mb-1">{healthInfo.status}</div>
                <div className="w-full bg-white/50 rounded-full h-2">
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
          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <div className="flex items-center gap-1.5 mb-2">
              <CheckCircle className="w-4 h-4 text-blue-600" />
              <span className="text-[11px] font-bold text-slate-600 uppercase">Playback</span>
            </div>
            <StatRow label="Time" value={`${formatTime(metrics.currentTime)} / ${formatTime(metrics.duration)}`} />
            <StatRow label="Volume" value={`${Math.round(metrics.volume * 100)}%`} />
            <StatRow label="Element" value={metrics.audioElement?.toUpperCase() || 'NONE'} />
          </div>

          {/* Card: Status Flags - spans 2 columns */}
          <div className="col-span-2 bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <div className="flex items-center gap-1.5 mb-2">
              <Activity className="w-4 h-4 text-slate-600" />
              <span className="text-[11px] font-bold text-slate-600 uppercase">Status Flags</span>
            </div>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1">
              <StatRow label="Waiting" value={metrics.isWaiting ? 'Yes' : 'No'} valueClass={metrics.isWaiting ? 'text-yellow-600' : 'text-slate-400'} />
              <StatRow label="Stalled" value={metrics.isStalled ? 'Yes' : 'No'} valueClass={metrics.isStalled ? 'text-red-600' : 'text-slate-400'} />
              <StatRow label="MediaSess" value={metrics.mediaSessionActive ? 'Yes' : 'No'} valueClass={metrics.mediaSessionActive ? 'text-green-600' : 'text-slate-400'} />
              <StatRow label="Stalls" value={metrics.stallCount} valueClass="text-orange-600" />
              <StatRow label="Recovery" value={metrics.recoveryAttempts} valueClass="text-orange-600" />
              <StatRow label="Ready" value={metrics.readyState} />
            </div>
          </div>

          {/* Card: Storage */}
          <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200">
            <div className="flex items-center gap-1.5 mb-2">
              <Radio className="w-4 h-4 text-blue-600" />
              <span className="text-[11px] font-bold text-slate-600 uppercase">Storage</span>
            </div>
            <div className="text-[13px] font-semibold text-slate-900 truncate" title={metrics.storageBackend}>
              {metrics.storageBackend}
            </div>
            <div className="text-[11px] text-slate-500 font-mono truncate mt-1" title={metrics.currentTrackId || ''}>
              {metrics.currentTrackId || 'No track'}
            </div>
          </div>
        </div>

        {/* Fast start summary (admin/dev) */}
        <div className="mt-2.5 bg-slate-50 rounded-lg p-2.5 border border-slate-200">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-slate-600" />
              <span className="text-[11px] font-bold text-slate-600 uppercase">Fast start</span>
            </div>
            <span className={`px-2 py-1 text-[10px] font-bold rounded ${debugFastStartEnabled ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}`}>
              {debugFastStartEnabled === null ? 'UNKNOWN' : debugFastStartEnabled ? 'ENABLED' : 'DISABLED'}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div className="col-span-2 bg-white border border-slate-200 rounded p-2">
              <div className="text-[11px] text-slate-500 mb-1">Last time to first audio</div>
              <div className="text-[16px] font-bold text-slate-900">
                {typeof debugFastStart?.firstAudioMs === 'number' ? `${Math.round(debugFastStart.firstAudioMs)}ms` : '—'}
              </div>
              <div className="text-[10px] text-slate-500 mt-1 truncate">
                {debugFastStart?.source ? `Source: ${debugFastStart.source}` : ''}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded p-2">
              <div className="text-[11px] text-slate-500 mb-1">Session p50</div>
              <div className="text-[14px] font-bold text-slate-900">
                {fastStartStats ? `${Math.round(fastStartStats.p50Ms)}ms` : '—'}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded p-2">
              <div className="text-[11px] text-slate-500 mb-1">Session p95</div>
              <div className="text-[14px] font-bold text-slate-900">
                {fastStartStats ? `${Math.round(fastStartStats.p95Ms)}ms` : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* URLs Section - with track info */}
        <div className="mt-2.5 bg-slate-50 rounded-lg p-2.5 border border-slate-200">
          <div className="flex items-center gap-1.5 mb-2">
            <Link className="w-4 h-4 text-slate-600" />
            <span className="text-[11px] font-bold text-slate-600 uppercase">Audio URLs</span>
          </div>
          <div className="space-y-2">
            {/* Current Track */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 w-16 flex-shrink-0">Current:</span>
                {currentTrackInfo?.trackName ? (
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <Music className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                    <span className="text-[12px] font-semibold text-slate-900 truncate">{currentTrackInfo.trackName}</span>
                    {currentTrackInfo.artistName && (
                      <>
                        <span className="text-[11px] text-slate-400">·</span>
                        <span className="text-[11px] text-slate-600 truncate">{currentTrackInfo.artistName}</span>
                      </>
                    )}
                  </div>
                ) : (
                  <span className="text-[11px] text-slate-400 italic">No track info</span>
                )}
              </div>
              {(currentTrackFilePath || currentFileName) && (
                <div className="ml-[72px] text-[10px] text-slate-500 font-mono truncate" title={currentTrackFilePath || currentFileName || ''}>
                  File: {currentTrackFilePath || currentFileName}
                </div>
              )}
              {metrics.currentTrackUrl && (
                <div className="flex items-center gap-2 ml-[72px]">
                  <div className="flex-1 bg-white border border-slate-200 rounded px-2 py-1 overflow-hidden">
                    <span className="text-[10px] font-mono text-slate-500 truncate block">{metrics.currentTrackUrl}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(metrics.currentTrackUrl!, 'current')}
                    className="p-1 hover:bg-slate-200 rounded transition-colors flex-shrink-0"
                    title="Copy URL"
                  >
                    {copiedUrl === 'current' ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                  </button>
                </div>
              )}
            </div>

            {/* Prefetch Track */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 w-16 flex-shrink-0">Prefetch:</span>
                {prefetchTrackInfo?.trackName ? (
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <Music className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                    <span className="text-[12px] font-semibold text-slate-900 truncate">{prefetchTrackInfo.trackName}</span>
                    {prefetchTrackInfo.artistName && (
                      <>
                        <span className="text-[11px] text-slate-400">·</span>
                        <span className="text-[11px] text-slate-600 truncate">{prefetchTrackInfo.artistName}</span>
                      </>
                    )}
                  </div>
                ) : metrics.prefetchedTrackUrl ? (
                  <span className="text-[11px] text-slate-400 italic">Loading...</span>
                ) : (
                  <span className="text-[11px] text-slate-400 italic">No prefetch active</span>
                )}
              </div>
              {(prefetchTrackFilePath || prefetchFileName) && (
                <div className="ml-[72px] text-[10px] text-slate-500 font-mono truncate" title={prefetchTrackFilePath || prefetchFileName || ''}>
                  File: {prefetchTrackFilePath || prefetchFileName}
                </div>
              )}
              {metrics.prefetchedTrackUrl && (
                <div className="flex items-center gap-2 ml-[72px]">
                  <div className="flex-1 bg-blue-50 border border-blue-200 rounded px-2 py-1 overflow-hidden">
                    <span className="text-[10px] font-mono text-slate-500 truncate block">{metrics.prefetchedTrackUrl}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(metrics.prefetchedTrackUrl!, 'prefetch')}
                    className="p-1 hover:bg-slate-200 rounded transition-colors flex-shrink-0"
                    title="Copy URL"
                  >
                    {copiedUrl === 'prefetch' ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Prefetch Status - inline */}
        {metrics.prefetchedTrackId && (
          <div className="mt-2 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            <TrendingUp className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <span className="text-[11px] font-bold text-blue-900">PREFETCH</span>
            <span className="text-[11px] text-blue-700 font-mono truncate flex-1" title={metrics.prefetchedTrackId}>
              {metrics.prefetchedTrackId}
            </span>
            <span className="text-[11px] text-blue-700">
              <span className="font-bold">{Math.round(metrics.prefetchProgress)}%</span>
              <span className="mx-1">·</span>
              Ready: <span className="font-bold">{metrics.prefetchReadyState}</span>
            </span>
          </div>
        )}
          </>
        )}

        {/* Streaming Engine Section */}
        {activeTab === 'streaming' && (
        <div className="pt-2.5">
          <div className="flex items-center gap-2 mb-2">
            <Layers className="w-5 h-5 text-indigo-600" />
            <span className="text-sm font-bold text-slate-900">Streaming Engine</span>
            {hlsMetrics?.isHLSActive && (
              <span className="px-2 py-1 text-[11px] font-bold bg-indigo-100 text-indigo-700 rounded">
                HLS ACTIVE
              </span>
            )}
            {isStreamingEngine && !hlsMetrics?.isHLSActive && (
              <span className="px-2 py-1 text-[11px] font-bold bg-amber-100 text-amber-700 rounded">
                MP3 FALLBACK
              </span>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2">
            {/* Delivery Source */}
            <div className="bg-indigo-50 rounded-lg p-2.5 border border-indigo-200">
              <div className="flex items-center gap-1.5 mb-2">
                <Server className="w-4 h-4 text-indigo-600" />
                <span className="text-[11px] font-bold text-slate-600 uppercase">Delivery</span>
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
              <div className="bg-indigo-50 rounded-lg p-2.5 border border-indigo-200">
                <div className="flex items-center gap-1.5 mb-2">
                  <Gauge className="w-4 h-4 text-indigo-600" />
                  <span className="text-[11px] font-bold text-slate-600 uppercase">HLS Quality</span>
                </div>
                <StatRow 
                  label="Tier" 
                  value={hlsMetrics.abr?.currentQualityTier?.toUpperCase() || 'Auto'} 
                  valueClass={
                    hlsMetrics.abr?.currentQualityTier === 'premium' ? 'text-purple-600' :
                    hlsMetrics.abr?.currentQualityTier === 'high' ? 'text-blue-600' :
                    hlsMetrics.abr?.currentQualityTier === 'medium' ? 'text-green-600' :
                    hlsMetrics.abr?.currentQualityTier === 'low' ? 'text-orange-600' :
                    'text-indigo-600'
                  } 
                />
                <StatRow label="Bandwidth" value={formatBitrate(hlsMetrics.bandwidthEstimate)} />
                <StatRow label="Levels" value={hlsMetrics.levels.length || '-'} />
                <StatRow 
                  label="Bitrate" 
                  value={hlsMetrics.levels[hlsMetrics.currentLevel]?.bitrate 
                    ? `${Math.round(hlsMetrics.levels[hlsMetrics.currentLevel].bitrate / 1000)}k` 
                    : 'Auto'} 
                />
              </div>
            ) : (
              <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200 opacity-50">
                <div className="flex items-center gap-1.5 mb-2">
                  <Gauge className="w-4 h-4 text-slate-400" />
                  <span className="text-[11px] font-bold text-slate-400 uppercase">HLS Quality</span>
                </div>
                <div className="text-[11px] text-slate-400 italic text-center py-2">Not using HLS</div>
              </div>
            )}

            {/* HLS Buffer */}
            {hlsMetrics?.isHLSActive ? (
              <div className="bg-indigo-50 rounded-lg p-2.5 border border-indigo-200">
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock className="w-4 h-4 text-indigo-600" />
                  <span className="text-[11px] font-bold text-slate-600 uppercase">HLS Buffer</span>
                </div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-[13px] font-bold text-indigo-600">{hlsMetrics.bufferLength.toFixed(1)}s</span>
                  <span className="text-[11px] text-slate-500">/ {hlsMetrics.targetBuffer}s</span>
                </div>
                <div className="w-full bg-indigo-200 rounded-full h-1.5 mb-1.5">
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
              <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200 opacity-50">
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span className="text-[11px] font-bold text-slate-400 uppercase">HLS Buffer</span>
                </div>
                <div className="text-[11px] text-slate-400 italic text-center py-2">N/A</div>
              </div>
            )}

            {/* HLS Fragment Stats */}
            {hlsMetrics?.isHLSActive ? (
              <div className="bg-indigo-50 rounded-lg p-2.5 border border-indigo-200">
                <div className="flex items-center gap-1.5 mb-2">
                  <PlayCircle className="w-4 h-4 text-indigo-600" />
                  <span className="text-[11px] font-bold text-slate-600 uppercase">Fragments</span>
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
              <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200 opacity-50">
                <div className="flex items-center gap-1.5 mb-2">
                  <PlayCircle className="w-4 h-4 text-slate-400" />
                  <span className="text-[11px] font-bold text-slate-400 uppercase">Fragments</span>
                </div>
                <div className="text-[11px] text-slate-400 italic text-center py-2">N/A</div>
              </div>
            )}
          </div>

          {/* ABR (Adaptive Bitrate) Detailed Section */}
          {hlsMetrics?.isHLSActive && hlsMetrics.abr && (
            <div className="mt-3 pt-2.5 border-t border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-purple-600" />
                <span className="text-sm font-bold text-slate-900">Adaptive Bitrate (ABR) Analysis</span>
                <span className={`px-2 py-1 text-[11px] font-bold rounded ${
                  hlsMetrics.abr.abrState === 'optimal' ? 'bg-green-100 text-green-700' :
                  hlsMetrics.abr.abrState === 'upgrading' ? 'bg-blue-100 text-blue-700' :
                  hlsMetrics.abr.abrState === 'downgraded' ? 'bg-orange-100 text-orange-700' :
                  'bg-slate-100 text-slate-700'
                }`}>
                  {hlsMetrics.abr.abrState.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {/* Current Quality */}
                <div className="bg-purple-50 rounded-lg p-2.5 border border-purple-200">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Zap className="w-4 h-4 text-purple-600" />
                    <span className="text-[11px] font-bold text-slate-600 uppercase">Current Quality</span>
                  </div>
                  <div className="text-center mb-2">
                    <span className={`text-lg font-bold ${
                      hlsMetrics.abr.currentQualityTier === 'premium' ? 'text-purple-600' :
                      hlsMetrics.abr.currentQualityTier === 'high' ? 'text-blue-600' :
                      hlsMetrics.abr.currentQualityTier === 'medium' ? 'text-green-600' :
                      'text-orange-600'
                    }`}>
                      {hlsMetrics.abr.currentQualityTier?.toUpperCase() || 'AUTO'}
                    </span>
                  </div>
                  <StatRow 
                    label="Bitrate" 
                    value={hlsMetrics.levels[hlsMetrics.currentLevel]?.bitrate 
                      ? `${Math.round(hlsMetrics.levels[hlsMetrics.currentLevel].bitrate / 1000)}k` 
                      : '-'} 
                    valueClass="text-purple-600"
                  />
                  <StatRow label="Level" value={hlsMetrics.currentLevel >= 0 ? `${hlsMetrics.currentLevel}/${hlsMetrics.levels.length - 1}` : 'Auto'} />
                </div>

                {/* Bandwidth Analysis */}
                <div className="bg-purple-50 rounded-lg p-2.5 border border-purple-200">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Activity className="w-4 h-4 text-purple-600" />
                    <span className="text-[11px] font-bold text-slate-600 uppercase">Bandwidth</span>
                  </div>
                  <StatRow 
                    label="Measured" 
                    value={`${Math.round(hlsMetrics.bandwidthEstimate / 1000)} kbps`} 
                    valueClass="text-purple-600"
                  />
                  <StatRow 
                    label="Recommended" 
                    value={hlsMetrics.abr.recommendedQualityTier?.toUpperCase() || '-'} 
                    valueClass={
                      hlsMetrics.abr.recommendedQualityTier === hlsMetrics.abr.currentQualityTier 
                        ? 'text-green-600' 
                        : 'text-orange-600'
                    }
                  />
                  <StatRow 
                    label="Match" 
                    value={hlsMetrics.abr.recommendedQualityTier === hlsMetrics.abr.currentQualityTier ? '✓ Yes' : '⚠ No'} 
                    valueClass={hlsMetrics.abr.recommendedQualityTier === hlsMetrics.abr.currentQualityTier ? 'text-green-600' : 'text-orange-600'}
                  />
                </div>

                {/* Level Switching */}
                <div className="bg-purple-50 rounded-lg p-2.5 border border-purple-200">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Layers className="w-4 h-4 text-purple-600" />
                    <span className="text-[11px] font-bold text-slate-600 uppercase">Switching</span>
                  </div>
                  <StatRow label="Total Switches" value={hlsMetrics.abr.totalLevelSwitches} />
                  <StatRow 
                    label="Direction" 
                    value={
                      hlsMetrics.abr.isUpgrading ? '↑ Upgrading' :
                      hlsMetrics.abr.isDowngrading ? '↓ Downgrading' :
                      '→ Stable'
                    } 
                    valueClass={
                      hlsMetrics.abr.isUpgrading ? 'text-green-600' :
                      hlsMetrics.abr.isDowngrading ? 'text-orange-600' :
                      'text-blue-600'
                    }
                  />
                  <StatRow 
                    label="Last Switch" 
                    value={hlsMetrics.abr.timeSinceSwitch > 0 
                      ? `${Math.round(hlsMetrics.abr.timeSinceSwitch / 1000)}s ago` 
                      : '-'} 
                  />
                </div>

                {/* ABR Controller */}
                <div className="bg-purple-50 rounded-lg p-2.5 border border-purple-200">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Radio className="w-4 h-4 text-purple-600" />
                    <span className="text-[11px] font-bold text-slate-600 uppercase">Controller</span>
                  </div>
                  <StatRow 
                    label="Auto Mode" 
                    value={hlsMetrics.abr.autoLevelEnabled ? 'Enabled' : 'Manual'} 
                    valueClass={hlsMetrics.abr.autoLevelEnabled ? 'text-green-600' : 'text-orange-600'}
                  />
                  <StatRow label="Next Level" value={hlsMetrics.abr.nextAutoLevel >= 0 ? `L${hlsMetrics.abr.nextAutoLevel}` : 'Auto'} />
                  <StatRow label="Load Level" value={hlsMetrics.abr.loadLevel >= 0 ? `L${hlsMetrics.abr.loadLevel}` : '-'} />
                </div>
              </div>

              {/* Quality Ladder Visualization */}
              <div className="mt-3 bg-slate-50 rounded-lg p-2.5 border border-slate-200">
                <div className="flex items-center gap-1.5 mb-2">
                  <Gauge className="w-4 h-4 text-slate-600" />
                  <span className="text-[11px] font-bold text-slate-600 uppercase">Quality Ladder</span>
                </div>
                <div className="flex gap-1.5">
                  {hlsMetrics.levels.map((level, idx) => {
                    const isActive = idx === hlsMetrics.currentLevel;
                    const isRecommended = level.tierName === hlsMetrics.abr.recommendedQualityTier;
                    return (
                      <div
                        key={idx}
                        className={`flex-1 p-2 rounded-lg text-center transition-all ${
                          isActive 
                            ? 'bg-purple-600 text-white ring-2 ring-purple-400' 
                            : isRecommended 
                              ? 'bg-purple-100 text-purple-700 ring-1 ring-purple-300' 
                              : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <div className="text-[10px] font-bold uppercase">
                          {level.tierName || `L${idx}`}
                        </div>
                        <div className={`text-[11px] ${isActive ? 'text-purple-200' : 'text-slate-500'}`}>
                          {Math.round(level.bitrate / 1000)}k
                        </div>
                        {isActive && (
                          <div className="text-[9px] mt-0.5 text-purple-200">● ACTIVE</div>
                        )}
                        {!isActive && isRecommended && (
                          <div className="text-[9px] mt-0.5 text-purple-500">◎ REC</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Level Switch History */}
              {hlsMetrics.abr.levelSwitchHistory && hlsMetrics.abr.levelSwitchHistory.length > 0 && (
                <div className="mt-2 bg-slate-50 rounded-lg p-2.5 border border-slate-200">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Clock className="w-4 h-4 text-slate-600" />
                    <span className="text-[11px] font-bold text-slate-600 uppercase">Recent Level Switches</span>
                  </div>
                  <div className="space-y-1 max-h-20 overflow-y-auto">
                    {[...hlsMetrics.abr.levelSwitchHistory].reverse().slice(0, 5).map((sw, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-[10px]">
                        <span className="text-slate-400 w-12">
                          {new Date(sw.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                        <span className={`font-medium ${sw.toLevel > sw.fromLevel ? 'text-green-600' : 'text-orange-600'}`}>
                          L{sw.fromLevel} → L{sw.toLevel}
                        </span>
                        <span className="text-slate-500">
                          ({Math.round(sw.bandwidth / 1000)} kbps)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {activeTab === 'prefetch' && (
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-bold text-slate-900">Prefetch</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white border border-slate-200 rounded p-2.5">
                <div className="text-[11px] font-bold text-slate-600 uppercase mb-1">Next track</div>
                <div className="text-[13px] font-semibold text-slate-900 truncate">
                  {prefetchTrackInfo?.trackName || '—'}
                </div>
                <div className="text-[11px] text-slate-500 truncate">{prefetchTrackInfo?.artistName || ''}</div>
                <div className="text-[10px] text-slate-500 font-mono truncate mt-1">{prefetchTrackFilePath || prefetchFileName || '—'}</div>
              </div>
              <div className="bg-white border border-slate-200 rounded p-2.5">
                <div className="text-[11px] font-bold text-slate-600 uppercase mb-1">Status</div>
                <StatRow label="Prefetched ID" value={metrics.prefetchedTrackId || '—'} />
                <StatRow label="Progress" value={`${Math.round(metrics.prefetchProgress)}%`} />
                <StatRow label="Ready state" value={metrics.prefetchReadyState} />
              </div>
            </div>
            {metrics.prefetchedTrackUrl && (
              <div className="mt-3 bg-white border border-slate-200 rounded p-2.5">
                <div className="text-[11px] font-bold text-slate-600 uppercase mb-2">Prefetched URL</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-50 border border-slate-200 rounded px-2 py-1 overflow-hidden">
                    <span className="text-[10px] font-mono text-slate-500 truncate block">{metrics.prefetchedTrackUrl}</span>
                  </div>
                  <button
                    onClick={() => copyToClipboard(metrics.prefetchedTrackUrl!, 'prefetch')}
                    className="p-1 hover:bg-slate-200 rounded transition-colors flex-shrink-0"
                    title="Copy URL"
                  >
                    {copiedUrl === 'prefetch' ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'tracks' && (
          <div className="space-y-3">
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <Music className="w-5 h-5 text-green-600" />
                <span className="text-sm font-bold text-slate-900">Current track</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white border border-slate-200 rounded p-2.5">
                  <StatRow label="Track" value={currentTrackInfo?.trackName || '—'} />
                  <StatRow label="Artist" value={currentTrackInfo?.artistName || '—'} />
                  <StatRow label="Track ID" value={metrics.currentTrackId || '—'} />
                </div>
                <div className="bg-white border border-slate-200 rounded p-2.5">
                  <StatRow label="File path" value={currentTrackFilePath || '—'} />
                  <StatRow label="File name" value={currentFileName || '—'} />
                  <StatRow label="Delivery" value={`${deliveryInfo.source} (${deliveryInfo.type.toUpperCase()})`} />
                </div>
              </div>
              {metrics.currentTrackUrl && (
                <div className="mt-3 bg-white border border-slate-200 rounded p-2.5">
                  <div className="text-[11px] font-bold text-slate-600 uppercase mb-2">Current URL</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-50 border border-slate-200 rounded px-2 py-1 overflow-hidden">
                      <span className="text-[10px] font-mono text-slate-500 truncate block">{metrics.currentTrackUrl}</span>
                    </div>
                    <button
                      onClick={() => copyToClipboard(metrics.currentTrackUrl!, 'current')}
                      className="p-1 hover:bg-slate-200 rounded transition-colors flex-shrink-0"
                      title="Copy URL"
                    >
                      {copiedUrl === 'current' ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-bold text-slate-900">Next / Prefetch</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white border border-slate-200 rounded p-2.5">
                  <StatRow label="Track" value={prefetchTrackInfo?.trackName || '—'} />
                  <StatRow label="Artist" value={prefetchTrackInfo?.artistName || '—'} />
                  <StatRow label="Prefetched ID" value={metrics.prefetchedTrackId || '—'} />
                </div>
                <div className="bg-white border border-slate-200 rounded p-2.5">
                  <StatRow label="File path" value={prefetchTrackFilePath || '—'} />
                  <StatRow label="File name" value={prefetchFileName || '—'} />
                  <StatRow label="Progress" value={`${Math.round(metrics.prefetchProgress)}%`} />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'fast-start' && (
          <div className="space-y-3">
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-purple-600" />
                  <span className="text-sm font-bold text-slate-900">Fast start</span>
                </div>
                <span className={`px-2 py-1 text-[11px] font-bold rounded ${
                  debugFastStartEnabled === true ? 'bg-green-100 text-green-700' :
                  debugFastStartEnabled === false ? 'bg-slate-100 text-slate-700' :
                  'bg-amber-100 text-amber-700'
                }`}>
                  {debugFastStartEnabled === null ? 'UNKNOWN' : debugFastStartEnabled ? 'ENABLED' : 'DISABLED'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white border border-slate-200 rounded p-2.5">
                  <div className="text-[11px] text-slate-500 mb-1">Last time to first audio</div>
                  <div className="text-[18px] font-bold text-slate-900">{typeof debugFastStart?.firstAudioMs === 'number' ? `${Math.round(debugFastStart.firstAudioMs)}ms` : '—'}</div>
                  <div className="text-[10px] text-slate-500 mt-1 truncate">{debugFastStart?.source ? `Source: ${debugFastStart.source}` : ''}</div>
                </div>
                <div className="bg-white border border-slate-200 rounded p-2.5">
                  <div className="text-[11px] text-slate-500 mb-1">Session p50 / p95</div>
                  <div className="text-[14px] font-bold text-slate-900">
                    {fastStartStats ? `${Math.round(fastStartStats.p50Ms)}ms / ${Math.round(fastStartStats.p95Ms)}ms` : '—'}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">{fastStartStats ? `${fastStartStats.count} samples` : ''}</div>
                </div>
                <div className="bg-white border border-slate-200 rounded p-2.5">
                  <div className="text-[11px] text-slate-500 mb-1">Interpretation</div>
                  <div className="text-[12px] text-slate-700">
                    Target: <span className="font-bold">&lt; 800ms p50</span> and <span className="font-bold">&lt; 1500ms p95</span> (good streaming UX).
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-slate-600" />
                <span className="text-sm font-bold text-slate-900">Recent samples (this session)</span>
              </div>
              {fastStartHistory.length === 0 ? (
                <div className="text-[12px] text-slate-500">No fast-start samples yet (start/stop playback a couple times).</div>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {[...fastStartHistory].reverse().slice(0, 12).map((s, idx) => (
                    <div key={idx} className="flex items-center justify-between text-[11px] bg-white border border-slate-200 rounded px-2 py-1">
                      <span className="font-mono text-slate-500">{new Date(s.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      <span className="text-slate-700 truncate flex-1 mx-2">{s.source || '—'}</span>
                      <span className="font-bold text-slate-900">{Math.round(s.firstAudioMs)}ms</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'benchmarks' && (
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <div className="flex items-center gap-2 mb-2">
              <Gauge className="w-5 h-5 text-slate-700" />
              <span className="text-sm font-bold text-slate-900">Benchmarks (targets)</span>
            </div>
            <div className="text-[12px] text-slate-600 mb-3">
              Public, competitor-specific “time to first sound” numbers are rarely disclosed. This tab uses practical streaming UX targets and shows competitor rows as reference (marked as not publicly disclosed).
            </div>

            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="grid grid-cols-4 gap-0 text-[11px] font-bold text-slate-600 bg-slate-100 px-3 py-2">
                <div>Metric</div>
                <div>Our session</div>
                <div>Target</div>
                <div>Status</div>
              </div>
              <div className="divide-y divide-slate-200">
                <div className="grid grid-cols-4 gap-0 px-3 py-2 text-[12px]">
                  <div className="text-slate-700 font-semibold">Fast start p50</div>
                  <div className="text-slate-900">{fastStartStats ? `${Math.round(fastStartStats.p50Ms)}ms` : '—'}</div>
                  <div className="text-slate-700">&lt; 800ms</div>
                  <div className={fastStartStats && fastStartStats.p50Ms < 800 ? 'text-green-700 font-bold' : 'text-slate-500'}>{fastStartStats ? (fastStartStats.p50Ms < 800 ? 'GOOD' : 'WATCH') : '—'}</div>
                </div>
                <div className="grid grid-cols-4 gap-0 px-3 py-2 text-[12px]">
                  <div className="text-slate-700 font-semibold">Fast start p95</div>
                  <div className="text-slate-900">{fastStartStats ? `${Math.round(fastStartStats.p95Ms)}ms` : '—'}</div>
                  <div className="text-slate-700">&lt; 1500ms</div>
                  <div className={fastStartStats && fastStartStats.p95Ms < 1500 ? 'text-green-700 font-bold' : 'text-slate-500'}>{fastStartStats ? (fastStartStats.p95Ms < 1500 ? 'GOOD' : 'WATCH') : '—'}</div>
                </div>
                <div className="grid grid-cols-4 gap-0 px-3 py-2 text-[12px]">
                  <div className="text-slate-700 font-semibold">Stalls (session)</div>
                  <div className="text-slate-900">{metrics.stallCount}</div>
                  <div className="text-slate-700">0 ideal</div>
                  <div className={metrics.stallCount === 0 ? 'text-green-700 font-bold' : 'text-orange-700 font-bold'}>{metrics.stallCount === 0 ? 'GOOD' : 'DEGRADED'}</div>
                </div>
                <div className="grid grid-cols-4 gap-0 px-3 py-2 text-[12px]">
                  <div className="text-slate-700 font-semibold">Session success rate</div>
                  <div className="text-slate-900">{metrics.sessionSuccessRate}%</div>
                  <div className="text-slate-700">&gt;= 99%</div>
                  <div className={metrics.sessionSuccessRate >= 99 ? 'text-green-700 font-bold' : metrics.sessionSuccessRate >= 95 ? 'text-orange-700 font-bold' : 'text-red-700 font-bold'}>{metrics.sessionSuccessRate >= 99 ? 'GOOD' : metrics.sessionSuccessRate >= 95 ? 'WATCH' : 'BAD'}</div>
                </div>
              </div>
            </div>

            <div className="mt-3 bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="grid grid-cols-3 gap-0 text-[11px] font-bold text-slate-600 bg-slate-100 px-3 py-2">
                <div>Service</div>
                <div>Time to first sound</div>
                <div>Notes</div>
              </div>
              <div className="divide-y divide-slate-200 text-[12px]">
                {[
                  { name: 'Spotify', note: 'Not publicly disclosed' },
                  { name: 'Apple Music', note: 'Not publicly disclosed' },
                  { name: 'SoundCloud', note: 'Not publicly disclosed' },
                  { name: 'YouTube Music', note: 'Not publicly disclosed' },
                  { name: 'focus.music (this session)', note: fastStartStats ? `p50 ${Math.round(fastStartStats.p50Ms)}ms · p95 ${Math.round(fastStartStats.p95Ms)}ms` : 'No samples yet' },
                ].map((row) => (
                  <div key={row.name} className="grid grid-cols-3 gap-0 px-3 py-2">
                    <div className="text-slate-700 font-semibold">{row.name}</div>
                    <div className="text-slate-900">{row.name === 'focus.music (this session)' ? (fastStartStats ? `${Math.round(fastStartStats.p50Ms)}ms (p50)` : '—') : '—'}</div>
                    <div className="text-slate-600">{row.note}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'raw' && (
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <FileJson className="w-5 h-5 text-slate-700" />
                <span className="text-sm font-bold text-slate-900">Raw diagnostics</span>
              </div>
              <button
                onClick={exportDiagnostics}
                className="px-3 py-1.5 text-[11px] font-bold bg-slate-100 hover:bg-slate-200 rounded transition-colors"
              >
                Download JSON
              </button>
            </div>
            <pre className="text-[10px] bg-white border border-slate-200 rounded p-2.5 overflow-auto max-h-[520px] whitespace-pre-wrap break-words">
              {JSON.stringify({ ...metrics, _debug: { fastStart: debugFastStart, fastStartEnabled: debugFastStartEnabled, fastStartStats } }, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

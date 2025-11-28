import { X, Activity, Wifi, WifiOff, Radio, AlertCircle, CheckCircle, Clock, TrendingUp, Zap, Move, Link } from 'lucide-react';
import { AudioMetrics } from '../lib/enterpriseAudioEngine';
import { useState, useEffect, useRef } from 'react';

type AudioEngineDiagnosticsProps = {
  metrics: AudioMetrics | null;
  onClose: () => void;
};

export function AudioEngineDiagnostics({ metrics, onClose }: AudioEngineDiagnosticsProps) {
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
      </div>
    </div>
  );
}

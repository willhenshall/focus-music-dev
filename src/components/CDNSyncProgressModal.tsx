import { X, CheckCircle2, Loader, AlertCircle, Cloud, FileAudio, FileJson } from 'lucide-react';
import { SyncProgress, TrackSyncStatus } from '../lib/cdnSyncService';

interface CDNSyncProgressModalProps {
  progress: SyncProgress;
  isComplete: boolean;
  onClose: () => void;
}

export function CDNSyncProgressModal({ progress, isComplete, onClose }: CDNSyncProgressModalProps) {
  const overallProgress = progress.totalTracks > 0
    ? Math.round((progress.completedTracks / progress.totalTracks) * 100)
    : 0;

  const trackStatuses = Array.from(progress.trackProgress.values());
  const visibleTracks = trackStatuses.slice(0, 10);

  const getPhaseIcon = (status: TrackSyncStatus) => {
    switch (status.phase) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />;
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />;
      case 'syncing-audio':
      case 'syncing-metadata':
        return <Loader className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0" />;
      default:
        return <Cloud className="w-5 h-5 text-slate-400 flex-shrink-0" />;
    }
  };

  const getPhaseText = (status: TrackSyncStatus) => {
    switch (status.phase) {
      case 'completed':
        return 'Completed';
      case 'failed':
        return `Failed${status.error ? `: ${status.error}` : ''}`;
      case 'syncing-audio':
        return 'Syncing audio file...';
      case 'syncing-metadata':
        return 'Syncing metadata...';
      default:
        return 'Pending';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col border border-blue-200">
        <div className="flex items-center justify-between p-6 border-b border-blue-200 bg-blue-50">
          <div className="flex items-center gap-3">
            <Cloud className="w-8 h-8 text-blue-600" />
            <div>
              <h2 className="text-2xl font-bold text-slate-900">
                {isComplete ? 'CDN Sync Complete' : 'Syncing to CDN'}
              </h2>
              <p className="text-sm text-slate-600 mt-0.5">
                {progress.totalBatches > 1 && (
                  <span>Batch {progress.currentBatch} of {progress.totalBatches} • </span>
                )}
                {progress.completedTracks} of {progress.totalTracks} tracks synced
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={!isComplete}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-white/50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 border-b border-slate-200">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 font-medium">Overall Progress</span>
              <span className="text-slate-900 font-semibold">{overallProgress}%</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  isComplete && progress.failedTracks === 0
                    ? 'bg-green-600'
                    : isComplete && progress.failedTracks > 0
                    ? 'bg-amber-600'
                    : 'bg-blue-600'
                }`}
                style={{ width: `${overallProgress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{progress.completedTracks} completed</span>
              {progress.failedTracks > 0 && (
                <span className="text-red-600 font-medium">{progress.failedTracks} failed</span>
              )}
              <span>{progress.totalTracks - progress.completedTracks - progress.failedTracks} remaining</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {visibleTracks.length === 0 && (
            <div className="text-center py-8">
              <Cloud className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">Preparing to sync tracks...</p>
            </div>
          )}

          {visibleTracks.map((status) => (
            <div
              key={status.trackId}
              className={`border rounded-lg p-4 transition-all ${
                status.phase === 'completed'
                  ? 'bg-green-50 border-green-200'
                  : status.phase === 'failed'
                  ? 'bg-red-50 border-red-200'
                  : status.phase === 'syncing-audio' || status.phase === 'syncing-metadata'
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-start gap-3">
                {getPhaseIcon(status)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {status.trackName}
                      </p>
                      <p className="text-xs text-slate-600 font-mono">
                        Track ID: {status.trackId}
                      </p>
                    </div>
                    <div className="text-xs text-slate-500 whitespace-nowrap">
                      {status.retryCount > 0 && (
                        <span className="text-amber-600">Retry {status.retryCount}</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <FileAudio className="w-3.5 h-3.5 text-slate-400" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-slate-600">Audio File</span>
                          {status.audioSynced ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                          ) : status.phase === 'syncing-audio' ? (
                            <Loader className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                          ) : null}
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-1.5">
                          <div
                            className={`h-full rounded-full transition-all ${
                              status.audioSynced ? 'bg-green-600' : 'bg-slate-400'
                            }`}
                            style={{ width: status.audioSynced ? '100%' : '0%' }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <FileJson className="w-3.5 h-3.5 text-slate-400" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-slate-600">JSON Sidecar</span>
                          {status.metadataSynced ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                          ) : status.phase === 'syncing-metadata' ? (
                            <Loader className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                          ) : null}
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-1.5">
                          <div
                            className={`h-full rounded-full transition-all ${
                              status.metadataSynced ? 'bg-green-600' : 'bg-slate-400'
                            }`}
                            style={{ width: status.metadataSynced ? '100%' : '0%' }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 mt-2">
                    {getPhaseText(status)}
                  </p>
                </div>
              </div>
            </div>
          ))}

          {trackStatuses.length > 10 && (
            <div className="text-center py-3 bg-slate-50 border border-slate-200 rounded-lg">
              <p className="text-sm text-slate-600">
                ... and {trackStatuses.length - 10} more tracks
              </p>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-200 bg-slate-50">
          {isComplete ? (
            <div className="space-y-4">
              {progress.failedTracks === 0 ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-green-900 font-semibold">All tracks synced successfully!</p>
                      <p className="text-xs text-green-700 mt-1">
                        {progress.completedTracks} {progress.completedTracks === 1 ? 'track' : 'tracks'} {progress.completedTracks === 1 ? 'is' : 'are'} now available on the CDN for faster global delivery.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-amber-900 font-semibold">
                        {progress.completedTracks} synced, {progress.failedTracks} failed
                      </p>
                      <p className="text-xs text-amber-700 mt-1">
                        Failed tracks are still playable from Supabase storage. You can retry syncing them from the Music Library admin panel.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end">
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 bg-slate-700 hover:bg-slate-800 text-white rounded-lg transition-colors font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600">
                Syncing in progress... Please wait.
              </p>
              <button
                disabled
                className="px-6 py-2.5 bg-slate-300 text-slate-500 rounded-lg font-medium cursor-not-allowed"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

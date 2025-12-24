import { useState } from 'react';
import { AlertTriangle, Trash2, Archive, CheckCircle, XCircle, Loader2 } from 'lucide-react';

export interface DeletionStatus {
  inProgress: boolean;
  completed: boolean;
  database: { status: 'pending' | 'success' | 'error'; count?: number };
  supabaseStorage: { status: 'pending' | 'success' | 'error'; count?: number };
  hlsStorage: { status: 'pending' | 'success' | 'error'; count?: number };
  cdn: { status: 'pending' | 'success' | 'error'; count?: number; failed?: number; hlsCount?: number };
  playlists: { status: 'pending' | 'success' | 'error'; count?: number; affected?: number };
  analytics: { status: 'pending' | 'success' | 'error'; count?: number };
  error?: string;
  batchProgress?: { current: number; total: number; tracksCurrent: number; tracksTotal: number };
  partialErrors?: string[];
}

interface DeleteConfirmationModalProps {
  trackCount: number;
  onSoftDelete: () => void;
  onPermanentDelete: () => void;
  onCancel: () => void;
  isDeleting: boolean;
  deletionStatus?: DeletionStatus;
}

export function DeleteConfirmationModal({
  trackCount,
  onSoftDelete,
  onPermanentDelete,
  onCancel,
  isDeleting,
  deletionStatus
}: DeleteConfirmationModalProps) {
  const [showPermanentConfirm, setShowPermanentConfirm] = useState(false);

  const StatusIcon = ({ status }: { status: 'pending' | 'success' | 'error' }) => {
    if (status === 'pending') return <Loader2 className="animate-spin text-blue-400" size={16} />;
    if (status === 'success') return <CheckCircle className="text-green-400" size={16} />;
    return <XCircle className="text-red-400" size={16} />;
  };

  const handlePermanentDeleteClick = () => {
    setShowPermanentConfirm(true);
  };

  const handleConfirmPermanent = () => {
    onPermanentDelete();
  };

  const handleBackToOptions = () => {
    setShowPermanentConfirm(false);
  };

  if (showPermanentConfirm || deletionStatus?.inProgress || deletionStatus?.completed) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-neutral-900 rounded-lg max-w-lg w-full mx-4 border border-red-500/50 shadow-2xl">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                {deletionStatus?.completed ? (
                  <CheckCircle className="text-green-400" size={24} />
                ) : (
                  <AlertTriangle className="text-red-500" size={24} />
                )}
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">
                  {deletionStatus?.completed ? 'Deletion Complete' :
                   deletionStatus?.inProgress ? 'Deleting Tracks...' :
                   'Are You Sure?'}
                </h2>
                <p className="text-sm text-red-400 font-medium">
                  {deletionStatus?.completed ? `${deletionStatus.database.count || 0} track${(deletionStatus.database.count || 0) !== 1 ? 's' : ''} permanently deleted` :
                   'This action cannot be undone'}
                </p>
              </div>
            </div>

            {!(deletionStatus?.inProgress || deletionStatus?.completed) && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
                <p className="text-white font-medium mb-2">
                  You are about to permanently delete {trackCount} track{trackCount > 1 ? 's' : ''}
                </p>
                <ul className="text-sm text-neutral-300 space-y-1">
                  <li>• Database records will be removed</li>
                  <li>• Audio files will be deleted from Supabase storage</li>
                  <li>• HLS streaming files will be deleted from storage</li>
                  <li>• Files will be removed from CDN (Cloudflare R2)</li>
                  <li>• Metadata sidecar files will be deleted</li>
                  <li>• All playlist references will be cleared</li>
                  <li>• Analytics data will be deleted</li>
                  <li>• This cannot be reversed or restored</li>
                </ul>
              </div>
            )}

            {!(deletionStatus?.inProgress || deletionStatus?.completed) && (
              <>
                <p className="text-neutral-300 mb-6">
                  Type <span className="font-mono bg-neutral-800 px-2 py-1 rounded text-white">DELETE</span> to confirm:
                </p>

                <input
                  type="text"
                  id="confirm-delete-input"
                  autoFocus
                  disabled={isDeleting}
                  className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-red-500 disabled:opacity-50 mb-6"
                  placeholder="Type DELETE to confirm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.currentTarget.value === 'DELETE') {
                      handleConfirmPermanent();
                    }
                  }}
                />
              </>
            )}

            {deletionStatus?.inProgress || deletionStatus?.completed ? (
              <div className="space-y-4 mt-6">
                <div className="border-t border-neutral-700 pt-4">
                  <h3 className="text-sm font-semibold text-white mb-3">Deletion Progress</h3>
                  {deletionStatus.batchProgress && deletionStatus.batchProgress.total > 1 && (
                    <div className="mb-4">
                      <div className="flex items-center justify-between text-sm text-neutral-300 mb-2">
                        <span>Batch {deletionStatus.batchProgress.current} of {deletionStatus.batchProgress.total}</span>
                        <span>{deletionStatus.batchProgress.tracksCurrent} / {deletionStatus.batchProgress.tracksTotal} tracks</span>
                      </div>
                      <div className="w-full bg-neutral-700 rounded-full h-2">
                        <div 
                          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(deletionStatus.batchProgress.current / deletionStatus.batchProgress.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div className="bg-neutral-800 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-300">Database Records</span>
                    <div className="flex items-center gap-2">
                      <StatusIcon status={deletionStatus.database.status} />
                      {deletionStatus.database.count !== undefined && (
                        <span className="text-xs text-neutral-400">{deletionStatus.database.count} deleted</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-300">Supabase Storage</span>
                    <div className="flex items-center gap-2">
                      <StatusIcon status={deletionStatus.supabaseStorage.status} />
                      {deletionStatus.supabaseStorage.count !== undefined && (
                        <span className="text-xs text-neutral-400">{deletionStatus.supabaseStorage.count} files deleted</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-300">HLS Storage</span>
                    <div className="flex items-center gap-2">
                      <StatusIcon status={deletionStatus.hlsStorage?.status || 'pending'} />
                      {deletionStatus.hlsStorage?.count !== undefined && (
                        <span className="text-xs text-neutral-400">
                          {deletionStatus.hlsStorage.count === 0 
                            ? 'N/A (no HLS files)' 
                            : `${deletionStatus.hlsStorage.count} files deleted`}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-300">CDN (Cloudflare R2)</span>
                    <div className="flex items-center gap-2">
                      <StatusIcon status={deletionStatus.cdn.status} />
                      {deletionStatus.cdn.count !== undefined && (
                        <span className="text-xs text-neutral-400">
                          {deletionStatus.cdn.count === 0 && !deletionStatus.cdn.failed && !deletionStatus.cdn.hlsCount
                            ? 'N/A (not synced)'
                            : `${deletionStatus.cdn.count + (deletionStatus.cdn.hlsCount || 0)} deleted${deletionStatus.cdn.failed ? ` (${deletionStatus.cdn.failed} failed)` : ''}`}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-300">Playlist References</span>
                    <div className="flex items-center gap-2">
                      <StatusIcon status={deletionStatus.playlists.status} />
                      {deletionStatus.playlists.count !== undefined && (
                        <span className="text-xs text-neutral-400">
                          {deletionStatus.playlists.count} removed
                          {deletionStatus.playlists.affected ? ` (${deletionStatus.playlists.affected} playlists)` : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-300">Analytics Data</span>
                    <div className="flex items-center gap-2">
                      <StatusIcon status={deletionStatus.analytics.status} />
                      {deletionStatus.analytics.count !== undefined && (
                        <span className="text-xs text-neutral-400">{deletionStatus.analytics.count} deleted</span>
                      )}
                    </div>
                  </div>
                </div>

                {deletionStatus.error && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    <p className="text-sm text-red-400">{deletionStatus.error}</p>
                  </div>
                )}

                {deletionStatus.partialErrors && deletionStatus.partialErrors.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                    <p className="text-sm text-amber-400 font-medium mb-2">Some batches had errors:</p>
                    <ul className="text-sm text-amber-300 space-y-1">
                      {deletionStatus.partialErrors.map((error, idx) => (
                        <li key={idx}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {deletionStatus.completed && (
                  <div className="flex justify-end">
                    <button
                      onClick={onCancel}
                      className="px-6 py-2 bg-neutral-700 text-white rounded-lg hover:bg-neutral-600 transition-colors font-medium"
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-6 flex gap-3 justify-end">
                <button
                  onClick={handleBackToOptions}
                  disabled={isDeleting}
                  className="px-4 py-2 text-neutral-300 hover:text-white transition-colors disabled:opacity-50"
                >
                  Go Back
                </button>
                <button
                  onClick={() => {
                    const input = document.getElementById('confirm-delete-input') as HTMLInputElement;
                    if (input?.value === 'DELETE') {
                      handleConfirmPermanent();
                    }
                  }}
                  disabled={isDeleting}
                  className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeleting ? 'Deleting...' : 'Permanently Delete'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-neutral-900 rounded-lg max-w-md w-full mx-4 border border-neutral-800 shadow-2xl">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center">
              <AlertTriangle className="text-red-500" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Delete Track{trackCount > 1 ? 's' : ''}</h2>
              <p className="text-sm text-neutral-400">
                {trackCount} track{trackCount > 1 ? 's' : ''} selected
              </p>
            </div>
          </div>

          <p className="text-neutral-300 mb-6">
            Choose how you want to delete {trackCount > 1 ? 'these tracks' : 'this track'}:
          </p>

          <div className="space-y-3">
            <button
              onClick={onSoftDelete}
              disabled={isDeleting}
              className="w-full flex items-start gap-3 p-4 bg-neutral-800 hover:bg-neutral-750 rounded-lg border border-neutral-700 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500/20 transition-colors">
                <Archive className="text-blue-500" size={20} />
              </div>
              <div>
                <div className="font-medium text-white mb-1">Move to Deleted Tracks</div>
                <div className="text-sm text-neutral-400">
                  Track{trackCount > 1 ? 's' : ''} can be restored later. File{trackCount > 1 ? 's' : ''} and metadata remain in the system.
                </div>
              </div>
            </button>

            <button
              onClick={handlePermanentDeleteClick}
              disabled={isDeleting}
              className="w-full flex items-start gap-3 p-4 bg-neutral-800 hover:bg-red-900/20 rounded-lg border border-neutral-700 hover:border-red-500/50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <div className="w-10 h-10 bg-red-500/10 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-red-500/20 transition-colors">
                <Trash2 className="text-red-500" size={20} />
              </div>
              <div>
                <div className="font-medium text-white mb-1 flex items-center gap-2">
                  Permanently Delete
                  <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">Irreversible</span>
                </div>
                <div className="text-sm text-neutral-400">
                  Remove from database, Supabase storage, CDN, and all playlist references. Cannot be undone.
                </div>
              </div>
            </button>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={onCancel}
              disabled={isDeleting}
              className="px-4 py-2 text-neutral-300 hover:text-white transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

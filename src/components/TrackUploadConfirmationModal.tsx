import { CheckCircle2, X, Music, Database, FileAudio, Clock, Tag, Cloud } from 'lucide-react';

interface UploadedTrackInfo {
  trackId: string;
  trackName: string;
  artistName: string;
  albumName?: string;
  genreCategory?: string;
  energyLevel: 'low' | 'medium' | 'high';
  tempo?: string;
  bpm?: string;
  duration: string;
  fileSize: string;
  fileName: string;
  storagePath: string;
  assignedChannels: Array<{ id: string; name: string }>;
  uploadTimestamp: string;
}

type CDNSyncStatus = 'pending' | 'syncing' | 'completed' | 'failed';

interface TrackUploadConfirmationModalProps {
  trackInfo: UploadedTrackInfo;
  cdnSyncStatus?: CDNSyncStatus;
  cdnUrl?: string;
  cdnError?: string;
  onClose: () => void;
}

export function TrackUploadConfirmationModal({
  trackInfo,
  cdnSyncStatus = 'completed',
  cdnUrl,
  cdnError,
  onClose
}: TrackUploadConfirmationModalProps) {
  const formatDuration = (seconds: string) => {
    const sec = parseInt(seconds, 10);
    if (isNaN(sec)) return seconds;
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: string) => {
    const size = parseInt(bytes, 10);
    if (isNaN(size)) return bytes;
    return `${(size / 1024 / 1024).toFixed(2)} MB`;
  };

  const getEnergyColor = (level: string) => {
    switch (level) {
      case 'low': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'medium': return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-slate-600 bg-slate-50 border-slate-200';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-green-200">
        <div className="flex items-center justify-between p-6 border-b border-green-200 bg-green-50">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Track Uploaded Successfully</h2>
              <p className="text-sm text-slate-600 mt-0.5">Your track has been uploaded to Supabase storage</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-white/50 rounded-lg"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <Music className="w-5 h-5 text-slate-600" />
              <h3 className="text-lg font-semibold text-slate-900">Track Information</h3>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                <span className="text-sm text-slate-500 font-medium">Track ID:</span>
                <span className="text-sm text-slate-900 font-mono col-span-2">{trackInfo.trackId}</span>
              </div>

              <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                <span className="text-sm text-slate-500 font-medium">Track Name:</span>
                <span className="text-sm text-slate-900 font-semibold col-span-2">{trackInfo.trackName}</span>
              </div>

              <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                <span className="text-sm text-slate-500 font-medium">Artist:</span>
                <span className="text-sm text-slate-900 col-span-2">{trackInfo.artistName || 'Unknown Artist'}</span>
              </div>

              {trackInfo.albumName && (
                <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                  <span className="text-sm text-slate-500 font-medium">Album:</span>
                  <span className="text-sm text-slate-900 col-span-2">{trackInfo.albumName}</span>
                </div>
              )}

              {trackInfo.genreCategory && (
                <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                  <span className="text-sm text-slate-500 font-medium">Genre:</span>
                  <span className="text-sm text-slate-900 col-span-2">{trackInfo.genreCategory}</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-x-4 gap-y-1 items-center">
                <span className="text-sm text-slate-500 font-medium">Energy Level:</span>
                <div className="col-span-2">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${getEnergyColor(trackInfo.energyLevel)}`}>
                    {trackInfo.energyLevel.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <Tag className="w-5 h-5 text-slate-600" />
              <h3 className="text-lg font-semibold text-slate-900">Audio Properties</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3 bg-white rounded-lg p-3 border border-slate-200">
                <Clock className="w-4 h-4 text-slate-500" />
                <div>
                  <p className="text-xs text-slate-500 font-medium">Duration</p>
                  <p className="text-sm text-slate-900 font-semibold">{formatDuration(trackInfo.duration)}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-white rounded-lg p-3 border border-slate-200">
                <FileAudio className="w-4 h-4 text-slate-500" />
                <div>
                  <p className="text-xs text-slate-500 font-medium">File Size</p>
                  <p className="text-sm text-slate-900 font-semibold">{formatFileSize(trackInfo.fileSize)}</p>
                </div>
              </div>

              {trackInfo.tempo && (
                <div className="flex items-center gap-3 bg-white rounded-lg p-3 border border-slate-200">
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Tempo</p>
                    <p className="text-sm text-slate-900 font-semibold">{trackInfo.tempo}</p>
                  </div>
                </div>
              )}

              {trackInfo.bpm && (
                <div className="flex items-center gap-3 bg-white rounded-lg p-3 border border-slate-200">
                  <div>
                    <p className="text-xs text-slate-500 font-medium">BPM</p>
                    <p className="text-sm text-slate-900 font-semibold">{trackInfo.bpm}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <Database className="w-5 h-5 text-slate-600" />
              <h3 className="text-lg font-semibold text-slate-900">Storage Details</h3>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-500 font-medium mb-1">Original Filename</p>
                <p className="text-sm text-slate-900 font-mono bg-white rounded px-3 py-2 border border-slate-200 break-all">
                  {trackInfo.fileName}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500 font-medium mb-1">Storage Path</p>
                <p className="text-sm text-slate-900 font-mono bg-white rounded px-3 py-2 border border-slate-200 break-all">
                  {trackInfo.storagePath}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500 font-medium mb-1">Upload Timestamp</p>
                <p className="text-sm text-slate-900 bg-white rounded px-3 py-2 border border-slate-200">
                  {new Date(trackInfo.uploadTimestamp).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {trackInfo.assignedChannels.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <Music className="w-5 h-5 text-slate-600" />
                <h3 className="text-lg font-semibold text-slate-900">Assigned Channels</h3>
                <span className="ml-auto text-xs font-semibold bg-slate-700 text-white px-2.5 py-1 rounded-full">
                  {trackInfo.assignedChannels.length}
                </span>
              </div>

              <div className="space-y-2">
                {trackInfo.assignedChannels.map((channel) => (
                  <div
                    key={channel.id}
                    className="flex items-center gap-3 bg-white rounded-lg px-4 py-2.5 border border-slate-200"
                  >
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm text-slate-900 font-medium">{channel.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {trackInfo.assignedChannels.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-900">
                <strong className="font-semibold">Note:</strong> This track has not been assigned to any channels yet. You can assign it to channels from the Music Library.
              </p>
            </div>
          )}

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-green-900 font-semibold mb-1">Upload Complete</p>
                <p className="text-sm text-green-800">
                  The track has been successfully uploaded to Supabase storage and all metadata has been saved to the database.
                  A JSON sidecar file has also been created for metadata recovery.
                </p>
              </div>
            </div>
          </div>

          {cdnSyncStatus === 'completed' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-green-900 font-semibold mb-1">Synced to CDN Successfully</p>
                  <p className="text-sm text-green-800 mb-2">
                    Track is now available on the CDN for faster global delivery.
                  </p>
                  {cdnUrl && (
                    <p className="text-xs text-green-700 font-mono bg-green-100 rounded px-2 py-1 break-all">
                      {cdnUrl}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {cdnSyncStatus === 'syncing' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Cloud className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0 animate-pulse" />
                <div>
                  <p className="text-sm text-blue-900 font-semibold mb-1">CDN Sync In Progress</p>
                  <p className="text-sm text-blue-800">
                    Your track is being synchronized to the CDN for faster global delivery. This typically completes within 30 seconds.
                  </p>
                </div>
              </div>
            </div>
          )}

          {cdnSyncStatus === 'failed' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-amber-900 font-semibold mb-1">CDN Sync Failed</p>
                  <p className="text-sm text-amber-800 mb-2">
                    Track is still playable from Supabase storage. You can retry syncing from the Music Library.
                  </p>
                  {cdnError && (
                    <p className="text-xs text-amber-700 bg-amber-100 rounded px-2 py-1">
                      Error: {cdnError}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {cdnSyncStatus === 'pending' && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Cloud className="w-5 h-5 text-slate-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm text-slate-900 font-semibold mb-1">CDN Sync Pending</p>
                  <p className="text-sm text-slate-700">
                    Track will be synced to the CDN shortly.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-700 hover:bg-slate-800 text-white rounded-lg transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

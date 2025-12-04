import { CheckCircle2, Loader, AlertCircle, Upload, FileJson, Database, Cloud, ChevronDown, ChevronUp, Radio } from 'lucide-react';
import { useState } from 'react';

export type UploadStep = 'storage' | 'sidecar' | 'database' | 'cdn' | 'transcoding' | 'hls-storage' | 'hls-cdn';
export type StepStatus = 'pending' | 'in-progress' | 'completed' | 'failed' | 'skipped';

export interface TrackUploadProgress {
  trackId: string;
  trackName: string;
  currentStep: UploadStep;
  hasHLS: boolean; // Whether this track has HLS files to upload
  steps: {
    storage: StepStatus;
    sidecar: StepStatus;
    database: StepStatus;
    cdn: StepStatus;
    transcoding: StepStatus;
    'hls-storage': StepStatus;
    'hls-cdn': StepStatus;
  };
  stepProgress?: {
    storage?: number;
    sidecar?: number;
    database?: number;
    cdn?: number;
    transcoding?: number;
    'hls-storage'?: number;
    'hls-cdn'?: number;
  };
  error?: string;
}

export interface MultiStepUploadProgress {
  totalTracks: number;
  currentTrackIndex: number;
  tracks: Map<string, TrackUploadProgress>;
  isComplete: boolean;
  hasErrors: boolean;
}

interface MultiStepUploadProgressModalProps {
  progress: MultiStepUploadProgress;
  onClose: () => void;
}

const STEP_CONFIG: Record<UploadStep, { label: string; icon: any; description: string }> = {
  storage: {
    label: 'Upload MP3 to Storage',
    icon: Upload,
    description: 'Uploading audio file to cloud storage',
  },
  sidecar: {
    label: 'Sidecar File Creation',
    icon: FileJson,
    description: 'Creating metadata companion files',
  },
  database: {
    label: 'Ingest into Database',
    icon: Database,
    description: 'Storing track metadata in database',
  },
  cdn: {
    label: 'Sync MP3 to CDN',
    icon: Cloud,
    description: 'Syncing MP3 to content delivery network',
  },
  transcoding: {
    label: 'HLS Transcoding',
    icon: Radio,
    description: 'Converting MP3 to HLS streaming format',
  },
  'hls-storage': {
    label: 'Upload HLS to Storage',
    icon: Radio,
    description: 'Uploading HLS streaming files',
  },
  'hls-cdn': {
    label: 'Sync HLS to CDN',
    icon: Radio,
    description: 'Syncing HLS files to CDN',
  },
};

const STEP_ORDER: UploadStep[] = ['storage', 'sidecar', 'database', 'cdn', 'transcoding', 'hls-storage', 'hls-cdn'];

export function MultiStepUploadProgressModal({ progress, onClose }: MultiStepUploadProgressModalProps) {
  const [showAllTracks, setShowAllTracks] = useState(false);
  const tracks = Array.from(progress.tracks.values());
  const currentTrack = tracks[progress.currentTrackIndex];
  
  // A track is complete when its final step is done (hls-cdn if has HLS, cdn otherwise)
  const isTrackComplete = (track: TrackUploadProgress) => {
    if (track.hasHLS) {
      return track.steps['hls-cdn'] === 'completed';
    }
    return track.steps.cdn === 'completed';
  };
  
  const completedTracks = tracks.filter(isTrackComplete).length;
  const failedTracks = tracks.filter(t =>
    Object.values(t.steps).some(status => status === 'failed')
  ).length;

  // Calculate overall progress based on all steps across all tracks, including in-progress percentages
  // Each track has 4 base steps + 3 HLS steps (transcoding, hls-storage, hls-cdn) if HLS is included
  const totalSteps = tracks.reduce((sum, track) => sum + (track.hasHLS ? 7 : 4), 0);
  const completedSteps = tracks.reduce((sum, track) => {
    let trackProgress = 0;
    const stepsToCount = track.hasHLS 
      ? STEP_ORDER 
      : STEP_ORDER.filter(s => !s.startsWith('hls') && s !== 'transcoding');
    
    stepsToCount.forEach((step) => {
      const status = track.steps[step];
      if (status === 'completed') {
        trackProgress += 1;
      } else if (status === 'skipped') {
        trackProgress += 1; // Count skipped as complete for progress
      } else if (status === 'in-progress' && track.stepProgress) {
        const percentage = track.stepProgress[step] || 0;
        trackProgress += percentage / 100;
      }
    });
    return sum + trackProgress;
  }, 0);

  const overallProgress = totalSteps > 0
    ? Math.round((completedSteps / totalSteps) * 100)
    : 0;

  const getStepIcon = (status: StepStatus) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      case 'in-progress':
        return <Loader className="w-4 h-4 text-blue-600 animate-spin" />;
      case 'skipped':
        return <div className="w-4 h-4 rounded-full border-2 border-slate-400 bg-slate-200" />;
      default:
        return <div className="w-4 h-4 rounded-full border-2 border-slate-300" />;
    }
  };

  const getStepColor = (status: StepStatus) => {
    switch (status) {
      case 'completed':
        return 'bg-green-50 border-green-200';
      case 'failed':
        return 'bg-red-50 border-red-200';
      case 'in-progress':
        return 'bg-blue-50 border-blue-200';
      case 'skipped':
        return 'bg-slate-100 border-slate-300';
      default:
        return 'bg-slate-50 border-slate-200';
    }
  };

  // Determine which tracks to show
  const displayedTracks = showAllTracks ? tracks : tracks.slice(0, 10);
  const hasMoreTracks = tracks.length > 10;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col border border-blue-200">
        {/* Compact Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-blue-200 bg-blue-50">
          <div className="flex items-center gap-3">
            <Upload className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {progress.isComplete ? 'Upload Complete' : 'Uploading Tracks'}
              </h2>
              <p className="text-xs text-slate-600">
                {progress.isComplete
                  ? `${completedTracks} of ${progress.totalTracks} tracks uploaded successfully`
                  : `Processing track ${progress.currentTrackIndex + 1} of ${progress.totalTracks}`
                }
              </p>
            </div>
          </div>
        </div>

        {/* Overall Progress - Compact */}
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 font-medium">Overall Progress</span>
              <span className="text-slate-900 font-semibold">{overallProgress}%</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  progress.isComplete && failedTracks === 0
                    ? 'bg-green-600'
                    : progress.isComplete && failedTracks > 0
                    ? 'bg-amber-600'
                    : 'bg-blue-600'
                }`}
                style={{ width: `${overallProgress}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{completedTracks} completed</span>
              {failedTracks > 0 && (
                <span className="text-red-600 font-medium">{failedTracks} failed</span>
              )}
              <span>{progress.totalTracks - completedTracks - failedTracks} remaining</span>
            </div>
          </div>
        </div>

        {/* Main Content - Scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Current Track with Compact 4-Step Grid */}
          {currentTrack && !progress.isComplete && (
            <div className="mb-4">
              <div className="mb-3">
                <p className="text-xs text-slate-500">Track ID: {currentTrack.trackId}</p>
              </div>

              {/* Dynamic Grid for Steps - shows 4 or 7 steps based on HLS */}
              <div className={`grid gap-2 ${currentTrack.hasHLS ? 'grid-cols-3 lg:grid-cols-4' : 'grid-cols-2'}`}>
                {STEP_ORDER
                  .filter(stepKey => currentTrack.hasHLS || (!stepKey.startsWith('hls') && stepKey !== 'transcoding'))
                  .map((stepKey, index) => {
                  const step = STEP_CONFIG[stepKey];
                  const status = currentTrack.steps[stepKey];
                  const StepIcon = step.icon;

                  return (
                    <div
                      key={stepKey}
                      className={`border rounded-lg p-3 transition-all ${getStepColor(status)}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-white border border-slate-300 flex-shrink-0 text-xs font-semibold text-slate-700">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <StepIcon className="w-3.5 h-3.5 text-slate-600" />
                            <span className="text-xs font-semibold text-slate-900">{step.label}</span>
                          </div>
                          <p className="text-xs text-slate-600 mb-1.5">{step.description}</p>
                          <div className="flex items-center gap-1.5">
                            {getStepIcon(status)}
                            <span className="text-xs font-medium text-slate-700">
                              {status === 'pending' && 'Waiting...'}
                              {status === 'in-progress' && (
                                currentTrack.stepProgress?.[stepKey]
                                  ? `${Math.round(currentTrack.stepProgress[stepKey]!)}%`
                                  : 'In progress...'
                              )}
                              {status === 'completed' && 'Completed'}
                              {status === 'failed' && 'Failed'}
                              {status === 'skipped' && 'Skipped'}
                            </span>
                          </div>
                          {status === 'in-progress' && currentTrack.stepProgress?.[stepKey] && (
                            <div className="mt-1.5 w-full bg-slate-200 rounded-full h-1 overflow-hidden">
                              <div
                                className="h-full bg-blue-600 transition-all duration-300"
                                style={{ width: `${currentTrack.stepProgress[stepKey]}%` }}
                              />
                            </div>
                          )}
                          {status === 'failed' && currentTrack.error && (
                            <p className="text-xs text-red-600 mt-1">{currentTrack.error}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Track List - Compact */}
          {tracks.length > 1 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-700 mb-2 flex items-center justify-between">
                <span>Track List ({tracks.length} total)</span>
                {hasMoreTracks && !showAllTracks && (
                  <span className="text-slate-500 font-normal">Showing first 10</span>
                )}
              </h4>
              <div className="space-y-1.5">
                {displayedTracks.map((track, index) => {
                  const isComplete = isTrackComplete(track);
                  const hasFailed = Object.values(track.steps).some(s => s === 'failed');
                  const isCurrent = index === progress.currentTrackIndex;

                  return (
                    <div
                      key={track.trackId}
                      className={`flex items-center justify-between px-3 py-2 rounded border text-xs ${
                        isCurrent
                          ? 'bg-blue-50 border-blue-200'
                          : isComplete
                          ? 'bg-green-50 border-green-200'
                          : hasFailed
                          ? 'bg-red-50 border-red-200'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-xs font-medium text-slate-500 flex-shrink-0 w-6">
                          #{index + 1}
                        </span>
                        <span className="text-xs text-slate-900 truncate">{track.trackName}</span>
                      </div>
                      {isComplete && <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />}
                      {hasFailed && <AlertCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />}
                      {isCurrent && !isComplete && (
                        <Loader className="w-3.5 h-3.5 text-blue-600 animate-spin flex-shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Show More Button */}
              {hasMoreTracks && (
                <button
                  onClick={() => setShowAllTracks(!showAllTracks)}
                  className="mt-2 w-full py-2 px-3 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors flex items-center justify-center gap-1.5"
                >
                  {showAllTracks ? (
                    <>
                      <ChevronUp className="w-3.5 h-3.5" />
                      Show Less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" />
                      Show All {tracks.length} Tracks
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Compact Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50">
          {progress.isComplete ? (
            <div className="space-y-3">
              {failedTracks === 0 ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-green-900 font-semibold">
                        All tracks uploaded successfully!
                      </p>
                      <p className="text-xs text-green-700 mt-0.5">
                        {completedTracks} {completedTracks === 1 ? 'track' : 'tracks'} fully processed and synced to CDN.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-amber-900 font-semibold">
                        {completedTracks} uploaded, {failedTracks} failed
                      </p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        Some tracks encountered errors during upload.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end">
                <button
                  onClick={onClose}
                  className="px-5 py-2 bg-slate-700 hover:bg-slate-800 text-white text-sm rounded-lg transition-colors font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-600">Upload in progress... Please wait.</p>
              <button
                disabled
                className="px-5 py-2 bg-slate-300 text-slate-500 text-sm rounded-lg font-medium cursor-not-allowed"
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

import { supabase } from './supabase';

const BATCH_SIZE = 20;
const MAX_CONCURRENT = 5;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

export type SyncPhase = 'pending' | 'syncing-audio' | 'syncing-metadata' | 'completed' | 'failed';

export interface TrackSyncStatus {
  trackId: string;
  trackName: string;
  phase: SyncPhase;
  audioSynced: boolean;
  metadataSynced: boolean;
  error?: string;
  retryCount: number;
}

export interface SyncProgress {
  totalTracks: number;
  completedTracks: number;
  failedTracks: number;
  currentBatch: number;
  totalBatches: number;
  trackProgress: Map<string, TrackSyncStatus>;
}

export interface SyncResult {
  success: boolean;
  totalTracks: number;
  syncedTracks: number;
  failedTracks: number;
  errors: Array<{ trackId: string; error: string }>;
}

export class CDNSyncService {
  private progressCallback?: (progress: SyncProgress) => void;
  private progress: SyncProgress;

  constructor() {
    this.progress = {
      totalTracks: 0,
      completedTracks: 0,
      failedTracks: 0,
      currentBatch: 0,
      totalBatches: 0,
      trackProgress: new Map(),
    };
  }

  async syncTracksToCDN(
    trackIds: string[],
    onProgress?: (progress: SyncProgress) => void
  ): Promise<SyncResult> {
    this.progressCallback = onProgress;
    const errors: Array<{ trackId: string; error: string }> = [];

    const totalBatches = Math.ceil(trackIds.length / BATCH_SIZE);
    this.progress = {
      totalTracks: trackIds.length,
      completedTracks: 0,
      failedTracks: 0,
      currentBatch: 0,
      totalBatches,
      trackProgress: new Map(),
    };

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, trackIds.length);
      const batchTrackIds = trackIds.slice(batchStart, batchEnd);

      this.progress.currentBatch = batchIndex + 1;
      this.notifyProgress();

      const batchResults = await this.syncBatch(batchTrackIds);
      errors.push(...batchResults.filter(r => r.error).map(r => ({ trackId: r.trackId, error: r.error! })));
    }

    return {
      success: errors.length === 0,
      totalTracks: trackIds.length,
      syncedTracks: this.progress.completedTracks,
      failedTracks: this.progress.failedTracks,
      errors,
    };
  }

  private async syncBatch(trackIds: string[]): Promise<Array<{ trackId: string; error?: string }>> {
    const results: Array<{ trackId: string; error?: string }> = [];

    for (let i = 0; i < trackIds.length; i += MAX_CONCURRENT) {
      const chunk = trackIds.slice(i, Math.min(i + MAX_CONCURRENT, trackIds.length));
      const chunkResults = await Promise.all(
        chunk.map(trackId => this.syncSingleTrack(trackId))
      );
      results.push(...chunkResults);
    }

    return results;
  }

  private async syncSingleTrack(trackId: string): Promise<{ trackId: string; error?: string }> {
    const { data: trackData, error: fetchError } = await supabase
      .from('audio_tracks')
      .select('track_id, metadata')
      .eq('track_id', trackId)
      .is('deleted_at', null)
      .maybeSingle();

    if (fetchError || !trackData) {
      this.updateTrackStatus(trackId, {
        trackId,
        trackName: trackId,
        phase: 'failed',
        audioSynced: false,
        metadataSynced: false,
        error: 'Track not found in database',
        retryCount: 0,
      });
      return { trackId, error: 'Track not found in database' };
    }

    const trackName = trackData.metadata?.track_name || trackId;

    this.updateTrackStatus(trackId, {
      trackId,
      trackName,
      phase: 'pending',
      audioSynced: false,
      metadataSynced: false,
      retryCount: 0,
    });

    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
      try {
        this.updateTrackStatus(trackId, {
          trackId,
          trackName,
          phase: 'syncing-audio',
          audioSynced: false,
          metadataSynced: false,
          retryCount: attempt - 1,
        });

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-to-cdn`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              trackId: trackId,
              operation: 'upload',
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'CDN sync failed');
        }

        const result = await response.json();

        this.updateTrackStatus(trackId, {
          trackId,
          trackName,
          phase: 'completed',
          audioSynced: true,
          metadataSynced: true,
          retryCount: attempt - 1,
        });

        this.progress.completedTracks++;
        this.notifyProgress();

        return { trackId };

      } catch (error: any) {
        if (attempt === RETRY_ATTEMPTS) {
          this.updateTrackStatus(trackId, {
            trackId,
            trackName,
            phase: 'failed',
            audioSynced: false,
            metadataSynced: false,
            error: error.message,
            retryCount: attempt,
          });

          this.progress.failedTracks++;
          this.notifyProgress();

          return { trackId, error: error.message };
        }

        await this.delay(RETRY_DELAY_MS * Math.pow(2, attempt - 1));
      }
    }

    return { trackId, error: 'Max retries exceeded' };
  }

  private updateTrackStatus(trackId: string, status: TrackSyncStatus) {
    this.progress.trackProgress.set(trackId, status);
    this.notifyProgress();
  }

  private notifyProgress() {
    if (this.progressCallback) {
      this.progressCallback({ ...this.progress });
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export async function syncTracksToCDN(
  trackIds: string[],
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncResult> {
  const service = new CDNSyncService();
  return service.syncTracksToCDN(trackIds, onProgress);
}

export async function getTrackCDNStatus(trackId: string): Promise<{
  synced: boolean;
  cdnUrl?: string;
  uploadedAt?: string;
}> {
  const { data, error } = await supabase
    .from('audio_tracks')
    .select('cdn_url, cdn_uploaded_at, storage_locations')
    .eq('track_id', trackId)
    .maybeSingle();

  if (error || !data) {
    return { synced: false };
  }

  const storageLocations = data.storage_locations as any;
  const isSynced = storageLocations?.r2_cdn === true;

  return {
    synced: isSynced,
    cdnUrl: data.cdn_url || undefined,
    uploadedAt: data.cdn_uploaded_at || undefined,
  };
}

export function getCDNStatusFromStorageLocations(storageLocations: any): 'synced' | 'not-synced' | 'failed' | 'pending' {
  if (!storageLocations) return 'not-synced';

  const r2Status = storageLocations.r2_cdn;

  if (r2Status === true) return 'synced';
  if (r2Status === false) return 'not-synced';
  if (r2Status === 'pending') return 'pending';
  if (r2Status === 'failed') return 'failed';

  return 'not-synced';
}

export interface CDNDeleteResult {
  success: boolean;
  totalTracks: number;
  deletedTracks: number;
  failedTracks: number;
  errors: Array<{ trackId: string; error: string }>;
}

export async function deleteTracksFromCDN(trackIds: string[]): Promise<CDNDeleteResult> {
  const errors: Array<{ trackId: string; error: string }> = [];
  let deletedCount = 0;

  for (const trackId of trackIds) {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-to-cdn`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            trackId: trackId,
            operation: 'delete',
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'CDN deletion failed');
      }

      deletedCount++;
    } catch (error: any) {
      console.error(`Failed to delete track ${trackId} from CDN:`, error);
      errors.push({ trackId, error: error.message });
    }
  }

  return {
    success: errors.length === 0,
    totalTracks: trackIds.length,
    deletedTracks: deletedCount,
    failedTracks: errors.length,
    errors,
  };
}

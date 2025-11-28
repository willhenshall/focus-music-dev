import { useState, useCallback } from 'react';
import { syncTracksToCDN, SyncProgress, SyncResult } from '../lib/cdnSyncService';

export function useCDNSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const syncTracks = useCallback(async (trackIds: string[]) => {
    if (trackIds.length === 0) {
      return { success: true, totalTracks: 0, syncedTracks: 0, failedTracks: 0, errors: [] };
    }

    setIsSyncing(true);
    setProgress(null);
    setResult(null);
    setError(null);

    try {
      const syncResult = await syncTracksToCDN(trackIds, (updatedProgress) => {
        setProgress(updatedProgress);
      });

      setResult(syncResult);
      setIsSyncing(false);

      return syncResult;
    } catch (err: any) {
      const errorMessage = err.message || 'CDN sync failed';
      setError(errorMessage);
      setIsSyncing(false);

      return {
        success: false,
        totalTracks: trackIds.length,
        syncedTracks: 0,
        failedTracks: trackIds.length,
        errors: [{ trackId: 'unknown', error: errorMessage }],
      };
    }
  }, []);

  const reset = useCallback(() => {
    setIsSyncing(false);
    setProgress(null);
    setResult(null);
    setError(null);
  }, []);

  return {
    isSyncing,
    progress,
    result,
    error,
    syncTracks,
    reset,
  };
}

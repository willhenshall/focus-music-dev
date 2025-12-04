import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface HLSSyncProgress {
  trackId: string;
  phase: 'uploading-storage' | 'syncing-cdn' | 'completed' | 'failed';
  filesUploaded: number;
  totalFiles: number;
  error?: string;
}

export interface HLSSyncResult {
  success: boolean;
  trackId: string;
  hlsPath?: string;
  hlsCdnUrl?: string;
  segmentCount?: number;
  error?: string;
}

// R2 CDN configuration (matches sync-to-cdn edge function)
const R2_CONFIG = {
  publicUrl: 'https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev',
  hlsPath: 'hls',
};

export function useHLSSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [progress, setProgress] = useState<HLSSyncProgress | null>(null);

  /**
   * Upload HLS files to Supabase Storage (audio-hls bucket)
   */
  const uploadHLSToStorage = useCallback(async (
    trackId: string,
    files: File[],
    onProgress?: (uploaded: number, total: number) => void
  ): Promise<{ success: boolean; error?: string }> => {
    const totalFiles = files.length;
    let uploadedCount = 0;

    for (const file of files) {
      const storagePath = `${trackId}/${file.name}`;
      const contentType = file.name.endsWith('.m3u8') 
        ? 'application/vnd.apple.mpegurl' 
        : 'video/mp2t';

      const { error } = await supabase.storage
        .from('audio-hls')
        .upload(storagePath, file, {
          contentType,
          upsert: true,
        });

      if (error) {
        console.error(`Failed to upload HLS file ${file.name}:`, error);
        return { success: false, error: `Failed to upload ${file.name}: ${error.message}` };
      }

      uploadedCount++;
      onProgress?.(uploadedCount, totalFiles);
    }

    return { success: true };
  }, []);

  /**
   * Sync HLS files from Supabase Storage to R2 CDN via edge function
   */
  const syncHLSToCDN = useCallback(async (
    trackId: string,
    files: File[],
    onProgress?: (progress: HLSSyncProgress) => void
  ): Promise<HLSSyncResult> => {
    setIsSyncing(true);
    
    const segmentCount = files.filter(f => f.name.endsWith('.ts')).length;
    
    try {
      // Phase 1: Upload to Supabase Storage
      setProgress({
        trackId,
        phase: 'uploading-storage',
        filesUploaded: 0,
        totalFiles: files.length,
      });
      onProgress?.({
        trackId,
        phase: 'uploading-storage',
        filesUploaded: 0,
        totalFiles: files.length,
      });

      const uploadResult = await uploadHLSToStorage(trackId, files, (uploaded, total) => {
        const progressUpdate = {
          trackId,
          phase: 'uploading-storage' as const,
          filesUploaded: uploaded,
          totalFiles: total,
        };
        setProgress(progressUpdate);
        onProgress?.(progressUpdate);
      });

      if (!uploadResult.success) {
        const failedProgress = {
          trackId,
          phase: 'failed' as const,
          filesUploaded: 0,
          totalFiles: files.length,
          error: uploadResult.error,
        };
        setProgress(failedProgress);
        onProgress?.(failedProgress);
        setIsSyncing(false);
        return { success: false, trackId, error: uploadResult.error };
      }

      // Phase 2: Sync to CDN via edge function
      setProgress({
        trackId,
        phase: 'syncing-cdn',
        filesUploaded: files.length,
        totalFiles: files.length,
      });
      onProgress?.({
        trackId,
        phase: 'syncing-cdn',
        filesUploaded: files.length,
        totalFiles: files.length,
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
            trackId,
            operation: 'upload-hls',
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'HLS CDN sync failed');
      }

      const result = await response.json();
      const hlsPath = `${trackId}/master.m3u8`;
      const hlsCdnUrl = `${R2_CONFIG.publicUrl}/${R2_CONFIG.hlsPath}/${trackId}/master.m3u8`;

      // Update database with HLS info
      await supabase
        .from('audio_tracks')
        .update({
          hls_path: hlsPath,
          hls_cdn_url: hlsCdnUrl,
          hls_segment_count: segmentCount,
          hls_transcoded_at: new Date().toISOString(),
        })
        .eq('track_id', trackId);

      const completedProgress = {
        trackId,
        phase: 'completed' as const,
        filesUploaded: files.length,
        totalFiles: files.length,
      };
      setProgress(completedProgress);
      onProgress?.(completedProgress);
      setIsSyncing(false);

      return {
        success: true,
        trackId,
        hlsPath,
        hlsCdnUrl,
        segmentCount,
      };

    } catch (error: any) {
      const failedProgress = {
        trackId,
        phase: 'failed' as const,
        filesUploaded: 0,
        totalFiles: files.length,
        error: error.message,
      };
      setProgress(failedProgress);
      onProgress?.(failedProgress);
      setIsSyncing(false);
      
      return { success: false, trackId, error: error.message };
    }
  }, [uploadHLSToStorage]);

  const reset = useCallback(() => {
    setIsSyncing(false);
    setProgress(null);
  }, []);

  return {
    isSyncing,
    progress,
    syncHLSToCDN,
    uploadHLSToStorage,
    reset,
  };
}

import { useState } from 'react';
import { X, Upload, Loader, AlertCircle } from 'lucide-react';
import { supabase, AudioChannel } from '../lib/supabase';
import { TrackUploadConfirmationModal } from './TrackUploadConfirmationModal';
import { MultiStepUploadProgressModal, MultiStepUploadProgress, TrackUploadProgress, UploadStep, StepStatus } from './MultiStepUploadProgressModal';
import { useCDNSync } from '../hooks/useCDNSync';

// HLS Transcoder service URL - can be configured via environment variable
const HLS_TRANSCODER_URL = import.meta.env.VITE_HLS_TRANSCODER_URL || 'http://localhost:3000';

// Response from HLS transcoder sync API
interface HLSTranscodeResult {
  success: boolean;
  jobId: string;
  originalFileName: string;
  hlsFolder: string;
  segmentCount: number;
  files: Array<{
    name: string;
    size: number;
    contentType: string;
    data: string; // base64 encoded
  }>;
  transcodeDurationMs: number;
  error?: string;
}

interface TrackUploadModalProps {
  onClose: () => void;
  onSuccess: () => void;
  channels: AudioChannel[];
}

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

interface DuplicateConflict {
  fileName: string;
  trackName: string;
  existingTrackId: string;
  existingTrackName: string;
  action: 'skip' | 'replace' | 'rename' | 'pending';
}

interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingTrack?: {
    id: string;
    track_id: string;
    track_name: string;
    artist_name: string;
  };
}

export function TrackUploadModal({ onClose, onSuccess, channels }: TrackUploadModalProps) {
  const [bulkMode, setBulkMode] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioFiles, setAudioFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [multiStepProgress, setMultiStepProgress] = useState<MultiStepUploadProgress | null>(null);
  const [duplicateConflicts, setDuplicateConflicts] = useState<DuplicateConflict[]>([]);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [uploadedTrackInfo, setUploadedTrackInfo] = useState<UploadedTrackInfo | null>(null);
  const [uploadedTrackIds, setUploadedTrackIds] = useState<string[]>([]);
  const { isSyncing, progress: cdnProgress, syncTracks } = useCDNSync();
  const [formData, setFormData] = useState({
    track_id: '',
    track_name: '',
    artist_name: '',
    album_name: '',
    genre_category: '',
    tempo: '',
    bpm: '',
    energy_level: 'medium' as 'low' | 'medium' | 'high',
    source: '',
    file_id: '',
    track_number: '',
    duration: '',
  });
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [skipChannelAssignment, setSkipChannelAssignment] = useState(false);
  const [nextTrackIdNumber, setNextTrackIdNumber] = useState<number | null>(null);

  // Generate next available track ID using atomic database sequence
  const getNextTrackId = async (): Promise<string> => {
    try {
      // Use database function for atomic ID generation (eliminates race conditions)
      const { data: functionResult, error: functionError } = await supabase
        .rpc('get_next_track_id');

      if (!functionError && functionResult) {
        return functionResult.toString();
      }

      // Fallback: Simple max + 1 (only used if sequence not yet installed)
      console.warn('Database sequence not available, using fallback method');
      const { data, error } = await supabase
        .from('audio_tracks')
        .select('track_id')
        .not('track_id', 'is', null)
        .order('track_id', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      const maxId = data?.track_id || 99993;
      const nextId = maxId + 1;

      console.log(`Assigned track_id ${nextId} using fallback method`);
      return nextId.toString();
    } catch (error) {
      console.error('Error generating track ID:', error);
      throw new Error('Failed to generate unique track ID. Please try again.');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (bulkMode && e.target.files) {
      const files = Array.from(e.target.files);
      setAudioFiles(files);
    } else if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAudioFile(file);

      if (!formData.track_name) {
        const fileName = file.name.replace(/\.[^/.]+$/, '');
        setFormData(prev => ({ ...prev, track_name: fileName }));
      }

      const audio = new Audio();
      const objectUrl = URL.createObjectURL(file);
      audio.src = objectUrl;

      audio.addEventListener('loadedmetadata', () => {
        const durationSeconds = Math.round(audio.duration);
        setFormData(prev => ({ ...prev, duration: durationSeconds.toString() }));
        URL.revokeObjectURL(objectUrl);
      });
    }
  };

  // Transcode MP3 to HLS using the transcoder service
  const transcodeToHLS = async (
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<HLSTranscodeResult> => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      onProgress?.(10); // Starting upload to transcoder
      
      const response = await fetch(`${HLS_TRANSCODER_URL}/api/transcode-sync`, {
        method: 'POST',
        body: formData,
      });

      onProgress?.(50); // Transcoding in progress

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Transcoding failed');
      }

      const result = await response.json();
      onProgress?.(100);
      
      return result;
    } catch (error: any) {
      // Check if transcoder service is unavailable
      if (error.message.includes('fetch') || error.message.includes('network')) {
        throw new Error('HLS transcoder service unavailable. Please ensure the service is running.');
      }
      throw error;
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleChannel = (channelId: string) => {
    setSelectedChannels(prev =>
      prev.includes(channelId)
        ? prev.filter(id => id !== channelId)
        : [...prev, channelId]
    );
  };

  // Helper function to initialize multi-step progress
  // hasHLS is now always true since we auto-transcode all tracks
  const initializeMultiStepProgress = (trackCount: number, trackNames: string[], trackHasHLS: boolean[]) => {
    const tracks = new Map<string, TrackUploadProgress>();
    trackNames.forEach((name, index) => {
      const hasHLS = trackHasHLS[index] || false;
      tracks.set(`temp-${index}`, {
        trackId: `temp-${index}`,
        trackName: name,
        currentStep: 'storage',
        hasHLS,
        steps: {
          storage: 'pending',
          sidecar: 'pending',
          database: 'pending',
          cdn: 'pending',
          transcoding: hasHLS ? 'pending' : 'skipped',
          'hls-storage': hasHLS ? 'pending' : 'skipped',
          'hls-cdn': hasHLS ? 'pending' : 'skipped',
        },
      });
    });

    setMultiStepProgress({
      totalTracks: trackCount,
      currentTrackIndex: 0,
      tracks,
      isComplete: false,
      hasErrors: false,
    });
  };

  // Helper function to update track step status
  const updateTrackStep = (tempId: string, step: UploadStep, status: StepStatus, actualTrackId?: string, error?: string) => {
    setMultiStepProgress(prev => {
      if (!prev) return prev;

      const tracks = new Map(prev.tracks);
      const track = tracks.get(tempId);
      if (!track) return prev;

      const updatedTrack = {
        ...track,
        trackId: actualTrackId || track.trackId,
        currentStep: step,
        steps: { ...track.steps, [step]: status },
        error: error,
      };

      tracks.set(tempId, updatedTrack);

      return { ...prev, tracks };
    });
  };

  // Helper function to update step progress percentage
  const updateStepProgress = (tempId: string, step: UploadStep, percentage: number) => {
    setMultiStepProgress(prev => {
      if (!prev) return prev;

      const tracks = new Map(prev.tracks);
      const track = tracks.get(tempId);
      if (!track) return prev;

      const updatedTrack = {
        ...track,
        stepProgress: {
          ...track.stepProgress,
          [step]: Math.min(100, Math.max(0, percentage)),
        },
      };

      tracks.set(tempId, updatedTrack);

      return { ...prev, tracks };
    });
  };

  // Helper function to move to next track
  const moveToNextTrack = () => {
    setMultiStepProgress(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        currentTrackIndex: prev.currentTrackIndex + 1,
      };
    });
  };

  // Helper function to complete upload
  const completeMultiStepUpload = (hasErrors: boolean) => {
    setMultiStepProgress(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        isComplete: true,
        hasErrors,
      };
    });
  };

  const checkForDuplicate = async (fileName: string, trackName: string): Promise<DuplicateCheckResult> => {
    const trackNameToCheck = trackName || fileName.replace(/\.[^/.]+$/, '');

    // First check by track name (most common duplicate scenario)
    const { data: tracksByName, error: nameError } = await supabase
      .from('audio_tracks')
      .select('id, track_id, track_name, artist_name')
      .eq('deleted', false)
      .ilike('track_name', trackNameToCheck)
      .limit(1);

    if (tracksByName && tracksByName.length > 0) {
      const track = tracksByName[0];
      return {
        isDuplicate: true,
        existingTrack: {
          id: track.id,
          track_id: track.track_id || track.id,
          track_name: track.track_name || 'Unknown',
          artist_name: track.artist_name || 'Unknown Artist',
        },
      };
    }

    // Also check by original filename
    const { data: tracksByFile } = await supabase
      .from('audio_tracks')
      .select('id, track_id, track_name, artist_name, metadata')
      .eq('deleted', false)
      .eq('metadata->>original_filename', fileName)
      .limit(1);

    if (tracksByFile && tracksByFile.length > 0) {
      const track = tracksByFile[0];
      return {
        isDuplicate: true,
        existingTrack: {
          id: track.id,
          track_id: track.track_id || track.id,
          track_name: track.track_name || 'Unknown',
          artist_name: track.artist_name || 'Unknown Artist',
        },
      };
    }

    return { isDuplicate: false };
  };

  const uploadSingleTrack = async (file: File, trackName?: string, trackNumber?: string, replaceExistingId?: string, tempId?: string, preAssignedTrackId?: string): Promise<UploadedTrackInfo> => {
    // If replacing, use the existing track_id, otherwise generate new
    let trackId: string;
    if (replaceExistingId) {
      // Get the existing track_id from the database
      const { data: existingTrack } = await supabase
        .from('audio_tracks')
        .select('metadata')
        .eq('id', replaceExistingId)
        .maybeSingle();

      trackId = existingTrack?.metadata?.track_id || formData.track_id || await getNextTrackId();

      // Delete existing track records (soft delete)
      await supabase
        .from('audio_tracks')
        .update({ deleted: true })
        .eq('id', replaceExistingId);
    } else {
      // Use pre-assigned track ID if provided (for bulk uploads), otherwise generate new
      trackId = preAssignedTrackId || formData.track_id || await getNextTrackId();
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${trackId}.${fileExt}`;

    // STEP 1: Upload to Supabase Storage with progress tracking
    if (tempId) updateTrackStep(tempId, 'storage', 'in-progress', trackId);

    // Simulate progress updates during upload for better UX
    let progressValue = 0;
    const progressInterval = setInterval(() => {
      if (tempId && progressValue < 90) {
        progressValue = Math.min(90, progressValue + Math.random() * 15);
        updateStepProgress(tempId, 'storage', progressValue);
      }
    }, 300);

    try {
      const { error: uploadError } = await supabase.storage
        .from('audio-files')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true,
        });

      clearInterval(progressInterval);

      if (uploadError) {
        if (tempId) updateTrackStep(tempId, 'storage', 'failed', trackId, uploadError.message);
        throw uploadError;
      }

      if (tempId) {
        updateStepProgress(tempId, 'storage', 100);
        updateTrackStep(tempId, 'storage', 'completed', trackId);
      }
    } catch (uploadError: any) {
      clearInterval(progressInterval);
      if (tempId) updateTrackStep(tempId, 'storage', 'failed', trackId, uploadError.message);
      throw uploadError;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('audio-files')
      .getPublicUrl(fileName);

    const audio = new Audio();
    const objectUrl = URL.createObjectURL(file);
    audio.src = objectUrl;

    await new Promise<void>((resolve) => {
      audio.addEventListener('loadedmetadata', () => {
        URL.revokeObjectURL(objectUrl);
        resolve();
      });
    });

    const durationSeconds = Math.round(audio.duration);

    const finalTrackName = trackName || formData.track_name || file.name.replace(/\.[^/.]+$/, '');

    // Extract version from track name if present (e.g., "Track Name v2" -> "v2")
    const versionMatch = finalTrackName.match(/\s+(v\d+|version\s*\d+)$/i);
    const version = versionMatch ? versionMatch[1] : '';

    // Build comprehensive metadata object with all ingested data
    const metadata = {
      track_id: trackId,
      track_name: finalTrackName,
      artist_name: formData.artist_name || 'Unknown Artist',
      album_name: formData.album_name || '',
      genre_category: formData.genre_category || '',
      tempo: formData.tempo || '',
      bpm: formData.bpm || '',
      source: formData.source || '',
      file_id: formData.file_id || '',
      track_number: trackNumber || formData.track_number || '',
      version: version,
      duration: durationSeconds.toString(),
      duration_seconds: durationSeconds,
      file_size: file.size.toString(),
      file_size_bytes: file.size,
      mimetype: file.type,
      original_filename: file.name,
      energy_level: formData.energy_level,
      upload_date: new Date().toISOString(),
      // Channel assignments (for reference in sidecar)
      assigned_channels: skipChannelAssignment ? [] : selectedChannels,
      channel_assignment_skipped: skipChannelAssignment,
    };

    const trackIdInt = parseInt(trackId, 10);
    const trackIdValue = isNaN(trackIdInt) ? null : trackIdInt;

    // STEP 3: Ingest into Database
    if (tempId) updateTrackStep(tempId, 'database', 'in-progress', trackId);

    // Prepare common fields for database insertion
    const commonTrackData = {
      track_id: trackIdValue,
      file_path: publicUrl,
      energy_level: formData.energy_level,
      duration_seconds: durationSeconds,
      metadata,
      // Add top-level fields for track name, artist, genre, and tempo
      track_name: finalTrackName,
      artist_name: formData.artist_name || 'Unknown Artist',
      genre: formData.genre_category || null,
      tempo: formData.tempo ? parseFloat(formData.tempo) : null,
    };

    if (skipChannelAssignment) {
      const { error: insertError } = await supabase
        .from('audio_tracks')
        .insert({
          ...commonTrackData,
          channel_id: null,
        });

      if (insertError) {
        if (tempId) updateTrackStep(tempId, 'database', 'failed', trackId, insertError.message);
        throw insertError;
      }
    } else {
      const trackRecords = selectedChannels.map(channelId => ({
        ...commonTrackData,
        channel_id: channelId,
      }));

      const { error: insertError } = await supabase
        .from('audio_tracks')
        .insert(trackRecords);

      if (insertError) {
        if (tempId) updateTrackStep(tempId, 'database', 'failed', trackId, insertError.message);
        throw insertError;
      }
    }

    if (tempId) updateTrackStep(tempId, 'database', 'completed', trackId);

    // STEP 2: Create JSON sidecar file with complete metadata
    if (tempId) updateTrackStep(tempId, 'sidecar', 'in-progress', trackId);

    const sidecarData = JSON.stringify(metadata, null, 2);
    const sidecarBlob = new Blob([sidecarData], { type: 'application/json' });

    const { error: sidecarError } = await supabase.storage
      .from('audio-sidecars')
      .upload(`${trackId}.json`, sidecarBlob, {
        cacheControl: '3600',
        upsert: true,
      });

    if (sidecarError) {
      console.error('Failed to upload sidecar JSON:', sidecarError);
      if (tempId) updateTrackStep(tempId, 'sidecar', 'failed', trackId, sidecarError.message);
      // Don't throw - the main upload succeeded, sidecar is supplementary
    } else {
      if (tempId) updateTrackStep(tempId, 'sidecar', 'completed', trackId);
    }

    // Get channel names for the assigned channels
    const assignedChannelInfo = skipChannelAssignment
      ? []
      : channels
          .filter(ch => selectedChannels.includes(ch.id))
          .map(ch => ({ id: ch.id, name: ch.channel_name }));

    // Return track info without triggering CDN sync
    const uploadedTrackInfo = {
      trackId,
      trackName: finalTrackName,
      artistName: formData.artist_name || 'Unknown Artist',
      albumName: formData.album_name,
      genreCategory: formData.genre_category,
      energyLevel: formData.energy_level,
      tempo: formData.tempo,
      bpm: formData.bpm,
      duration: durationSeconds.toString(),
      fileSize: file.size.toString(),
      fileName: file.name,
      storagePath: `audio-files/${fileName}`,
      assignedChannels: assignedChannelInfo,
      uploadTimestamp: new Date().toISOString(),
    };

    return uploadedTrackInfo;
  };


  const checkAllForDuplicates = async () => {
    const conflicts: DuplicateConflict[] = [];

    if (bulkMode) {
      for (const file of audioFiles) {
        const result = await checkForDuplicate(file.name, '');
        if (result.isDuplicate && result.existingTrack) {
          conflicts.push({
            fileName: file.name,
            trackName: file.name.replace(/\.[^/.]+$/, ''),
            existingTrackId: result.existingTrack.id,
            existingTrackName: result.existingTrack.track_name,
            action: 'pending',
          });
        }
      }
    } else if (audioFile) {
      const result = await checkForDuplicate(audioFile.name, formData.track_name);
      if (result.isDuplicate && result.existingTrack) {
        conflicts.push({
          fileName: audioFile.name,
          trackName: formData.track_name || audioFile.name.replace(/\.[^/.]+$/, ''),
          existingTrackId: result.existingTrack.id,
          existingTrackName: result.existingTrack.track_name,
          action: 'pending',
        });
      }
    }

    return conflicts;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (bulkMode) {
      if (audioFiles.length === 0) {
        alert('Please select audio files');
        return;
      }

      if (!skipChannelAssignment && selectedChannels.length === 0) {
        alert('Please select at least one channel or check "Skip channel assignment"');
        return;
      }

      // Check for duplicates
      const conflicts = await checkAllForDuplicates();
      if (conflicts.length > 0) {
        setDuplicateConflicts(conflicts);
        setShowDuplicateDialog(true);
        return;
      }

      // Initialize multi-step progress - always include HLS steps (auto-transcoding)
      const trackNames = audioFiles.map(f => f.name.replace(/\.[^/.]+$/, ''));
      const trackHasHLS = audioFiles.map(() => true); // Always transcode to HLS
      initializeMultiStepProgress(audioFiles.length, trackNames, trackHasHLS);
      setUploading(true);

      try {
        const trackIds: string[] = [];
        let hasErrors = false;

        // Process each track with automatic HLS transcoding
        for (let i = 0; i < audioFiles.length; i++) {
          const tempId = `temp-${i}`;
          const currentFile = audioFiles[i];
          
          try {
            // Get unique track ID from database sequence (atomic operation)
            const preAssignedTrackId = await getNextTrackId();
            const trackInfo = await uploadSingleTrack(currentFile, undefined, (i + 1).toString(), undefined, tempId, preAssignedTrackId);
            trackIds.push(trackInfo.trackId);

            // STEP 4: Sync MP3 to CDN
            updateTrackStep(tempId, 'cdn', 'in-progress', trackInfo.trackId);
            try {
              await syncTracks([trackInfo.trackId]);
              updateTrackStep(tempId, 'cdn', 'completed', trackInfo.trackId);
            } catch (cdnError: any) {
              console.error('CDN sync failed:', cdnError);
              updateTrackStep(tempId, 'cdn', 'failed', trackInfo.trackId, cdnError.message);
              hasErrors = true;
            }

            // STEP 5: Transcode MP3 to HLS using transcoder service
            updateTrackStep(tempId, 'transcoding', 'in-progress', trackInfo.trackId);
            try {
              const hlsResult = await transcodeToHLS(currentFile, (percent) => {
                updateStepProgress(tempId, 'transcoding', percent);
              });

              if (!hlsResult.success) {
                throw new Error(hlsResult.error || 'Transcoding failed');
              }
              updateTrackStep(tempId, 'transcoding', 'completed', trackInfo.trackId);

              // STEP 6: Upload HLS files to Supabase Storage
              updateTrackStep(tempId, 'hls-storage', 'in-progress', trackInfo.trackId);
              let hlsUploadProgress = 0;
              for (const hlsFile of hlsResult.files) {
                const storagePath = `${trackInfo.trackId}/${hlsFile.name}`;
                
                // Convert base64 to Blob
                const binaryData = atob(hlsFile.data);
                const bytes = new Uint8Array(binaryData.length);
                for (let j = 0; j < binaryData.length; j++) {
                  bytes[j] = binaryData.charCodeAt(j);
                }
                const blob = new Blob([bytes], { type: hlsFile.contentType });

                const { error: hlsUploadError } = await supabase.storage
                  .from('audio-hls')
                  .upload(storagePath, blob, {
                    contentType: hlsFile.contentType,
                    upsert: true,
                  });

                if (hlsUploadError) {
                  throw new Error(`Failed to upload ${hlsFile.name}: ${hlsUploadError.message}`);
                }
                
                hlsUploadProgress++;
                updateStepProgress(tempId, 'hls-storage', (hlsUploadProgress / hlsResult.files.length) * 100);
              }
              updateTrackStep(tempId, 'hls-storage', 'completed', trackInfo.trackId);

              // STEP 7: Sync HLS to CDN
              updateTrackStep(tempId, 'hls-cdn', 'in-progress', trackInfo.trackId);
              try {
                const hlsCdnResponse = await fetch(
                  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-to-cdn`,
                  {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      trackId: trackInfo.trackId,
                      operation: 'upload-hls',
                    }),
                  }
                );

                if (!hlsCdnResponse.ok) {
                  const errorData = await hlsCdnResponse.json();
                  throw new Error(errorData.error || 'HLS CDN sync failed');
                }

                // Update database with HLS info
                const hlsPath = `${trackInfo.trackId}/master.m3u8`;
                const hlsCdnUrl = `https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev/hls/${trackInfo.trackId}/master.m3u8`;
                
                await supabase
                  .from('audio_tracks')
                  .update({
                    hls_path: hlsPath,
                    hls_cdn_url: hlsCdnUrl,
                    hls_segment_count: hlsResult.segmentCount,
                    hls_transcoded_at: new Date().toISOString(),
                  })
                  .eq('track_id', parseInt(trackInfo.trackId, 10));

                updateTrackStep(tempId, 'hls-cdn', 'completed', trackInfo.trackId);
              } catch (hlsCdnError: any) {
                console.error('HLS CDN sync failed:', hlsCdnError);
                updateTrackStep(tempId, 'hls-cdn', 'failed', trackInfo.trackId, hlsCdnError.message);
                hasErrors = true;
              }
            } catch (transcodeError: any) {
              console.error('HLS transcoding failed:', transcodeError);
              updateTrackStep(tempId, 'transcoding', 'failed', trackInfo.trackId, transcodeError.message);
              updateTrackStep(tempId, 'hls-storage', 'skipped', trackInfo.trackId);
              updateTrackStep(tempId, 'hls-cdn', 'skipped', trackInfo.trackId);
              hasErrors = true;
            }

            // Move to next track if not the last one
            if (i < audioFiles.length - 1) {
              moveToNextTrack();
            }
          } catch (error: any) {
            console.error('Track upload failed:', error);
            hasErrors = true;
            // Move to next track even on error
            if (i < audioFiles.length - 1) {
              moveToNextTrack();
            }
          }
        }

        setUploading(false);
        completeMultiStepUpload(hasErrors);
      } catch (error: any) {
        alert(`Upload failed: ${error.message}`);
        setUploading(false);
        completeMultiStepUpload(true);
      }
    } else {
      if (!audioFile) {
        alert('Please select an audio file');
        return;
      }

      if (!formData.track_name) {
        alert('Please enter a track name');
        return;
      }

      if (!skipChannelAssignment && selectedChannels.length === 0) {
        alert('Please select at least one channel or check "Skip channel assignment"');
        return;
      }

      // Check for duplicates
      const conflicts = await checkAllForDuplicates();
      if (conflicts.length > 0) {
        setDuplicateConflicts(conflicts);
        setShowDuplicateDialog(true);
        return;
      }

      // Initialize multi-step progress for single track - always include HLS (auto-transcoding)
      const trackName = formData.track_name || audioFile.name.replace(/\.[^/.]+$/, '');
      initializeMultiStepProgress(1, [trackName], [true]); // Always transcode to HLS
      setUploading(true);

      try {
        const tempId = 'temp-0';
        const trackInfo = await uploadSingleTrack(audioFile, undefined, undefined, undefined, tempId);
        let hasErrors = false;

        // STEP 4: Sync MP3 to CDN
        updateTrackStep(tempId, 'cdn', 'in-progress', trackInfo.trackId);
        try {
          await syncTracks([trackInfo.trackId]);
          updateTrackStep(tempId, 'cdn', 'completed', trackInfo.trackId);
        } catch (cdnError: any) {
          console.error('CDN sync failed:', cdnError);
          updateTrackStep(tempId, 'cdn', 'failed', trackInfo.trackId, cdnError.message);
          hasErrors = true;
        }

        // STEP 5: Transcode MP3 to HLS using transcoder service
        updateTrackStep(tempId, 'transcoding', 'in-progress', trackInfo.trackId);
        try {
          const hlsResult = await transcodeToHLS(audioFile, (percent) => {
            updateStepProgress(tempId, 'transcoding', percent);
          });

          if (!hlsResult.success) {
            throw new Error(hlsResult.error || 'Transcoding failed');
          }
          updateTrackStep(tempId, 'transcoding', 'completed', trackInfo.trackId);

          // STEP 6: Upload HLS files to Supabase Storage
          updateTrackStep(tempId, 'hls-storage', 'in-progress', trackInfo.trackId);
          let hlsUploadProgress = 0;
          for (const hlsFile of hlsResult.files) {
            const storagePath = `${trackInfo.trackId}/${hlsFile.name}`;
            
            // Convert base64 to Blob
            const binaryData = atob(hlsFile.data);
            const bytes = new Uint8Array(binaryData.length);
            for (let j = 0; j < binaryData.length; j++) {
              bytes[j] = binaryData.charCodeAt(j);
            }
            const blob = new Blob([bytes], { type: hlsFile.contentType });

            const { error: hlsUploadError } = await supabase.storage
              .from('audio-hls')
              .upload(storagePath, blob, {
                contentType: hlsFile.contentType,
                upsert: true,
              });

            if (hlsUploadError) {
              throw new Error(`Failed to upload ${hlsFile.name}: ${hlsUploadError.message}`);
            }
            
            hlsUploadProgress++;
            updateStepProgress(tempId, 'hls-storage', (hlsUploadProgress / hlsResult.files.length) * 100);
          }
          updateTrackStep(tempId, 'hls-storage', 'completed', trackInfo.trackId);

          // STEP 7: Sync HLS to CDN
          updateTrackStep(tempId, 'hls-cdn', 'in-progress', trackInfo.trackId);
          try {
            const hlsCdnResponse = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-to-cdn`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  trackId: trackInfo.trackId,
                  operation: 'upload-hls',
                }),
              }
            );

            if (!hlsCdnResponse.ok) {
              const errorData = await hlsCdnResponse.json();
              throw new Error(errorData.error || 'HLS CDN sync failed');
            }

            // Update database with HLS info
            const hlsPath = `${trackInfo.trackId}/master.m3u8`;
            const hlsCdnUrl = `https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev/hls/${trackInfo.trackId}/master.m3u8`;
            
            await supabase
              .from('audio_tracks')
              .update({
                hls_path: hlsPath,
                hls_cdn_url: hlsCdnUrl,
                hls_segment_count: hlsResult.segmentCount,
                hls_transcoded_at: new Date().toISOString(),
              })
              .eq('track_id', parseInt(trackInfo.trackId, 10));

            updateTrackStep(tempId, 'hls-cdn', 'completed', trackInfo.trackId);
          } catch (hlsCdnError: any) {
            console.error('HLS CDN sync failed:', hlsCdnError);
            updateTrackStep(tempId, 'hls-cdn', 'failed', trackInfo.trackId, hlsCdnError.message);
            hasErrors = true;
          }
        } catch (transcodeError: any) {
          console.error('HLS transcoding failed:', transcodeError);
          updateTrackStep(tempId, 'transcoding', 'failed', trackInfo.trackId, transcodeError.message);
          updateTrackStep(tempId, 'hls-storage', 'skipped', trackInfo.trackId);
          updateTrackStep(tempId, 'hls-cdn', 'skipped', trackInfo.trackId);
          hasErrors = true;
        }

        setUploading(false);
        setUploadedTrackInfo(trackInfo);
        completeMultiStepUpload(hasErrors);
      } catch (error: any) {
        console.error('Upload failed:', error);
        setUploading(false);
        completeMultiStepUpload(true);
      }
    }
  };

  const processDuplicateConflicts = async () => {
    setShowDuplicateDialog(false);
    setUploading(true);
    setShowUploadProgress(true);

    try {
      if (bulkMode) {
        let uploadedCount = 0;
        const trackIds: string[] = [];
        setUploadProgress({ current: 0, total: audioFiles.length });

        // Process each file with atomic track ID generation
        for (let i = 0; i < audioFiles.length; i++) {
          const file = audioFiles[i];
          const conflict = duplicateConflicts.find(c => c.fileName === file.name);

          if (conflict) {
            if (conflict.action === 'skip') {
              continue;
            } else if (conflict.action === 'replace') {
              const trackInfo = await uploadSingleTrack(file, undefined, (i + 1).toString(), conflict.existingTrackId);
              trackIds.push(trackInfo.trackId);
              uploadedCount++;
            } else if (conflict.action === 'rename') {
              // Get unique track ID atomically from database
              const preAssignedId = await getNextTrackId();
              const trackInfo = await uploadSingleTrack(file, `${conflict.trackName} (${Date.now()})`, (i + 1).toString(), undefined, undefined, preAssignedId);
              trackIds.push(trackInfo.trackId);
              uploadedCount++;
            }
          } else {
            // Get unique track ID atomically from database
            const preAssignedId = await getNextTrackId();
            const trackInfo = await uploadSingleTrack(file, undefined, (i + 1).toString(), undefined, undefined, preAssignedId);
            trackIds.push(trackInfo.trackId);
            uploadedCount++;
          }

          setUploadProgress({ current: i + 1, total: audioFiles.length });
        }

        setUploading(false);
        setUploadedTrackIds(trackIds);

        // Automatically trigger CDN sync
        await syncTracks(trackIds);

        alert(`Successfully processed and synced ${uploadedCount} tracks!`);
        onSuccess();
        onClose();
      } else if (audioFile) {
        const conflict = duplicateConflicts[0];
        let trackInfo: UploadedTrackInfo;
        if (conflict.action === 'replace') {
          trackInfo = await uploadSingleTrack(audioFile, undefined, undefined, conflict.existingTrackId);
        } else if (conflict.action === 'rename') {
          trackInfo = await uploadSingleTrack(audioFile, `${formData.track_name} (${Date.now()})`);
        } else {
          trackInfo = await uploadSingleTrack(audioFile);
        }
        setUploading(false);
        setUploadedTrackInfo(trackInfo);
        setUploadedTrackIds([trackInfo.trackId]);

        // Automatically trigger CDN sync
        await syncTracks([trackInfo.trackId]);

        setShowConfirmation(true);
      }
    } catch (error: any) {
      alert(`Upload failed: ${error.message}`);
      setUploading(false);
    }
  };

  const handleConfirmationClose = () => {
    setShowConfirmation(false);
    setUploadedTrackInfo(null);
    setUploading(false);
    onSuccess();
    onClose();
  };

  // Show multi-step upload progress modal
  if (multiStepProgress) {
    return (
      <MultiStepUploadProgressModal
        progress={multiStepProgress}
        onClose={() => {
          if (multiStepProgress.isComplete) {
            setMultiStepProgress(null);
            onSuccess();
            onClose();
          }
        }}
      />
    );
  }

  if (showConfirmation && uploadedTrackInfo) {
    return (
      <TrackUploadConfirmationModal
        trackInfo={uploadedTrackInfo}
        onClose={handleConfirmationClose}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4 pb-24">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[calc(85vh-6rem)] flex flex-col border border-slate-200">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold text-slate-900">
              {bulkMode ? 'Bulk Upload Tracks' : 'Upload New Track'}
            </h2>
            <button
              type="button"
              onClick={() => {
                setBulkMode(!bulkMode);
                setAudioFile(null);
                setAudioFiles([]);
              }}
              disabled={uploading}
              className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors font-medium border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {bulkMode ? 'Single Upload' : 'Bulk Upload'}
            </button>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-100 rounded-lg"
            disabled={uploading}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <p className="text-sm text-slate-600 leading-relaxed">
              {bulkMode
                ? 'Upload multiple MP3 files and apply common metadata to all tracks. Track names will be derived from filenames. Duration is auto-detected for each file.'
                : 'Upload an MP3 file and provide complete metadata. Duration is auto-detected. All fields help with search and organization.'
              }
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Audio File{bulkMode ? 's' : ''} <span className="text-red-400">*</span>
            </label>
            <input
              type="file"
              accept="audio/mpeg,audio/mp3,.mp3"
              onChange={handleFileChange}
              disabled={uploading}
              multiple={bulkMode}
              className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-slate-700 file:text-white file:cursor-pointer file:font-medium hover:file:bg-slate-800 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
            />
            {bulkMode && audioFiles.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-sm text-slate-600 font-medium">
                  Selected {audioFiles.length} file{audioFiles.length !== 1 ? 's' : ''} ({(audioFiles.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024).toFixed(2)} MB total)
                </p>
                <div className="max-h-32 overflow-y-auto bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                  {audioFiles.map((file, idx) => (
                    <div key={idx} className="text-xs text-slate-600">
                      {idx + 1}. {file.name}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!bulkMode && audioFile && (
              <p className="mt-2 text-sm text-slate-600">
                Selected: <span className="font-medium text-slate-900">{audioFile.name}</span> ({(audioFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          {/* HLS Auto-Transcoding Info */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                <span className="text-purple-600 text-lg">🎵</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-purple-900">
                  Automatic HLS Transcoding
                </p>
                <p className="text-xs text-purple-700 mt-1">
                  MP3 files will be automatically transcoded to HLS streaming format during upload. 
                  No manual conversion needed!
                </p>
              </div>
            </div>
          </div>

          {bulkMode && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-900 leading-relaxed">
                <strong className="font-semibold">Common Metadata:</strong> The fields below will be applied to all uploaded tracks. Track names will be automatically derived from filenames.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {!bulkMode && (
              <>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Track ID
                  </label>
                  <input
                    type="text"
                    value={formData.track_id}
                    onChange={(e) => handleInputChange('track_id', e.target.value)}
                    placeholder="Auto-generated if empty"
                    disabled={uploading}
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-slate-400 focus:border-slate-400 disabled:opacity-50 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Track Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.track_name}
                    onChange={(e) => handleInputChange('track_name', e.target.value)}
                    placeholder="Enter track name"
                    disabled={uploading}
                    required
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-slate-400 focus:border-slate-400 disabled:opacity-50 transition-colors"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Artist Name
              </label>
              <input
                type="text"
                value={formData.artist_name}
                onChange={(e) => handleInputChange('artist_name', e.target.value)}
                placeholder="Enter artist name"
                disabled={uploading}
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-slate-400 focus:border-slate-400 disabled:opacity-50 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Album Name
              </label>
              <input
                type="text"
                value={formData.album_name}
                onChange={(e) => handleInputChange('album_name', e.target.value)}
                placeholder="Enter album name"
                disabled={uploading}
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-slate-400 focus:border-slate-400 disabled:opacity-50 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Genre Category
              </label>
              <input
                type="text"
                value={formData.genre_category}
                onChange={(e) => handleInputChange('genre_category', e.target.value)}
                placeholder="e.g., Classical Piano, Ambient"
                disabled={uploading}
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-slate-400 focus:border-slate-400 disabled:opacity-50 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Energy Level
              </label>
              <select
                value={formData.energy_level}
                onChange={(e) => handleInputChange('energy_level', e.target.value)}
                disabled={uploading}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Tempo
              </label>
              <input
                type="text"
                value={formData.tempo}
                onChange={(e) => handleInputChange('tempo', e.target.value)}
                placeholder="e.g., 120.00"
                disabled={uploading}
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-slate-400 focus:border-slate-400 disabled:opacity-50 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                BPM
              </label>
              <input
                type="text"
                value={formData.bpm}
                onChange={(e) => handleInputChange('bpm', e.target.value)}
                placeholder="e.g., 120"
                disabled={uploading}
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-slate-400 focus:border-slate-400 disabled:opacity-50 transition-colors"
              />
            </div>

            {!bulkMode && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Duration (seconds) <span className="text-slate-500 text-xs font-normal">(auto-detected)</span>
                </label>
                <input
                  type="text"
                  value={formData.duration}
                  onChange={(e) => handleInputChange('duration', e.target.value)}
                  placeholder="Auto-detected from file"
                  disabled={uploading}
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-slate-400 focus:border-slate-400 disabled:opacity-50 transition-colors"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Source/Catalog
              </label>
              <input
                type="text"
                value={formData.source}
                onChange={(e) => handleInputChange('source', e.target.value)}
                placeholder="e.g., astropilot"
                disabled={uploading}
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-slate-400 focus:border-slate-400 disabled:opacity-50 transition-colors"
              />
            </div>

            {!bulkMode && (
              <>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    File ID
                  </label>
                  <input
                    type="text"
                    value={formData.file_id}
                    onChange={(e) => handleInputChange('file_id', e.target.value)}
                    placeholder="Internal file identifier"
                    disabled={uploading}
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-slate-400 focus:border-slate-400 disabled:opacity-50 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Track Number
                  </label>
                  <input
                    type="text"
                    value={formData.track_number}
                    onChange={(e) => handleInputChange('track_number', e.target.value)}
                    placeholder="e.g., 1 or 01"
                    disabled={uploading}
                    className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-slate-400 focus:border-slate-400 disabled:opacity-50 transition-colors"
                  />
                </div>
              </>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-slate-700">
                Assign to Channels {!skipChannelAssignment && <span className="text-red-500">*</span>}
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={skipChannelAssignment}
                  onChange={(e) => setSkipChannelAssignment(e.target.checked)}
                  disabled={uploading}
                  className="w-4 h-4 text-slate-700 bg-white border-slate-300 rounded focus:ring-slate-400 focus:ring-2 disabled:opacity-50"
                />
                <span className="text-sm text-slate-600 group-hover:text-slate-700 transition-colors">Skip for now</span>
              </label>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 max-h-48 overflow-y-auto">
              {channels.length === 0 ? (
                <p className="text-slate-500 text-sm">No channels available</p>
              ) : (
                <div className="space-y-1.5">
                  {channels.map(channel => (
                    <label
                      key={channel.id}
                      className="flex items-center gap-3 p-2.5 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors group"
                    >
                      <input
                        type="checkbox"
                        checked={selectedChannels.includes(channel.id)}
                        onChange={() => toggleChannel(channel.id)}
                        disabled={uploading || skipChannelAssignment}
                        className="w-4 h-4 text-slate-700 bg-white border-slate-300 rounded focus:ring-slate-400 focus:ring-2 disabled:opacity-50"
                      />
                      <span className="text-slate-700 text-sm group-hover:text-slate-900 transition-colors">
                        {channel.channel_number}. {channel.channel_name}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </form>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="px-6 py-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-lg transition-colors font-medium border border-slate-300 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={uploading || (bulkMode ? audioFiles.length === 0 : !audioFile)}
            className="px-6 py-2.5 bg-slate-700 hover:bg-slate-800 text-white rounded-lg transition-colors flex items-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                {bulkMode && uploadProgress.total > 0
                  ? `Uploading ${uploadProgress.current}/${uploadProgress.total}...`
                  : 'Uploading...'
                }
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                {bulkMode ? `Upload ${audioFiles.length} Track${audioFiles.length !== 1 ? 's' : ''}` : 'Upload Track'}
              </>
            )}
          </button>
        </div>
      </div>

      {showDuplicateDialog && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-10">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col border border-amber-300">
            <div className="flex items-center gap-3 p-6 border-b border-amber-200 bg-amber-50">
              <AlertCircle className="w-6 h-6 text-amber-600" />
              <h3 className="text-xl font-bold text-slate-900">Duplicate Tracks Detected</h3>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <p className="text-slate-700 mb-4 leading-relaxed">
                {duplicateConflicts.length === 1
                  ? 'The following track already exists in the library:'
                  : `${duplicateConflicts.length} tracks already exist in the library:`
                }
              </p>

              {duplicateConflicts.length > 1 && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-slate-700 mb-3 font-semibold">Apply action to all duplicates:</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const updated = duplicateConflicts.map(c => ({ ...c, action: 'skip' as const }));
                        setDuplicateConflicts(updated);
                      }}
                      className="px-4 py-2 text-sm bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors font-medium"
                    >
                      Skip All
                    </button>
                    <button
                      onClick={() => {
                        const updated = duplicateConflicts.map(c => ({ ...c, action: 'replace' as const }));
                        setDuplicateConflicts(updated);
                      }}
                      className="px-4 py-2 text-sm bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors font-medium"
                    >
                      Replace All
                    </button>
                    <button
                      onClick={() => {
                        const updated = duplicateConflicts.map(c => ({ ...c, action: 'rename' as const }));
                        setDuplicateConflicts(updated);
                      }}
                      className="px-4 py-2 text-sm bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors font-medium"
                    >
                      Rename All
                    </button>
                  </div>
                </div>
              )}

              {duplicateConflicts.map((conflict, idx) => (
                <div key={idx} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <div className="mb-3">
                    <p className="text-slate-900 font-medium">{conflict.fileName}</p>
                    <p className="text-sm text-slate-600 mt-1">
                      Existing: <span className="text-amber-700 font-medium">{conflict.existingTrackName}</span>
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-3 p-2.5 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors group">
                      <input
                        type="radio"
                        name={`conflict-${idx}`}
                        checked={conflict.action === 'skip'}
                        onChange={() => {
                          const updated = [...duplicateConflicts];
                          updated[idx].action = 'skip';
                          setDuplicateConflicts(updated);
                        }}
                        className="w-4 h-4 text-slate-700"
                      />
                      <div>
                        <span className="text-slate-700 font-medium group-hover:text-slate-900 transition-colors">Skip this file</span>
                        <p className="text-xs text-slate-500">Don't upload, keep existing track</p>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-2.5 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors group">
                      <input
                        type="radio"
                        name={`conflict-${idx}`}
                        checked={conflict.action === 'replace'}
                        onChange={() => {
                          const updated = [...duplicateConflicts];
                          updated[idx].action = 'replace';
                          setDuplicateConflicts(updated);
                        }}
                        className="w-4 h-4 text-slate-700"
                      />
                      <div>
                        <span className="text-slate-700 font-medium group-hover:text-slate-900 transition-colors">Replace existing track</span>
                        <p className="text-xs text-slate-500">Delete old track and upload new version</p>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-2.5 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors group">
                      <input
                        type="radio"
                        name={`conflict-${idx}`}
                        checked={conflict.action === 'rename'}
                        onChange={() => {
                          const updated = [...duplicateConflicts];
                          updated[idx].action = 'rename';
                          setDuplicateConflicts(updated);
                        }}
                        className="w-4 h-4 text-slate-700"
                      />
                      <div>
                        <span className="text-slate-700 font-medium group-hover:text-slate-900 transition-colors">Add with new name</span>
                        <p className="text-xs text-slate-500">Upload as separate track with timestamp appended</p>
                      </div>
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between p-6 border-t border-slate-200 bg-slate-50">
              <button
                onClick={() => {
                  setShowDuplicateDialog(false);
                  setDuplicateConflicts([]);
                }}
                className="px-6 py-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-lg transition-colors font-medium border border-slate-300"
              >
                Cancel Upload
              </button>
              <button
                onClick={processDuplicateConflicts}
                disabled={duplicateConflicts.some(c => c.action === 'pending')}
                className="px-6 py-2.5 bg-slate-700 hover:bg-slate-800 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

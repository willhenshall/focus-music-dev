import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } from "npm:@aws-sdk/client-s3@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SyncRequest {
  trackId: string;
  operation: 'upload' | 'delete' | 'upload-hls';
  filePath?: string;
  sidecarPath?: string;
  // Optional: provide track data directly to avoid database lookup
  trackData?: {
    cdn_url?: string;
    metadata?: any;
    storage_locations?: any;
  };
}

const R2_CONFIG = {
  accountId: "531f033f1f3eb591e89baff98f027cee",
  bucketName: "focus-music-audio",
  accessKeyId: "d6c3feb94bb923b619c9661f950019d2",
  secretAccessKey: "bc5d2ea0d38fecb4ef8442b78621a6b398415b3373cc1c174b12564a111678f3",
  publicUrl: "https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev",
  audioPath: "audio",
  metadataPath: "metadata",
  hlsPath: "hls",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { trackId, operation, trackData: providedTrackData }: SyncRequest = await req.json();

    if (!trackId) {
      return new Response(
        JSON.stringify({ error: "trackId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (operation === 'upload') {
      const { data: trackData, error: trackError } = await supabase
        .from('audio_tracks')
        .select('file_path, metadata')
        .eq('track_id', trackId)
        .is('deleted_at', null)
        .maybeSingle();

      if (trackError || !trackData) {
        return new Response(
          JSON.stringify({ error: "Track not found", details: trackError }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const filePathToSync = trackData.file_path;
      const fileName = filePathToSync.split('/').pop() || '';

      const { data: fileData, error: downloadError } = await supabase.storage
        .from('audio-files')
        .download(fileName);

      if (downloadError || !fileData) {
        return new Response(
          JSON.stringify({ error: "Failed to download file from Supabase", details: downloadError }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const sidecarFileName = `${trackId}.json`;
      const { data: sidecarData } = await supabase.storage
        .from('audio-sidecars')
        .download(sidecarFileName);

      const cdnUrl = await uploadAudioToCDN(fileName, fileData);
      let sidecarCdnUrl: string | null = null;

      if (sidecarData) {
        sidecarCdnUrl = await uploadMetadataToCDN(sidecarFileName, sidecarData);
      }

      const timestamp = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('audio_tracks')
        .update({
          cdn_url: cdnUrl,
          cdn_uploaded_at: timestamp,
          storage_locations: {
            supabase: true,
            r2_cdn: true,
            upload_timestamps: {
              supabase: trackData.metadata?.upload_date || timestamp,
              r2_cdn: timestamp,
            }
          }
        })
        .eq('track_id', trackId);

      if (updateError) {
        console.error('Failed to update database:', updateError);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: "Files synced to CDN successfully",
          cdn_url: cdnUrl,
          sidecar_cdn_url: sidecarCdnUrl,
          timestamp,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );

    } else if (operation === 'delete') {
      // Use provided track data if available, otherwise query database
      let trackData = providedTrackData;

      if (!trackData) {
        console.log(`No track data provided, querying database for track ${trackId}...`);
        const { data: dbTrackData } = await supabase
          .from('audio_tracks')
          .select('cdn_url, metadata, storage_locations')
          .eq('track_id', trackId)
          .maybeSingle();

        if (!dbTrackData) {
          console.log(`Track ${trackId} not found in database, skipping CDN deletion`);
          return new Response(
            JSON.stringify({
              success: true,
              message: "Track not found, skipping CDN deletion",
            }),
            {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        trackData = dbTrackData;
      } else {
        console.log(`Using provided track data for track ${trackId}`);
      }

      const storageLocations = trackData.storage_locations as any;
      const isSyncedToCDN = storageLocations?.r2_cdn === true || trackData.cdn_url;

      console.log(`Track ${trackId} CDN status - storage_locations.r2_cdn: ${storageLocations?.r2_cdn}, cdn_url: ${trackData.cdn_url ? 'present' : 'null'}`);

      let fileName = '';
      if (trackData.cdn_url) {
        fileName = trackData.cdn_url.split('/').pop() || '';
      } else {
        fileName = `${trackId}.mp3`;
        console.log(`No cdn_url found, using track_id as filename: ${fileName}`);
      }

      let audioDeleted = false;
      let audioError: string | null = null;
      try {
        audioDeleted = await deleteAudioFromCDN(fileName);
        if (audioDeleted) {
          console.log(`Successfully deleted audio file: ${fileName}`);
        } else {
          audioError = "File still exists after deletion attempt";
          console.warn(`Audio file ${fileName} still exists after deletion`);
        }
      } catch (error: any) {
        audioError = error.message;
        console.error(`Error deleting audio file ${fileName}:`, error.message);
      }

      const sidecarFileName = `${trackId}.json`;
      let sidecarDeleted = false;
      let sidecarError: string | null = null;
      try {
        sidecarDeleted = await deleteMetadataFromCDN(sidecarFileName);
        if (sidecarDeleted) {
          console.log(`Successfully deleted metadata file: ${sidecarFileName}`);
        } else {
          sidecarError = "File still exists after deletion attempt";
          console.warn(`Metadata file ${sidecarFileName} still exists after deletion`);
        }
      } catch (error: any) {
        sidecarError = error.message;
        console.error(`Error deleting metadata file ${sidecarFileName}:`, error.message);
      }

      // Delete HLS files from CDN
      console.log(`Deleting HLS files for track ${trackId} from CDN...`);
      const hlsResult = await deleteHLSFromCDN(trackId);

      const { error: updateError } = await supabase
        .from('audio_tracks')
        .update({
          cdn_url: null,
          cdn_uploaded_at: null,
          hls_cdn_url: null,
          storage_locations: {
            supabase: true,
            r2_cdn: false,
            upload_timestamps: {
              supabase: trackData?.metadata?.upload_date || new Date().toISOString(),
            }
          }
        })
        .eq('track_id', trackId);

      if (updateError) {
        console.error('Failed to update database:', updateError);
      }

      const success = audioDeleted && sidecarDeleted && hlsResult.failed === 0;
      const message = success
        ? "CDN deletion completed successfully"
        : "CDN deletion partially failed";

      return new Response(
        JSON.stringify({
          success,
          message,
          verified: true,
          details: {
            audioFile: {
              name: fileName,
              deleted: audioDeleted,
              error: audioError,
            },
            metadataFile: {
              name: sidecarFileName,
              deleted: sidecarDeleted,
              error: sidecarError,
            },
            hlsFiles: {
              deleted: hlsResult.deleted,
              failed: hlsResult.failed,
              errors: hlsResult.errors.length > 0 ? hlsResult.errors : undefined,
            },
          }
        }),
        {
          status: success ? 200 : 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );

    } else if (operation === 'upload-hls') {
      // Upload HLS files from Supabase Storage to R2 CDN
      // Supports both flat structure (legacy) and nested 4-bitrate ladder
      console.log(`Starting HLS sync for track ${trackId}`);

      // Helper function to recursively list all files in a folder
      async function listAllHLSFiles(prefix: string): Promise<Array<{ path: string; name: string }>> {
        const allFiles: Array<{ path: string; name: string }> = [];
        
        const { data: items, error } = await supabase.storage
          .from('audio-hls')
          .list(prefix);
        
        if (error || !items) {
          console.error(`Failed to list ${prefix}:`, error);
          return allFiles;
        }
        
        for (const item of items) {
          // Check if it's a folder (no extension or matches variant folder names)
          const isFolder = !item.name.includes('.') && 
            ['low', 'medium', 'high', 'premium'].includes(item.name);
          
          if (isFolder) {
            // Recursively list files in subfolder
            const subFiles = await listAllHLSFiles(`${prefix}/${item.name}`);
            allFiles.push(...subFiles);
          } else {
            // It's a file
            const relativePath = prefix === trackId 
              ? item.name 
              : `${prefix.replace(trackId + '/', '')}/${item.name}`;
            allFiles.push({ 
              path: `${prefix}/${item.name}`,
              name: relativePath
            });
          }
        }
        
        return allFiles;
      }

      // List all HLS files recursively (supports nested 4-bitrate ladder)
      const hlsFiles = await listAllHLSFiles(trackId);

      if (hlsFiles.length === 0) {
        return new Response(
          JSON.stringify({ error: "No HLS files found for track" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Check if this is a 4-bitrate ladder
      const isMultiBitrate = hlsFiles.some(f => 
        f.name.startsWith('low/') || 
        f.name.startsWith('medium/') || 
        f.name.startsWith('high/') || 
        f.name.startsWith('premium/')
      );
      
      console.log(`Found ${hlsFiles.length} HLS files to sync (${isMultiBitrate ? '4-bitrate ladder' : 'single bitrate'})`);

      let uploadedCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      // Upload each HLS file to R2
      for (const file of hlsFiles) {
        // Download from Supabase using full path
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('audio-hls')
          .download(file.path);

        if (downloadError || !fileData) {
          console.error(`Failed to download HLS file ${file.path}:`, downloadError);
          errors.push(`Failed to download ${file.name}`);
          failedCount++;
          continue;
        }

        // Upload to R2 with relative path (preserves folder structure)
        try {
          await uploadHLSFileToCDN(trackId, file.name, fileData);
          uploadedCount++;
        } catch (uploadError: any) {
          console.error(`Failed to upload HLS file ${file.name}:`, uploadError);
          errors.push(`Failed to upload ${file.name}: ${uploadError.message}`);
          failedCount++;
        }
      }

      // Count segments (files ending in .ts)
      const segmentCount = hlsFiles.filter(f => f.name.endsWith('.ts')).length;
      const hlsCdnUrl = `${R2_CONFIG.publicUrl}/${R2_CONFIG.hlsPath}/${trackId}/master.m3u8`;
      const timestamp = new Date().toISOString();

      // Update database with HLS info
      const { error: updateError } = await supabase
        .from('audio_tracks')
        .update({
          hls_path: `${trackId}/master.m3u8`,
          hls_cdn_url: hlsCdnUrl,
          hls_segment_count: segmentCount,
          hls_transcoded_at: timestamp,
        })
        .eq('track_id', trackId);

      if (updateError) {
        console.error('Failed to update database with HLS info:', updateError);
      }

      const success = failedCount === 0;
      return new Response(
        JSON.stringify({
          success,
          message: success 
            ? `HLS files synced to CDN successfully` 
            : `HLS sync partially failed: ${failedCount} files failed`,
          hls_cdn_url: hlsCdnUrl,
          uploaded_count: uploadedCount,
          failed_count: failedCount,
          segment_count: segmentCount,
          errors: errors.length > 0 ? errors : undefined,
          timestamp,
        }),
        {
          status: success ? 200 : 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid operation" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error: any) {
    console.error('CDN sync error:', error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error", stack: error.stack }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function getS3Client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${R2_CONFIG.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_CONFIG.accessKeyId,
      secretAccessKey: R2_CONFIG.secretAccessKey,
    },
  });
}

async function uploadAudioToCDN(fileName: string, fileData: Blob): Promise<string> {
  const s3Client = getS3Client();
  const key = `${R2_CONFIG.audioPath}/${fileName}`;

  const arrayBuffer = await fileData.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  const command = new PutObjectCommand({
    Bucket: R2_CONFIG.bucketName,
    Key: key,
    Body: buffer,
    ContentType: fileData.type || 'audio/mpeg',
  });

  await s3Client.send(command);

  const cdnUrl = `${R2_CONFIG.publicUrl}/${key}`;
  console.log(`Uploaded audio to CDN: ${cdnUrl}`);

  return cdnUrl;
}

async function uploadMetadataToCDN(fileName: string, fileData: Blob): Promise<string> {
  const s3Client = getS3Client();
  const key = `${R2_CONFIG.metadataPath}/${fileName}`;

  const arrayBuffer = await fileData.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  const command = new PutObjectCommand({
    Bucket: R2_CONFIG.bucketName,
    Key: key,
    Body: buffer,
    ContentType: 'application/json',
  });

  await s3Client.send(command);

  const cdnUrl = `${R2_CONFIG.publicUrl}/${key}`;
  console.log(`Uploaded metadata to CDN: ${cdnUrl}`);

  return cdnUrl;
}

async function deleteAudioFromCDN(fileName: string): Promise<boolean> {
  const s3Client = getS3Client();
  const key = `${R2_CONFIG.audioPath}/${fileName}`;

  // First, check if file exists
  try {
    const headCommand = new HeadObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: key,
    });
    await s3Client.send(headCommand);
    console.log(`File ${key} exists, proceeding with deletion`);
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      console.log(`File ${key} does not exist on CDN, already deleted`);
      return true; // File already gone = success
    }
    // Other errors should be logged but we'll try to delete anyway
    console.warn(`Error checking file ${key} existence:`, error.message);
  }

  // Delete the file - trust the S3 SDK
  try {
    const deleteCommand = new DeleteObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: key,
    });
    console.log(`Deleting audio file from CDN: ${key}`);
    await s3Client.send(deleteCommand);
    console.log(`✅ Successfully deleted from CDN: ${key}`);
    return true;
  } catch (error: any) {
    console.error(`❌ Failed to delete ${key}:`, error.message);
    console.error(`Error details:`, {
      name: error.name,
      code: error.code,
      statusCode: error.$metadata?.httpStatusCode,
    });
    return false;
  }
}

async function deleteMetadataFromCDN(fileName: string): Promise<boolean> {
  const s3Client = getS3Client();
  const key = `${R2_CONFIG.metadataPath}/${fileName}`;

  // Delete the file - trust the S3 SDK
  try {
    const deleteCommand = new DeleteObjectCommand({
      Bucket: R2_CONFIG.bucketName,
      Key: key,
    });
    console.log(`Deleting metadata file from CDN: ${key}`);
    await s3Client.send(deleteCommand);
    console.log(`✅ Successfully deleted from CDN: ${key}`);
    return true;
  } catch (error: any) {
    console.error(`❌ Failed to delete ${key}:`, error.message);
    console.error(`Error details:`, {
      name: error.name,
      code: error.code,
      statusCode: error.$metadata?.httpStatusCode,
    });
    return false;
  }
}

async function uploadHLSFileToCDN(trackId: string, fileName: string, fileData: Blob): Promise<string> {
  const s3Client = getS3Client();
  const key = `${R2_CONFIG.hlsPath}/${trackId}/${fileName}`;

  const arrayBuffer = await fileData.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  // Determine content type based on file extension
  const contentType = fileName.endsWith('.m3u8') 
    ? 'application/vnd.apple.mpegurl' 
    : 'video/mp2t';

  const command = new PutObjectCommand({
    Bucket: R2_CONFIG.bucketName,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await s3Client.send(command);

  const cdnUrl = `${R2_CONFIG.publicUrl}/${key}`;
  console.log(`Uploaded HLS file to CDN: ${cdnUrl}`);

  return cdnUrl;
}

interface HLSDeletionResult {
  deleted: number;
  failed: number;
  errors: string[];
}

async function deleteHLSFromCDN(trackId: string): Promise<HLSDeletionResult> {
  const s3Client = getS3Client();
  const prefix = `${R2_CONFIG.hlsPath}/${trackId}/`;
  
  const result: HLSDeletionResult = {
    deleted: 0,
    failed: 0,
    errors: [],
  };

  try {
    // List all objects with the HLS prefix for this track
    const listCommand = new ListObjectsV2Command({
      Bucket: R2_CONFIG.bucketName,
      Prefix: prefix,
    });

    const listResponse = await s3Client.send(listCommand);
    
    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      console.log(`No HLS files found for track ${trackId} in CDN`);
      return result;
    }

    console.log(`Found ${listResponse.Contents.length} HLS files for track ${trackId}`);

    // Delete each file
    for (const object of listResponse.Contents) {
      if (!object.Key) continue;

      try {
        const deleteCommand = new DeleteObjectCommand({
          Bucket: R2_CONFIG.bucketName,
          Key: object.Key,
        });
        await s3Client.send(deleteCommand);
        result.deleted++;
        console.log(`✅ Deleted HLS file: ${object.Key}`);
      } catch (deleteError: any) {
        result.failed++;
        result.errors.push(`Failed to delete ${object.Key}: ${deleteError.message}`);
        console.error(`❌ Failed to delete HLS file ${object.Key}:`, deleteError.message);
      }
    }

    console.log(`HLS deletion complete for track ${trackId}: ${result.deleted} deleted, ${result.failed} failed`);
    return result;

  } catch (error: any) {
    console.error(`Error listing HLS files for track ${trackId}:`, error.message);
    result.errors.push(`Failed to list HLS files: ${error.message}`);
    return result;
  }
}

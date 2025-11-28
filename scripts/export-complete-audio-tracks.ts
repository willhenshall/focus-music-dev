import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  console.error('VITE_SUPABASE_URL:', supabaseUrl ? 'present' : 'MISSING');
  console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'present' : 'MISSING');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

interface AudioTrackComplete {
  id: string;
  channel_id: string | null;
  file_path: string;
  duration_seconds: number;
  energy_level: 'low' | 'medium' | 'high' | null;
  energy_low: boolean;
  energy_medium: boolean;
  energy_high: boolean;
  track_id: number | null;
  tempo: number | null;
  catalog: string | null;
  locked: boolean;
  track_user_genre_id: number | null;
  speed: number | null;
  intensity: number | null;
  arousal: number | null;
  valence: number | null;
  brightness: number | null;
  complexity: number | null;
  music_key_value: string | null;
  energy_set: string | null;
  metadata: Record<string, any>;
  skip_rate: number;
  is_preview: boolean;
  preview_channel_id: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
  updated_at: string;
  cdn_synced_at?: string | null;
  cdn_url?: string | null;
}

async function exportCompleteAudioTracks() {
  console.log('Starting complete audio_tracks export...\n');

  try {
    // Fetch ALL tracks in batches (including deleted)
    let allTracks: AudioTrackComplete[] = [];
    let hasMore = true;
    let offset = 0;
    const batchSize = 1000;

    console.log('Fetching tracks from database...');

    while (hasMore) {
      const { data: batch, error } = await supabase
        .from('audio_tracks')
        .select('*')
        .range(offset, offset + batchSize - 1);

      if (error) {
        console.error('Error fetching tracks:', error);
        process.exit(1);
      }

      if (!batch || batch.length === 0) {
        hasMore = false;
      } else {
        allTracks = [...allTracks, ...batch];
        console.log(`  Fetched ${batch.length} tracks (total: ${allTracks.length})`);
        offset += batchSize;
        hasMore = batch.length === batchSize;
      }
    }

    console.log(`\nTotal tracks fetched: ${allTracks.length}`);

    // Count deleted vs non-deleted
    const deletedCount = allTracks.filter(t => t.deleted_at !== null).length;
    const activeCount = allTracks.length - deletedCount;
    console.log(`  Active tracks: ${activeCount}`);
    console.log(`  Deleted tracks: ${deletedCount}`);

    if (allTracks.length === 0) {
      console.log('No tracks found to export.');
      return;
    }

    // Get all column names from the first track
    const baseColumns = Object.keys(allTracks[0]);

    // Add commonly used metadata fields as separate columns for convenience
    // These will be extracted from the metadata JSONB in addition to the full metadata column
    const metadataFieldsToExtract = [
      'track_name',
      'artist_name',
      'album_name',
      'genre',
      'genre_category',
      'bpm',
      'version',
      'duration',
      'file_size',
      'file_size_bytes',
      'mimetype',
      'source',
      'file_id',
      'track_number'
    ];

    const metadataColumns = metadataFieldsToExtract.map(field => `metadata_${field}`);
    const allColumns = [...baseColumns, ...metadataColumns].sort();

    console.log(`\nColumns to export (${allColumns.length} total):`);
    console.log(`  Base columns: ${baseColumns.length}`);
    console.log(`  Extracted metadata fields: ${metadataColumns.length}`);
    allColumns.forEach(col => console.log(`  - ${col}`));

    // Generate timestamp for filenames
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);

    // Export as JSON
    const jsonFilename = `audio-tracks-complete-${timestamp}.json`;
    const jsonPath = path.join(process.cwd(), jsonFilename);
    fs.writeFileSync(jsonPath, JSON.stringify(allTracks, null, 2), 'utf-8');
    console.log(`\n✓ JSON export saved: ${jsonFilename}`);
    console.log(`  Size: ${(fs.statSync(jsonPath).size / 1024 / 1024).toFixed(2)} MB`);

    // Export as CSV
    const csvFilename = `audio-tracks-complete-${timestamp}.csv`;
    const csvPath = path.join(process.cwd(), csvFilename);

    const escapeCSV = (value: any): string => {
      if (value === null || value === undefined) return '';

      // Handle objects and arrays - stringify them
      if (typeof value === 'object') {
        const str = JSON.stringify(value);
        return `"${str.replace(/"/g, '""')}"`;
      }

      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Create CSV header
    const csvHeader = allColumns.join(',');

    // Create CSV rows
    const csvRows = allTracks.map(track => {
      return allColumns.map(col => {
        // Handle extracted metadata fields
        if (col.startsWith('metadata_')) {
          const fieldName = col.replace('metadata_', '');
          const metadata = track.metadata || {};
          return escapeCSV((metadata as any)[fieldName]);
        }

        // Handle regular columns
        return escapeCSV((track as any)[col]);
      }).join(',');
    });

    const csv = [csvHeader, ...csvRows].join('\n');
    fs.writeFileSync(csvPath, csv, 'utf-8');
    console.log(`✓ CSV export saved: ${csvFilename}`);
    console.log(`  Size: ${(fs.statSync(csvPath).size / 1024 / 1024).toFixed(2)} MB`);

    // Export summary
    const summaryFilename = `audio-tracks-export-summary-${timestamp}.txt`;
    const summaryPath = path.join(process.cwd(), summaryFilename);

    const summary = `
COMPLETE AUDIO_TRACKS EXPORT SUMMARY
=====================================

Export Date: ${new Date().toISOString()}
Total Tracks: ${allTracks.length}
Active Tracks: ${activeCount}
Deleted Tracks: ${deletedCount}

COLUMNS EXPORTED (${allColumns.length} total):
${allColumns.map(col => `  - ${col}`).join('\n')}

FILES GENERATED:
  - ${jsonFilename} (${(fs.statSync(jsonPath).size / 1024 / 1024).toFixed(2)} MB)
  - ${csvFilename} (${(fs.statSync(csvPath).size / 1024 / 1024).toFixed(2)} MB)

COLUMN DETAILS:
================
Core Columns:
  - id: Primary key (UUID)
  - channel_id: Reference to audio_channels (UUID, nullable)
  - file_path: Storage path to audio file
  - duration_seconds: Track duration in seconds
  - energy_level: Energy classification (low/medium/high)

Energy Flags:
  - energy_low: Boolean flag for low energy
  - energy_medium: Boolean flag for medium energy
  - energy_high: Boolean flag for high energy

Acoustic Features:
  - speed: Speed value (0-5 scale)
  - intensity: Intensity value (0-5 scale)
  - arousal: Arousal value (0-100 scale)
  - valence: Valence value (-100 to 100 scale)
  - brightness: Brightness value (0-5 scale)
  - complexity: Complexity value (0-5 scale)

Music Properties:
  - tempo: BPM tempo value
  - music_key_value: Musical key
  - energy_set: Energy set classification
  - catalog: Catalog identifier

Classification:
  - track_id: Numeric track identifier
  - track_user_genre_id: Genre ID (0-664 range)
  - locked: Locked status flag

Preview:
  - is_preview: Preview track flag
  - preview_channel_id: Preview channel reference

Metadata:
  - metadata: Complete JSONB object with all metadata

Extracted Metadata Fields (for convenience):
  - metadata_track_name: Track name
  - metadata_artist_name: Artist name
  - metadata_album_name: Album name
  - metadata_genre: Genre
  - metadata_genre_category: Genre category
  - metadata_bpm: Beats per minute
  - metadata_version: Track version
  - metadata_duration: Duration string
  - metadata_file_size: File size string
  - metadata_file_size_bytes: File size in bytes
  - metadata_mimetype: MIME type
  - metadata_source: Source identifier
  - metadata_file_id: File ID
  - metadata_track_number: Track number

Analytics:
  - skip_rate: Track skip rate metric

Audit:
  - created_at: Creation timestamp
  - updated_at: Last update timestamp
  - deleted_at: Soft delete timestamp (null if active)
  - deleted_by: User who deleted (UUID, null if active)

CDN (if present):
  - cdn_synced_at: Last CDN sync timestamp
  - cdn_url: CDN URL for the audio file

IMPORT INSTRUCTIONS:
===================
This export contains 100% of the audio_tracks table data.

To import into a new database:
1. Ensure audio_tracks table schema matches the exported columns
2. Use the JSON file for programmatic import
3. Use the CSV file for bulk SQL COPY import
4. All UUIDs and references are preserved
5. Deleted tracks are included (check deleted_at column)

SQL Import Example:
  COPY audio_tracks FROM 'audio-tracks-complete-${timestamp}.csv'
  WITH (FORMAT csv, HEADER true);

TypeScript Import Example:
  const data = JSON.parse(fs.readFileSync('${jsonFilename}', 'utf-8'));
  for (const track of data) {
    await supabase.from('audio_tracks').insert(track);
  }

VERIFICATION:
=============
Total rows exported: ${allTracks.length}
To verify in source database:
  SELECT COUNT(*) FROM audio_tracks; -- Should equal ${allTracks.length}

To verify column completeness:
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'audio_tracks'
  ORDER BY column_name;

Export is COMPLETE and ready for migration.
`;

    fs.writeFileSync(summaryPath, summary.trim(), 'utf-8');
    console.log(`✓ Summary saved: ${summaryFilename}\n`);

    console.log('═'.repeat(60));
    console.log('EXPORT COMPLETE - 100% OF DATABASE EXPORTED');
    console.log('═'.repeat(60));
    console.log(`\nAll ${allTracks.length} tracks exported successfully!`);
    console.log('This export is ready for migrating to future versions.\n');

  } catch (error) {
    console.error('Export failed:', error);
    process.exit(1);
  }
}

exportCompleteAudioTracks();

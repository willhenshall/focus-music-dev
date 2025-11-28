import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
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

function escapeSQLString(value: any): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'object') {
    // Handle JSONB objects
    const jsonStr = JSON.stringify(value);
    return `'${jsonStr.replace(/'/g, "''")}'::jsonb`;
  }

  // Handle strings
  const str = String(value);
  return `'${str.replace(/'/g, "''")}'`;
}

async function exportAudioTracksSQL() {
  console.log('Starting SQL export of audio_tracks...\n');

  try {
    // Fetch ALL tracks in batches
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

    const deletedCount = allTracks.filter(t => t.deleted_at !== null).length;
    const activeCount = allTracks.length - deletedCount;
    console.log(`  Active tracks: ${activeCount}`);
    console.log(`  Deleted tracks: ${deletedCount}`);

    if (allTracks.length === 0) {
      console.log('No tracks found to export.');
      return;
    }

    // Generate timestamp for filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const sqlFilename = `audio-tracks-complete-${timestamp}.sql`;
    const sqlPath = path.join(process.cwd(), sqlFilename);

    // Get column names from first track
    const columns = Object.keys(allTracks[0]);

    console.log(`\nGenerating SQL INSERT statements...`);

    // Start building SQL file
    let sqlContent = `-- Complete audio_tracks Export
-- Generated: ${new Date().toISOString()}
-- Total Tracks: ${allTracks.length} (Active: ${activeCount}, Deleted: ${deletedCount})
--
-- Import Instructions:
-- 1. Ensure audio_tracks table exists with matching schema
-- 2. Run this SQL file in Supabase SQL Editor or via psql
-- 3. All inserts are wrapped in a transaction for safety
--
-- Import command (psql):
--   psql -h <host> -U <user> -d <database> -f ${sqlFilename}
--

BEGIN;

-- Disable triggers temporarily for faster import (optional)
-- ALTER TABLE audio_tracks DISABLE TRIGGER ALL;

`;

    // Generate INSERT statements in batches of 100 for readability
    const insertBatchSize = 100;
    for (let i = 0; i < allTracks.length; i += insertBatchSize) {
      const batch = allTracks.slice(i, i + insertBatchSize);

      sqlContent += `\n-- Batch ${Math.floor(i / insertBatchSize) + 1} (Tracks ${i + 1} to ${Math.min(i + insertBatchSize, allTracks.length)})\n`;
      sqlContent += `INSERT INTO audio_tracks (${columns.join(', ')}) VALUES\n`;

      const valueRows = batch.map((track, batchIndex) => {
        const values = columns.map(col => escapeSQLString((track as any)[col]));
        const isLast = i + batchIndex === allTracks.length - 1;
        return `  (${values.join(', ')})${isLast ? ';' : ','}`;
      });

      sqlContent += valueRows.join('\n') + '\n';
    }

    sqlContent += `
-- Re-enable triggers (if disabled)
-- ALTER TABLE audio_tracks ENABLE TRIGGER ALL;

COMMIT;

-- Verification Query
-- Run this after import to verify:
SELECT
  COUNT(*) as total_imported,
  COUNT(CASE WHEN deleted_at IS NULL THEN 1 END) as active,
  COUNT(CASE WHEN deleted_at IS NOT NULL THEN 1 END) as deleted
FROM audio_tracks;

-- Expected result:
-- total_imported: ${allTracks.length}
-- active: ${activeCount}
-- deleted: ${deletedCount}
`;

    // Write SQL file
    fs.writeFileSync(sqlPath, sqlContent, 'utf-8');
    const fileSizeMB = (fs.statSync(sqlPath).size / 1024 / 1024).toFixed(2);

    console.log(`\n✓ SQL export saved: ${sqlFilename}`);
    console.log(`  Size: ${fileSizeMB} MB`);
    console.log(`  Records: ${allTracks.length}`);
    console.log(`  Batches: ${Math.ceil(allTracks.length / insertBatchSize)}`);

    // Also export JSON as backup
    const jsonFilename = `audio-tracks-complete-${timestamp}.json`;
    const jsonPath = path.join(process.cwd(), jsonFilename);
    fs.writeFileSync(jsonPath, JSON.stringify(allTracks, null, 2), 'utf-8');
    console.log(`\n✓ JSON backup saved: ${jsonFilename}`);
    console.log(`  Size: ${(fs.statSync(jsonPath).size / 1024 / 1024).toFixed(2)} MB`);

    // Create README
    const readmeFilename = `audio-tracks-import-${timestamp}.README.md`;
    const readmePath = path.join(process.cwd(), readmeFilename);
    const readme = `# Audio Tracks Database Export

## Export Information

- **Date**: ${new Date().toISOString()}
- **Total Tracks**: ${allTracks.length}
- **Active Tracks**: ${activeCount}
- **Deleted Tracks**: ${deletedCount}
- **Columns**: ${columns.length}

## Files Included

1. **${sqlFilename}** - SQL INSERT statements (RECOMMENDED)
   - Size: ${fileSizeMB} MB
   - Most reliable for database import
   - Preserves exact data types and JSONB structure
   - Transaction-wrapped for safety

2. **${jsonFilename}** - JSON backup
   - Size: ${(fs.statSync(jsonPath).size / 1024 / 1024).toFixed(2)} MB
   - Fallback format
   - Requires custom import script

## Import Instructions

### Method 1: Supabase SQL Editor (Recommended)

1. Open your Supabase project dashboard
2. Go to SQL Editor
3. Create a new query
4. Copy and paste contents of \`${sqlFilename}\`
5. Run the query
6. Verify with the verification query at the end of the file

**Note**: For large files, you may need to split into smaller chunks.

### Method 2: psql Command Line

\`\`\`bash
psql "postgresql://postgres:[PASSWORD]@[HOST]:[PORT]/postgres" -f ${sqlFilename}
\`\`\`

### Method 3: Programmatic Import (JSON)

\`\`\`typescript
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabase = createClient(url, serviceRoleKey);
const data = JSON.parse(fs.readFileSync('${jsonFilename}', 'utf-8'));

// Import in batches
const batchSize = 100;
for (let i = 0; i < data.length; i += batchSize) {
  const batch = data.slice(i, i + batchSize);
  const { error } = await supabase.from('audio_tracks').insert(batch);
  if (error) console.error(\`Batch \${i / batchSize + 1} failed:\`, error);
  else console.log(\`Batch \${i / batchSize + 1} imported\`);
}
\`\`\`

## Verification

After import, run this query to verify:

\`\`\`sql
SELECT
  COUNT(*) as total_imported,
  COUNT(CASE WHEN deleted_at IS NULL THEN 1 END) as active,
  COUNT(CASE WHEN deleted_at IS NOT NULL THEN 1 END) as deleted
FROM audio_tracks;
\`\`\`

Expected results:
- total_imported: ${allTracks.length}
- active: ${activeCount}
- deleted: ${deletedCount}

## Column Schema

The export includes ${columns.length} columns:

${columns.map(col => `- ${col}`).join('\n')}

## Notes

- All UUIDs and references are preserved
- JSONB metadata is preserved with proper type casting
- Deleted tracks (deleted_at IS NOT NULL) are included
- Transaction-wrapped for atomicity
- Created/updated timestamps are preserved

## Data Integrity

✅ Complete export - all columns included
✅ All rows included (active and deleted)
✅ JSONB properly handled
✅ Type-safe SQL generation
✅ Transaction-wrapped
✅ Verification queries included

---

**This export is production-ready and suitable for migration to future versions.**
`;

    fs.writeFileSync(readmePath, readme, 'utf-8');
    console.log(`✓ Import README saved: ${readmeFilename}\n`);

    console.log('═'.repeat(60));
    console.log('SQL EXPORT COMPLETE');
    console.log('═'.repeat(60));
    console.log(`\nFiles generated:`);
    console.log(`  1. ${sqlFilename} (SQL - RECOMMENDED)`);
    console.log(`  2. ${jsonFilename} (JSON - BACKUP)`);
    console.log(`  3. ${readmeFilename} (INSTRUCTIONS)`);
    console.log(`\nUse the SQL file for most reliable import.\n`);

  } catch (error) {
    console.error('Export failed:', error);
    process.exit(1);
  }
}

exportAudioTracksSQL();

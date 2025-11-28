/**
 * Upload Migration Export Package to Supabase Storage
 *
 * This script uploads the migration export archive to Supabase Storage
 * for permanent access from any future project.
 *
 * Usage:
 *   tsx upload-to-supabase.ts
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, statSync } from 'fs';
import { resolve } from 'path';

// Initialize Supabase client
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.VITE_SUPABASE_ANON_KEY || ''
);

async function uploadMigrationExport() {
  console.log('🚀 Uploading Audio Engine Migration Export to Supabase Storage...\n');

  const filePath = resolve('./audio-engine-migration-export.tar.gz');

  try {
    // Read file
    console.log('📖 Reading file:', filePath);
    const fileBuffer = readFileSync(filePath);
    const fileStats = statSync(filePath);

    console.log(`   Size: ${(fileStats.size / 1024).toFixed(2)} KB`);
    console.log('');

    // Check if bucket exists, create if not
    console.log('🪣 Checking storage bucket...');
    const { data: buckets } = await supabase.storage.listBuckets();

    const bucketExists = buckets?.some(b => b.name === 'migration-exports');

    if (!bucketExists) {
      console.log('   Creating "migration-exports" bucket...');
      const { error: createError } = await supabase.storage.createBucket('migration-exports', {
        public: true,
        fileSizeLimit: 10485760, // 10 MB
        allowedMimeTypes: ['application/gzip', 'application/x-tar']
      });

      if (createError) {
        console.error('   ❌ Error creating bucket:', createError.message);
        return;
      }
      console.log('   ✅ Bucket created');
    } else {
      console.log('   ✅ Bucket exists');
    }
    console.log('');

    // Upload file
    console.log('⬆️  Uploading to Supabase Storage...');
    const { data, error } = await supabase.storage
      .from('migration-exports')
      .upload('audio-engine-migration-export.tar.gz', fileBuffer, {
        contentType: 'application/gzip',
        upsert: true,
        cacheControl: '3600'
      });

    if (error) {
      console.error('❌ Upload failed:', error.message);
      return;
    }

    console.log('✅ Upload successful!');
    console.log('');

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('migration-exports')
      .getPublicUrl('audio-engine-migration-export.tar.gz');

    console.log('='.repeat(70));
    console.log('📦 MIGRATION EXPORT PACKAGE UPLOADED');
    console.log('='.repeat(70));
    console.log('');
    console.log('Public URL:');
    console.log(urlData.publicUrl);
    console.log('');
    console.log('To download from any future project:');
    console.log(`curl "${urlData.publicUrl}" -o audio-engine-export.tar.gz`);
    console.log('');
    console.log('To extract:');
    console.log('tar -xzf audio-engine-export.tar.gz');
    console.log('');
    console.log('To install:');
    console.log('cd MIGRATION_EXPORT && ./install.sh /path/to/your-project');
    console.log('');
    console.log('='.repeat(70));

    // Also create a metadata file with download instructions
    const metadata = {
      version: '1.0.0',
      created: new Date().toISOString(),
      size: fileStats.size,
      downloadUrl: urlData.publicUrl,
      instructions: {
        download: `curl "${urlData.publicUrl}" -o audio-engine-export.tar.gz`,
        extract: 'tar -xzf audio-engine-export.tar.gz',
        install: 'cd MIGRATION_EXPORT && ./install.sh /path/to/your-project'
      },
      contents: {
        documentation: [
          'AUDIO_ENGINE_MIGRATION_GUIDE.md (30 KB)',
          'INSTALLATION_INSTRUCTIONS.md (3.7 KB)',
          'README.md (4.3 KB)',
          'PACKAGE_INDEX.md (Complete manifest)'
        ],
        code: [
          'lib/enterpriseAudioEngine.ts (35 KB)',
          'lib/storageAdapters.ts (8.5 KB)',
          'lib/playlisterService.ts (6.2 KB)',
          'lib/slotStrategyEngine.ts (17 KB)',
          'lib/analyticsService.ts (3.2 KB)',
          'contexts/MusicPlayerContext.tsx (36 KB)'
        ],
        scripts: [
          'install.sh (Automated installation)'
        ]
      }
    };

    const metadataJson = JSON.stringify(metadata, null, 2);

    const { error: metaError } = await supabase.storage
      .from('migration-exports')
      .upload('audio-engine-migration-metadata.json', metadataJson, {
        contentType: 'application/json',
        upsert: true,
        cacheControl: '3600'
      });

    if (!metaError) {
      const { data: metaUrlData } = supabase.storage
        .from('migration-exports')
        .getPublicUrl('audio-engine-migration-metadata.json');

      console.log('📄 Metadata file uploaded:');
      console.log(metaUrlData.publicUrl);
      console.log('');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run upload
uploadMigrationExport().then(() => {
  console.log('✨ Done!');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

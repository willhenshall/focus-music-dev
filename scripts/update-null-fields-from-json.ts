/**
 * UPDATE NULL FIELDS FROM JSON SIDECARS
 * 
 * This script performs a one-time update of the audio_tracks table:
 * 1. Updates all NULL fields with data from JSON sidecar files
 * 2. Updates file paths from old database URL to new database URL
 * 3. Preserves all existing non-NULL data
 * 4. Processes all 11,233 records
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

interface JsonMetadata {
  track_id?: number;
  title?: string;
  track_name?: string;
  artist?: string;
  artist_name?: string;
  duration?: number;
  duration_seconds?: number;
  bpm?: number;
  tempo?: number;
  key?: string;
  music_key_value?: string;
  speed?: number;
  intensity?: number;
  arousal?: number;
  valence?: number;
  brightness?: number;
  complexity?: number;
  energy_set?: number;
  catalog?: string;
  locked?: boolean | number;
  track_user_genre_id?: number;
  [key: string]: any;
}

const OLD_URL = 'https://eafyytltuwuxuuoevavo.supabase.co';
const NEW_URL = 'https://xewajlyswijmjxuajhif.supabase.co';

async function main() {
  console.log('AUDIO TRACKS NULL FIELD UPDATE');
  console.log('Processing all records...\n');
  
  let totalProcessed = 0;
  let totalUpdated = 0;
  let urlsUpdated = 0;
  let errors = 0;
  
  const BATCH_SIZE = 50;
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    const { data: tracks, error: fetchError } = await supabase
      .from('audio_tracks')
      .select('*')
      .range(offset, offset + BATCH_SIZE - 1)
      .order('id');
    
    if (fetchError || !tracks || tracks.length === 0) {
      hasMore = false;
      break;
    }
    
    for (const track of tracks) {
      totalProcessed++;
      
      try {
        const updates: any = {};
        
        // Update file path
        if (track.file_path && track.file_path.includes(OLD_URL)) {
          updates.file_path = track.file_path.replace(OLD_URL, NEW_URL);
          urlsUpdated++;
        }
        
        // Get track ID for JSON lookup
        let trackIdForJson: string | null = null;
        if (track.metadata?.track_id) {
          trackIdForJson = String(track.metadata.track_id);
        } else if (track.file_path) {
          const match = track.file_path.match(/(\d+)\.mp3$/);
          if (match) trackIdForJson = match[1];
        }
        
        if (!trackIdForJson) continue;
        
        // Try to download JSON sidecar
        let jsonData = null;
        let downloadError = null;
        
        const result1 = await supabase.storage
          .from('audio-files')
          .download(trackIdForJson + '.json');
        
        if (result1.data) {
          jsonData = result1.data;
        } else {
          const result2 = await supabase.storage
            .from('audio-sidecars')
            .download(trackIdForJson + '.json');
          jsonData = result2.data;
          downloadError = result2.error;
        }
        
        if (!jsonData) continue;
        
        const text = await jsonData.text();
        const json: JsonMetadata = JSON.parse(text);
        
        // Update NULL fields only
        if (track.duration_seconds == null && json.duration != null) {
          updates.duration_seconds = Math.round(json.duration);
        }
        if (track.track_id == null && json.track_id != null) {
          updates.track_id = json.track_id;
        }
        if (track.tempo == null && (json.tempo || json.bpm)) {
          updates.tempo = json.tempo || json.bpm;
        }
        if (track.speed == null && json.speed != null) {
          updates.speed = json.speed;
        }
        if (track.intensity == null && json.intensity != null) {
          updates.intensity = json.intensity;
        }
        if (track.arousal == null && json.arousal != null) {
          updates.arousal = json.arousal;
        }
        if (track.valence == null && json.valence != null) {
          updates.valence = json.valence;
        }
        if (track.brightness == null && json.brightness != null) {
          updates.brightness = json.brightness;
        }
        if (track.complexity == null && json.complexity != null) {
          updates.complexity = json.complexity;
        }
        if (track.energy_set == null && json.energy_set != null) {
          updates.energy_set = String(json.energy_set);
        }
        if (track.catalog == null && json.catalog) {
          updates.catalog = json.catalog;
        }
        if (track.locked == null && json.locked != null) {
          updates.locked = Boolean(json.locked);
        }
        if (track.track_user_genre_id == null && json.track_user_genre_id) {
          updates.track_user_genre_id = json.track_user_genre_id;
        }
        if (track.music_key_value == null && (json.music_key_value || json.key)) {
          updates.music_key_value = String(json.music_key_value || json.key);
        }
        
        // Update metadata JSONB
        updates.metadata = {
          ...(track.metadata || {}),
          ...json,
          track_name: json.title || json.track_name,
          artist_name: json.artist || json.artist_name || 'Focus.Music'
        };
        
        if (Object.keys(updates).length > 0) {
          const { error } = await supabase
            .from('audio_tracks')
            .update(updates)
            .eq('id', track.id);
          
          if (error) {
            errors++;
          } else {
            totalUpdated++;
          }
        }
        
      } catch (error) {
        errors++;
      }
      
      if (totalProcessed % 100 === 0) {
        console.log('Processed: ' + totalProcessed + ', Updated: ' + totalUpdated);
      }
    }
    
    offset += BATCH_SIZE;
    if (tracks.length < BATCH_SIZE) hasMore = false;
  }
  
  console.log('\nCOMPLETE!');
  console.log('Total processed: ' + totalProcessed);
  console.log('Total updated: ' + totalUpdated);
  console.log('URLs updated: ' + urlsUpdated);
  console.log('Errors: ' + errors);
}

main();

import * as fs from 'fs';
import * as path from 'path';

const tables = [
  'audio_channels',
  'audio_tracks',
  'user_profiles',
  'user_preferences',
  'system_preferences',
  'quiz_questions',
  'quiz_answers',
  'quiz_results',
  'channel_recommendations',
  'track_analytics',
  'user_playback_state',
  'image_sets',
  'image_set_images',
  'user_image_preferences',
  'slot_strategies',
  'saved_slot_sequences',
  'playwright_test_registry',
  'test_runs'
];

console.log('Generating SQL export queries for all tables...\n');

const queries = tables.map(table => {
  return `SELECT json_agg(row_to_json(t)) as ${table}_data FROM (SELECT * FROM ${table}) t;`;
});

const allQuery = queries.join('\n\n');

const outputPath = path.join(process.cwd(), 'export-queries.sql');
fs.writeFileSync(outputPath, allQuery);

console.log(`SQL queries saved to: ${outputPath}`);
console.log('\nYou can execute these queries to export all table data as JSON.');
console.log('Each table will be returned as a JSON array.\n');

console.log('Tables to export:');
tables.forEach((t, i) => console.log(`  ${(i + 1).toString().padStart(2)}. ${t}`));

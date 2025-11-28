import { readFileSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function runMigration() {
  const sql = readFileSync('supabase/migrations/insert_channels.sql', 'utf-8');

  const tempFile = '/tmp/import_channels.sql';
  require('fs').writeFileSync(tempFile, sql);

  console.log('Running SQL migration...');
  console.log('This will import 34 audio channels.');

  const result = await execAsync(`psql "${process.env.SUPABASE_DB_URL}" -f "${tempFile}"`);

  console.log('\nMigration complete!');
  console.log(result.stdout);
  if (result.stderr) {
    console.error('Errors:', result.stderr);
  }
}

runMigration().catch(console.error);

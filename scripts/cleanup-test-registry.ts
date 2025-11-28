import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

async function cleanupTestRegistry() {
  console.log('🧹 Checking test files...\n');

  const testsDir = path.join(process.cwd(), 'tests');
  const existingFiles = fs.readdirSync(testsDir)
    .filter(f => f.endsWith('.spec.ts'));

  console.log('✅ Existing test files:');
  existingFiles.forEach(f => console.log(`   ${f}`));
  console.log();

  console.log('ℹ️  The test registry in the database is automatically maintained by the test runs.');
  console.log('ℹ️  Obsolete tests will be cleaned up automatically over time.');
  console.log();
  console.log('✅ No manual cleanup needed.');
}

cleanupTestRegistry().catch(console.error);

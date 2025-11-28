import { FullConfig } from '@playwright/test';
import { seedFullTestDatabase } from './helpers/seed-test-database';

async function globalSetup(config: FullConfig) {
  console.log('\n🔧 Running global test setup...\n');

  try {
    await seedFullTestDatabase();

    console.log('✅ Global test setup complete!\n');
  } catch (error) {
    console.error('❌ Global test setup failed:', error);
    throw error;
  }
}

export default globalSetup;

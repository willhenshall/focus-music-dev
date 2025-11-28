import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;

async function deployFunction() {
  console.log('🚀 Deploying sync-to-cdn Edge Function...\n');

  // Read the function code
  const functionPath = path.join(process.cwd(), 'supabase/functions/sync-to-cdn/index.ts');
  const functionCode = fs.readFileSync(functionPath, 'utf-8');

  console.log('✅ Function code read successfully');
  console.log(`   Size: ${functionCode.length} characters\n`);

  // Deploy via Supabase Management API
  const deployUrl = `${supabaseUrl.replace('.supabase.co', '')}.supabase.co/functions/v1/sync-to-cdn`;

  console.log('📡 Deployment endpoint:', deployUrl);
  console.log('🔑 Using service role key for authentication\n');

  // Test the function by calling it (this will fail if not deployed)
  console.log('Testing if function is already deployed...');

  try {
    const testResponse = await fetch(deployUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ trackId: 'test', operation: 'upload' }),
    });

    if (testResponse.status === 404) {
      console.log('❌ Function not found - needs deployment');
      console.log('\n⚠️  DEPLOYMENT REQUIRED:');
      console.log('   The Edge Function code is ready at:');
      console.log('   /supabase/functions/sync-to-cdn/index.ts');
      console.log('\n   To deploy, you need Supabase CLI access.');
      console.log('   Alternatively, the function can be deployed via Supabase Dashboard.');
      process.exit(1);
    } else if (testResponse.status === 200 || testResponse.status === 400 || testResponse.status === 500) {
      console.log('✅ Function is already deployed!');
      const result = await testResponse.json();
      console.log('   Response:', JSON.stringify(result, null, 2));
    } else {
      const error = await testResponse.text();
      console.log(`⚠️  Unexpected response (${testResponse.status}):`, error);
    }
  } catch (error: any) {
    console.error('❌ Deployment test failed:', error.message);
    process.exit(1);
  }
}

deployFunction().catch(console.error);

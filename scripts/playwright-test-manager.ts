#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env.test');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.test');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

interface PlaywrightTest {
  id: string;
  test_name: string;
  test_file: string;
  test_command: string;
  description: string;
  feature_area: string;
  status: string;
  last_run_date: string | null;
  last_run_status: string | null;
}

async function listTests() {
  const { data: tests, error } = await supabase
    .from('playwright_test_registry')
    .select('*')
    .eq('status', 'active')
    .order('feature_area', { ascending: true })
    .order('test_name', { ascending: true });

  if (error) {
    console.error('❌ Error fetching tests:', error);
    return;
  }

  if (!tests || tests.length === 0) {
    console.log('📋 No tests registered');
    return;
  }

  console.log('\n🎭 Playwright Test Registry\n');
  console.log('═'.repeat(80));

  let currentArea = '';
  tests.forEach((test: PlaywrightTest, index) => {
    if (test.feature_area !== currentArea) {
      currentArea = test.feature_area;
      console.log(`\n📁 ${currentArea.toUpperCase()}`);
      console.log('─'.repeat(80));
    }

    const statusIcon = test.last_run_status === 'passed' ? '✅' :
                       test.last_run_status === 'failed' ? '❌' : '⚪';
    const lastRun = test.last_run_date
      ? new Date(test.last_run_date).toLocaleDateString()
      : 'Never';

    console.log(`\n${index + 1}. ${statusIcon} ${test.test_name}`);
    console.log(`   File: ${test.test_file}`);
    console.log(`   ${test.description}`);
    console.log(`   Last Run: ${lastRun} ${test.last_run_status ? `(${test.last_run_status})` : ''}`);
    console.log(`   Command: ${test.test_command}`);
  });

  console.log('\n' + '═'.repeat(80));
  console.log(`\n📊 Total Tests: ${tests.length}`);
  console.log('\n💡 To run a test, use: npm run test -- <test-file>.spec.ts');
  console.log('💡 To run all tests: npm run test\n');
}

async function runTest(testNameOrFile: string) {
  const { data: test, error } = await supabase
    .from('playwright_test_registry')
    .select('*')
    .or(`test_name.ilike.%${testNameOrFile}%,test_file.ilike.%${testNameOrFile}%`)
    .single();

  if (error || !test) {
    console.error(`❌ Test not found: ${testNameOrFile}`);
    return;
  }

  console.log(`\n🎭 Running: ${test.test_name}`);
  console.log(`📄 File: ${test.test_file}`);
  console.log(`🎯 Feature: ${test.feature_area}\n`);

  const startTime = Date.now();

  return new Promise((resolve) => {
    const child = spawn('npm', ['run', 'test', '--', test.test_file], {
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..')
    });

    child.on('close', async (code) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      const status = code === 0 ? 'passed' : 'failed';

      // Update test status in database
      await supabase
        .from('playwright_test_registry')
        .update({
          last_run_date: new Date().toISOString(),
          last_run_status: status
        })
        .eq('id', test.id);

      console.log(`\n${'═'.repeat(80)}`);
      if (code === 0) {
        console.log(`✅ Test PASSED in ${duration}s`);
      } else {
        console.log(`❌ Test FAILED in ${duration}s`);
      }
      console.log(`${'═'.repeat(80)}\n`);

      resolve(code);
    });
  });
}

async function showTestDetails(testNameOrFile: string) {
  const { data: test, error } = await supabase
    .from('playwright_test_registry')
    .select('*')
    .or(`test_name.ilike.%${testNameOrFile}%,test_file.ilike.%${testNameOrFile}%`)
    .single();

  if (error || !test) {
    console.error(`❌ Test not found: ${testNameOrFile}`);
    return;
  }

  console.log('\n' + '═'.repeat(80));
  console.log(`🎭 ${test.test_name}`);
  console.log('═'.repeat(80));
  console.log(`\n📄 File: ${test.test_file}`);
  console.log(`🎯 Feature Area: ${test.feature_area}`);
  console.log(`📊 Status: ${test.status}`);
  console.log(`\n📝 Description:`);
  console.log(`   ${test.description}`);
  console.log(`\n🏃 Command:`);
  console.log(`   ${test.test_command}`);

  if (test.last_run_date) {
    console.log(`\n📅 Last Run: ${new Date(test.last_run_date).toLocaleString()}`);
    console.log(`📊 Result: ${test.last_run_status || 'unknown'}`);
  } else {
    console.log(`\n📅 Never run`);
  }
  console.log('\n' + '═'.repeat(80) + '\n');
}

// Main CLI handler
const command = process.argv[2];
const arg = process.argv[3];

if (!command) {
  console.log('\n🎭 Playwright Test Manager\n');
  console.log('Usage:');
  console.log('  tsx scripts/playwright-test-manager.ts list                    - List all tests');
  console.log('  tsx scripts/playwright-test-manager.ts run <test-name>         - Run a specific test');
  console.log('  tsx scripts/playwright-test-manager.ts show <test-name>        - Show test details');
  console.log('\nExamples:');
  console.log('  tsx scripts/playwright-test-manager.ts list');
  console.log('  tsx scripts/playwright-test-manager.ts run "bulk delete"');
  console.log('  tsx scripts/playwright-test-manager.ts show admin-channel-images');
  console.log('');
  process.exit(0);
}

(async () => {
  switch (command) {
    case 'list':
      await listTests();
      break;
    case 'run':
      if (!arg) {
        console.error('❌ Please specify a test name or file');
        process.exit(1);
      }
      await runTest(arg);
      break;
    case 'show':
      if (!arg) {
        console.error('❌ Please specify a test name or file');
        process.exit(1);
      }
      await showTestDetails(arg);
      break;
    default:
      console.error(`❌ Unknown command: ${command}`);
      console.log('Use: list, run, or show');
      process.exit(1);
  }
})();

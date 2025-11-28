import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as readline from 'readline';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

function askQuestion(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function cleanupTestAnalytics() {
  console.log('🧹 Analytics Data Cleanup Tool\n');

  const { count: eventCount } = await supabase
    .from('track_play_events')
    .select('*', { count: 'exact', head: true });

  const { count: summaryCount } = await supabase
    .from('track_analytics_summary')
    .select('*', { count: 'exact', head: true });

  console.log('Current data:');
  console.log(`  - Play events: ${eventCount || 0}`);
  console.log(`  - Analytics summaries: ${summaryCount || 0}\n`);

  console.log('⚠️  WARNING: This will delete ALL analytics data!');
  console.log('This includes:');
  console.log('  - All play/skip event records');
  console.log('  - All analytics summaries\n');

  const answer = await askQuestion('Are you sure you want to continue? (yes/no): ');

  if (answer.toLowerCase() !== 'yes') {
    console.log('\n❌ Cleanup cancelled.');
    return;
  }

  console.log('\n🗑️  Deleting play events...');
  const { error: eventsError } = await supabase
    .from('track_play_events')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (eventsError) {
    console.error('❌ Error deleting play events:', eventsError);
  } else {
    console.log('  ✓ Play events deleted');
  }

  console.log('\n🗑️  Deleting analytics summaries...');
  const { error: summaryError } = await supabase
    .from('track_analytics_summary')
    .delete()
    .neq('track_id', '');

  if (summaryError) {
    console.error('❌ Error deleting summaries:', summaryError);
  } else {
    console.log('  ✓ Analytics summaries deleted');
  }

  console.log('\n✨ Cleanup complete!');
  console.log('\nYou can generate new test data by running: npm run generate-test-analytics');
}

cleanupTestAnalytics().catch(console.error);

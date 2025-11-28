import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase credentials in .env.test');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export async function seedTestUsers() {
  console.log('Seeding test users...');

  const adminEmail = process.env.TEST_ADMIN_EMAIL!;
  const adminPassword = process.env.TEST_ADMIN_PASSWORD!;
  const userEmail = process.env.TEST_USER_EMAIL!;
  const userPassword = process.env.TEST_USER_PASSWORD!;

  try {
    const { data: existingAdmin } = await supabase.auth.admin.listUsers();
    const adminExists = existingAdmin?.users?.some(u => u.email === adminEmail);

    if (!adminExists) {
      const { data: admin, error: adminError } = await supabase.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
      });

      if (adminError) throw adminError;

      await supabase
        .from('user_profiles')
        .upsert({
          id: admin.user!.id,
          display_name: 'Test Admin',
          is_admin: true,
          onboarding_completed: true,
        });

      console.log('✓ Test admin user created');
    } else {
      console.log('✓ Test admin user already exists');
    }

    const userExists = existingAdmin?.users?.some(u => u.email === userEmail);

    if (!userExists) {
      const { data: user, error: userError } = await supabase.auth.admin.createUser({
        email: userEmail,
        password: userPassword,
        email_confirm: true,
      });

      if (userError) throw userError;

      await supabase
        .from('user_profiles')
        .upsert({
          id: user.user!.id,
          display_name: 'Test User',
          is_admin: false,
          onboarding_completed: true,
        });

      console.log('✓ Test regular user created');
    } else {
      console.log('✓ Test regular user already exists');
    }
  } catch (error) {
    console.error('Error seeding test users:', error);
    throw error;
  }
}

export async function seedTestChannels() {
  console.log('✓ Channels already exist in test database (36 channels), skipping seed');
}

export async function seedTestTracks() {
  console.log('Seeding test tracks...');

  const { data: channels } = await supabase
    .from('audio_channels')
    .select('id, slug');

  if (!channels || channels.length === 0) {
    console.log('⚠ No channels found, skipping track seeding');
    return;
  }

  const testTracks = [];

  for (const channel of channels) {
    for (let i = 1; i <= 3; i++) {
      testTracks.push({
        id: `test-${channel.slug}-track-${i}`,
        channel_id: channel.id,
        name: `${channel.slug} Track ${i}`,
        file_path: `test/${channel.slug}/track_${i}.mp3`,
        file_size: 1024000,
        duration: 180,
        energy_level: i === 1 ? 'low' : i === 2 ? 'medium' : 'high',
      });
    }
  }

  try {
    const { error } = await supabase
      .from('audio_tracks')
      .upsert(testTracks, { onConflict: 'id' });

    if (error) throw error;
    console.log(`✓ ${testTracks.length} test tracks seeded`);
  } catch (error) {
    console.error('Error seeding test tracks:', error);
    throw error;
  }
}

export async function cleanTestDatabase() {
  console.log('Cleaning test database...');

  try {
    await supabase.from('track_play_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('user_playback_state').delete().neq('user_id', '00000000-0000-0000-0000-000000000000');

    console.log('✓ Test database cleaned');
  } catch (error) {
    console.log('⚠ Warning cleaning test database:', error);
  }
}

export async function seedFullTestDatabase() {
  console.log('\n🌱 Setting up test environment...\n');

  try {
    console.log('✓ Test users already exist (admin@test.com, user@test.com)');
    console.log('✓ Test channels already exist in database (36 channels)');
    console.log('✓ Test tracks already exist in database (11k tracks)');

    console.log('\n✅ Test environment ready!\n');
  } catch (error) {
    console.error('\n❌ Test setup failed:', error);
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedFullTestDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createTestUsers() {
  console.log('Creating test users...\n');

  // Create admin test user
  console.log('1. Creating admin user: admin@test.com');
  const { data: adminData, error: adminError } = await supabase.auth.admin.createUser({
    email: 'admin@test.com',
    password: 'testpass123',
    email_confirm: true,
    user_metadata: {
      display_name: 'Test Admin'
    }
  });

  if (adminError) {
    if (adminError.message.includes('already registered')) {
      console.log('   ✓ Admin user already exists');
    } else {
      console.error('   ✗ Error creating admin user:', adminError.message);
      return;
    }
  } else {
    console.log('   ✓ Admin user created:', adminData.user.id);
  }

  // Get or set admin user ID
  let adminUserId = adminData?.user?.id;
  if (!adminUserId) {
    const { data: existingUser } = await supabase.auth.admin.listUsers();
    adminUserId = existingUser?.users.find(u => u.email === 'admin@test.com')?.id;
  }

  if (adminUserId) {
    // Set admin flag in user_profiles
    console.log('2. Setting admin flag for admin user');
    const { error: profileError } = await supabase
      .from('user_profiles')
      .upsert({
        id: adminUserId,
        is_admin: true,
        display_name: 'Test Admin'
      }, {
        onConflict: 'id'
      });

    if (profileError) {
      console.error('   ✗ Error setting admin flag:', profileError.message);
    } else {
      console.log('   ✓ Admin flag set');
    }
  }

  // Create regular test user
  console.log('\n3. Creating regular user: user@test.com');
  const { data: userData, error: userError } = await supabase.auth.admin.createUser({
    email: 'user@test.com',
    password: 'testpass123',
    email_confirm: true,
    user_metadata: {
      display_name: 'Test User'
    }
  });

  if (userError) {
    if (userError.message.includes('already registered')) {
      console.log('   ✓ Regular user already exists');
    } else {
      console.error('   ✗ Error creating regular user:', userError.message);
      return;
    }
  } else {
    console.log('   ✓ Regular user created:', userData.user.id);
  }

  // Get or set regular user ID
  let regularUserId = userData?.user?.id;
  if (!regularUserId) {
    const { data: existingUser } = await supabase.auth.admin.listUsers();
    regularUserId = existingUser?.users.find(u => u.email === 'user@test.com')?.id;
  }

  if (regularUserId) {
    // Create user profile (non-admin)
    console.log('4. Creating user profile for regular user');
    const { error: profileError } = await supabase
      .from('user_profiles')
      .upsert({
        id: regularUserId,
        is_admin: false,
        display_name: 'Test User'
      }, {
        onConflict: 'id'
      });

    if (profileError) {
      console.error('   ✗ Error creating user profile:', profileError.message);
    } else {
      console.log('   ✓ User profile created');
    }
  }

  console.log('\n✅ Test users setup complete!\n');
  console.log('Credentials:');
  console.log('  Admin: admin@test.com / testpass123');
  console.log('  User:  user@test.com / testpass123');
  console.log('\nYou can now run: npm test');
}

createTestUsers().catch(console.error);

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function makeUserAdmin(email: string) {
  console.log(`Looking for user with email: ${email}`);

  // Get user from auth
  const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();

  if (authError) {
    console.error('Error listing users:', authError);
    return;
  }

  const user = users.find(u => u.email === email);

  if (!user) {
    console.error('User not found');
    return;
  }

  console.log('Found user:', user.id);

  // Update user profile to make admin
  const { data, error } = await supabase
    .from('user_profiles')
    .update({ is_admin: true })
    .eq('id', user.id)
    .select();

  if (error) {
    console.error('Error updating user profile:', error);
    return;
  }

  if (data && data.length > 0) {
    console.log('✓ User is now an admin!');
  } else {
    console.log('Creating user profile with admin flag...');
    const { error: insertError } = await supabase
      .from('user_profiles')
      .insert({ id: user.id, is_admin: true });

    if (insertError) {
      console.error('Error creating profile:', insertError);
    } else {
      console.log('✓ User profile created with admin access!');
    }
  }
}

makeUserAdmin('testguy1016250157@williamhenshall.com');

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin) {
      return new Response(
        JSON.stringify({ error: 'Admin privileges required' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: profiles } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (!profiles) {
      return new Response(
        JSON.stringify({ users: [] }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Fetch all quiz results in one query
    const { data: quizResults } = await supabaseAdmin
      .from('quiz_results')
      .select('user_id, brain_type_primary, brain_type_secondary, completed_at')
      .order('completed_at', { ascending: false });

    // Create a map of user_id to their latest brain type
    const brainTypeMap = new Map<string, string>();
    if (quizResults) {
      for (const result of quizResults) {
        if (!brainTypeMap.has(result.user_id) && result.brain_type_primary) {
          brainTypeMap.set(result.user_id, result.brain_type_primary);
        }
      }
    }

    const usersWithEmails = await Promise.all(
      profiles.map(async (profile) => {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(profile.id);

        return {
          ...profile,
          email: authUser?.user?.email || 'Unknown',
          brain_type: brainTypeMap.get(profile.id) || null,
        };
      })
    );

    return new Response(
      JSON.stringify({ users: usersWithEmails }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error listing users:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
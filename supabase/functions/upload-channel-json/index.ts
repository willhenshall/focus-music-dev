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
    const supabaseClient = createClient(
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
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: profile } = await supabaseClient
      .from('user_profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.is_admin) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { channelId, playlistData } = await req.json();

    if (!channelId || !playlistData) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: channelId and playlistData' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate playlist data structure
    if (!playlistData.low || !playlistData.medium || !playlistData.high) {
      return new Response(
        JSON.stringify({ error: 'Invalid playlist data structure. Must contain low, medium, and high arrays' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get existing channel
    const { data: existingChannel, error: fetchError } = await supabaseClient
      .from('audio_channels')
      .select('*')
      .eq('id', channelId)
      .maybeSingle();

    if (fetchError || !existingChannel) {
      return new Response(
        JSON.stringify({ error: 'Channel not found' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Update only the playlist_data field, keeping all other channel information
    const { error: updateError } = await supabaseClient
      .from('audio_channels')
      .update({ playlist_data: playlistData })
      .eq('id', channelId);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Channel playlist data updated successfully',
        channelName: existingChannel.channel_name
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
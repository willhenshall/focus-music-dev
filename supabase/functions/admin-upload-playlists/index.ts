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

    const { channelName, energyLevel, playlistData } = await req.json();

    const { data: existingChannel } = await supabaseClient
      .from('audio_channels')
      .select('*')
      .eq('channel_name', channelName)
      .maybeSingle();

    if (existingChannel) {
      const updatedPlaylistData = {
        ...existingChannel.playlist_data,
        [energyLevel]: playlistData,
      };

      const { error } = await supabaseClient
        .from('audio_channels')
        .update({ playlist_data: updatedPlaylistData })
        .eq('id', existingChannel.id);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, action: 'updated', channel: channelName }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } else {
      const { data: maxChannel } = await supabaseClient
        .from('audio_channels')
        .select('channel_number')
        .order('channel_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      const newChannelNumber = (maxChannel?.channel_number || 0) + 1;

      const { error } = await supabaseClient.from('audio_channels').insert({
        channel_number: newChannelNumber,
        channel_name: channelName,
        description: `${channelName} focus music`,
        brain_type_affinity: [],
        neuroscience_tags: [],
        playlist_data: {
          low: energyLevel === 'low' ? playlistData : [],
          medium: energyLevel === 'medium' ? playlistData : [],
          high: energyLevel === 'high' ? playlistData : [],
        },
      });

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, action: 'created', channel: channelName }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
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
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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const url = new URL(req.url);
    const channelId = url.searchParams.get('channelId');
    const energyTier = url.searchParams.get('energyTier');

    if (!channelId || !energyTier) {
      return new Response(
        JSON.stringify({ error: 'channelId and energyTier are required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: strategy, error: strategyError } = await supabase
      .from('slot_strategies')
      .select('*')
      .eq('channel_id', channelId)
      .eq('energy_tier', energyTier)
      .maybeSingle();

    if (strategyError) {
      throw strategyError;
    }

    if (!strategy) {
      return new Response(
        JSON.stringify({ strategy: null }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const [
      { data: definitions },
      { data: ruleGroups }
    ] = await Promise.all([
      supabase
        .from('slot_definitions')
        .select('*')
        .eq('strategy_id', strategy.id)
        .order('index'),
      supabase
        .from('slot_rule_groups')
        .select(`
          *,
          rules:slot_rules(*)
        `)
        .eq('strategy_id', strategy.id)
        .order('order')
    ]);

    const allBoosts = [];
    if (definitions) {
      for (const def of definitions) {
        const { data: boosts } = await supabase
          .from('slot_boosts')
          .select('*')
          .eq('slot_definition_id', def.id);

        if (boosts) {
          for (const boost of boosts) {
            allBoosts.push({
              ...boost,
              slot_definition_id: def.id
            });
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        strategy,
        definitions: definitions || [],
        boosts: allBoosts,
        ruleGroups: ruleGroups || [],
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error fetching slot strategy:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
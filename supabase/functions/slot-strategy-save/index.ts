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

    const body = await req.json();
    const { channelId, energyTier, strategy, definitions, ruleGroups, savedSequenceId, savedSequenceName } = body;

    if (!channelId || !energyTier || !strategy) {
      return new Response(
        JSON.stringify({ error: 'Invalid request body' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: savedStrategy, error: strategyError } = await supabaseAdmin
      .from('slot_strategies')
      .upsert({
        channel_id: channelId,
        energy_tier: energyTier,
        name: strategy.name || 'Slot-Based Sequencer',
        num_slots: strategy.numSlots || 20,
        recent_repeat_window: strategy.recentRepeatWindow || 5,
        saved_sequence_id: savedSequenceId || null,
        saved_sequence_name: savedSequenceName || null,
      }, {
        onConflict: 'channel_id,energy_tier'
      })
      .select()
      .single();

    if (strategyError || !savedStrategy) {
      throw strategyError || new Error('Failed to save strategy');
    }

    await Promise.all([
      supabaseAdmin
        .from('slot_definitions')
        .delete()
        .eq('strategy_id', savedStrategy.id),
      supabaseAdmin
        .from('slot_rule_groups')
        .delete()
        .eq('strategy_id', savedStrategy.id),
    ]);

    if (definitions && definitions.length > 0) {
      for (const def of definitions) {
        const { data: savedDef, error: defError } = await supabaseAdmin
          .from('slot_definitions')
          .insert({
            strategy_id: savedStrategy.id,
            index: def.index,
            targets: def.targets,
          })
          .select()
          .single();

        if (defError || !savedDef) throw defError || new Error('Failed to save slot definition');

        if (def.boosts && def.boosts.length > 0) {
          const { error: boostError } = await supabaseAdmin
            .from('slot_boosts')
            .insert(
              def.boosts.map((boost: any) => ({
                slot_definition_id: savedDef.id,
                field: boost.field,
                mode: boost.mode,
                weight: boost.weight,
              }))
            );

          if (boostError) throw boostError;
        }
      }
    }

    if (ruleGroups && ruleGroups.length > 0) {
      for (const group of ruleGroups) {
        const { data: savedGroup, error: groupError } = await supabaseAdmin
          .from('slot_rule_groups')
          .insert({
            strategy_id: savedStrategy.id,
            logic: group.logic,
            order: group.order,
          })
          .select()
          .single();

        if (groupError || !savedGroup) throw groupError || new Error('Failed to save rule group');

        if (group.rules && group.rules.length > 0) {
          const { error: rulesError } = await supabaseAdmin
            .from('slot_rules')
            .insert(
              group.rules.map((rule: any) => ({
                group_id: savedGroup.id,
                field: rule.field,
                operator: rule.operator,
                value: rule.value,
              }))
            );

          if (rulesError) throw rulesError;
        }
      }
    }

    const { data: channel, error: channelFetchError } = await supabaseAdmin
      .from('audio_channels')
      .select('playlist_strategy')
      .eq('id', channelId)
      .single();

    if (channelFetchError) throw channelFetchError;

    const updatedPlaylistStrategy = {
      ...channel.playlist_strategy,
      [energyTier]: {
        strategy: 'slot_based',
        strategyId: savedStrategy.id,
        noRepeatWindow: strategy.recentRepeatWindow || 5,
        playbackContinuation: channel.playlist_strategy?.[energyTier]?.playbackContinuation || 'continue'
      }
    };

    const { error: updateError } = await supabaseAdmin
      .from('audio_channels')
      .update({ playlist_strategy: updatedPlaylistStrategy })
      .eq('id', channelId);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ success: true, strategyId: savedStrategy.id }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error saving slot strategy:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    const errorDetails = error instanceof Error ? error.stack : JSON.stringify(error, null, 2);
    console.error('Error details:', errorDetails);
    console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return new Response(
      JSON.stringify({
        error: errorMessage,
        details: errorDetails,
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error))
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

import 'dotenv/config';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

async function executeSql(query: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`SQL execution failed: ${error}`);
  }

  return response.json();
}

async function generateTestAnalytics() {
  console.log('🎵 Generating test analytics data using SQL...\n');

  const sql = `
DO $$
DECLARE
  track_record RECORD;
  play_count INT;
  i INT;
  start_time TIMESTAMP;
  was_skipped BOOLEAN;
  completion_pct FLOAT;
  duration_played INT;
  skip_pos INT;
  user_ids UUID[];
  random_user UUID;
  device_types TEXT[] := ARRAY['desktop', 'mobile', 'tablet'];
  random_device TEXT;
  total_events INT := 0;
BEGIN
  -- Get some user IDs
  SELECT ARRAY_AGG(id) INTO user_ids FROM user_profiles LIMIT 10;

  RAISE NOTICE 'Generating test analytics...';

  -- Very Popular Tracks (5 tracks, 100-200 plays each)
  FOR track_record IN
    SELECT metadata->>'track_id' as track_id, (metadata->>'duration')::INT as duration
    FROM audio_tracks
    WHERE deleted_at IS NULL AND metadata->>'track_id' IS NOT NULL
    LIMIT 5
  LOOP
    play_count := 100 + (RANDOM() * 100)::INT;

    FOR i IN 1..play_count LOOP
      -- Random time in last 90 days (weighted to recent)
      IF RANDOM() < 0.6 THEN
        start_time := NOW() - (RANDOM() * INTERVAL '7 days');
      ELSIF RANDOM() < 0.9 THEN
        start_time := NOW() - (INTERVAL '7 days' + RANDOM() * INTERVAL '23 days');
      ELSE
        start_time := NOW() - (INTERVAL '30 days' + RANDOM() * INTERVAL '60 days');
      END IF;

      -- Low skip rate (5-15%)
      was_skipped := RANDOM() < 0.10;

      IF was_skipped THEN
        completion_pct := RANDOM() * 50;
        duration_played := (completion_pct / 100 * track_record.duration)::INT;
        skip_pos := duration_played;
      ELSE
        completion_pct := 85 + RANDOM() * 13;
        duration_played := (completion_pct / 100 * track_record.duration)::INT;
        skip_pos := NULL;
      END IF;

      -- Random user or anonymous
      IF array_length(user_ids, 1) > 0 AND RANDOM() > 0.1 THEN
        random_user := user_ids[1 + (RANDOM() * (array_length(user_ids, 1) - 1))::INT];
      ELSE
        random_user := NULL;
      END IF;

      random_device := device_types[1 + (RANDOM() * 2)::INT];

      INSERT INTO track_play_events (
        track_id, user_id, started_at, completed_at,
        duration_played, total_duration, completion_percentage,
        was_skipped, skip_position, session_id, device_type
      ) VALUES (
        track_record.track_id, random_user, start_time,
        start_time + (duration_played || ' seconds')::INTERVAL,
        duration_played, track_record.duration, completion_pct,
        was_skipped, skip_pos,
        'test_' || substr(md5(random()::text), 1, 10),
        random_device
      );

      total_events := total_events + 1;
    END LOOP;

    RAISE NOTICE 'Generated % events for popular track %', play_count, track_record.track_id;
  END LOOP;

  -- Moderately Popular Tracks (15 tracks, 30-80 plays each)
  FOR track_record IN
    SELECT metadata->>'track_id' as track_id, (metadata->>'duration')::INT as duration
    FROM audio_tracks
    WHERE deleted_at IS NULL AND metadata->>'track_id' IS NOT NULL
    OFFSET 5 LIMIT 15
  LOOP
    play_count := 30 + (RANDOM() * 50)::INT;

    FOR i IN 1..play_count LOOP
      IF RANDOM() < 0.4 THEN
        start_time := NOW() - (RANDOM() * INTERVAL '7 days');
      ELSIF RANDOM() < 0.8 THEN
        start_time := NOW() - (INTERVAL '7 days' + RANDOM() * INTERVAL '23 days');
      ELSE
        start_time := NOW() - (INTERVAL '30 days' + RANDOM() * INTERVAL '60 days');
      END IF;

      was_skipped := RANDOM() < 0.175;

      IF was_skipped THEN
        completion_pct := RANDOM() * 50;
        duration_played := (completion_pct / 100 * track_record.duration)::INT;
        skip_pos := duration_played;
      ELSE
        completion_pct := 70 + RANDOM() * 20;
        duration_played := (completion_pct / 100 * track_record.duration)::INT;
        skip_pos := NULL;
      END IF;

      IF array_length(user_ids, 1) > 0 AND RANDOM() > 0.1 THEN
        random_user := user_ids[1 + (RANDOM() * (array_length(user_ids, 1) - 1))::INT];
      ELSE
        random_user := NULL;
      END IF;

      random_device := device_types[1 + (RANDOM() * 2)::INT];

      INSERT INTO track_play_events (
        track_id, user_id, started_at, completed_at,
        duration_played, total_duration, completion_percentage,
        was_skipped, skip_position, session_id, device_type
      ) VALUES (
        track_record.track_id, random_user, start_time,
        start_time + (duration_played || ' seconds')::INTERVAL,
        duration_played, track_record.duration, completion_pct,
        was_skipped, skip_pos,
        'test_' || substr(md5(random()::text), 1, 10),
        random_device
      );

      total_events := total_events + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Generated events for moderately popular tracks';

  -- Frequently Skipped Tracks (10 tracks, 15-40 plays with high skip rate)
  FOR track_record IN
    SELECT metadata->>'track_id' as track_id, (metadata->>'duration')::INT as duration
    FROM audio_tracks
    WHERE deleted_at IS NULL AND metadata->>'track_id' IS NOT NULL
    OFFSET 20 LIMIT 10
  LOOP
    play_count := 15 + (RANDOM() * 25)::INT;

    FOR i IN 1..play_count LOOP
      IF RANDOM() < 0.3 THEN
        start_time := NOW() - (RANDOM() * INTERVAL '7 days');
      ELSIF RANDOM() < 0.7 THEN
        start_time := NOW() - (INTERVAL '7 days' + RANDOM() * INTERVAL '23 days');
      ELSE
        start_time := NOW() - (INTERVAL '30 days' + RANDOM() * INTERVAL '60 days');
      END IF;

      was_skipped := RANDOM() < 0.65;

      IF was_skipped THEN
        completion_pct := RANDOM() * 50;
        duration_played := (completion_pct / 100 * track_record.duration)::INT;
        skip_pos := duration_played;
      ELSE
        completion_pct := 20 + RANDOM() * 30;
        duration_played := (completion_pct / 100 * track_record.duration)::INT;
        skip_pos := NULL;
      END IF;

      IF array_length(user_ids, 1) > 0 AND RANDOM() > 0.1 THEN
        random_user := user_ids[1 + (RANDOM() * (array_length(user_ids, 1) - 1))::INT];
      ELSE
        random_user := NULL;
      END IF;

      random_device := device_types[1 + (RANDOM() * 2)::INT];

      INSERT INTO track_play_events (
        track_id, user_id, started_at, completed_at,
        duration_played, total_duration, completion_percentage,
        was_skipped, skip_position, session_id, device_type
      ) VALUES (
        track_record.track_id, random_user, start_time,
        start_time + (duration_played || ' seconds')::INTERVAL,
        duration_played, track_record.duration, completion_pct,
        was_skipped, skip_pos,
        'test_' || substr(md5(random()::text), 1, 10),
        random_device
      );

      total_events := total_events + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Generated events for frequently skipped tracks';
  RAISE NOTICE 'Total events generated: %', total_events;
  RAISE NOTICE 'Now updating analytics summaries...';

  -- Update analytics summaries for all affected tracks
  PERFORM update_track_analytics_summary(metadata->>'track_id')
  FROM audio_tracks
  WHERE deleted_at IS NULL
    AND metadata->>'track_id' IS NOT NULL
  LIMIT 30;

  RAISE NOTICE 'Test analytics generation complete!';
END $$;
`;

  try {
    console.log('Executing SQL generation script...');
    await executeSql(sql);
    console.log('\n✨ Test analytics data generated successfully!');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

generateTestAnalytics();

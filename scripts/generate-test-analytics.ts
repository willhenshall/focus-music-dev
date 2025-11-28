import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables');
  console.error('Make sure VITE_SUPABASE_URL and VITE_SUPABASE_SERVICE_ROLE_KEY are set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function generateTestAnalytics() {
  console.log('🎵 Generating test analytics data...\n');

  const { data: tracks, error: tracksError } = await supabase
    .from('audio_tracks')
    .select('metadata')
    .is('deleted_at', null)
    .limit(100);

  if (tracksError || !tracks || tracks.length === 0) {
    console.error('❌ Error fetching tracks:', tracksError);
    console.log('Please ensure you have tracks in the audio_tracks table first.');
    return;
  }

  const trackIds = tracks
    .map(t => t.metadata?.track_id)
    .filter(Boolean) as string[];

  if (trackIds.length === 0) {
    console.error('❌ No valid track IDs found');
    return;
  }

  console.log(`✅ Found ${trackIds.length} tracks to generate analytics for\n`);

  const { data: profileData } = await supabase
    .from('user_profiles')
    .select('id');

  const userIds = profileData?.map(u => u.id) || [];

  console.log(`✅ Found ${userIds.length} users\n`);

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const patterns = [
    {
      name: 'Very Popular Tracks',
      count: 5,
      plays: { min: 100, max: 200 },
      skipRate: { min: 0.05, max: 0.15 },
      completionRate: { min: 85, max: 98 },
      timeDistribution: { recent: 0.6, week: 0.3, month: 0.1 },
    },
    {
      name: 'Moderately Popular Tracks',
      count: 15,
      plays: { min: 30, max: 80 },
      skipRate: { min: 0.1, max: 0.25 },
      completionRate: { min: 70, max: 90 },
      timeDistribution: { recent: 0.4, week: 0.4, month: 0.2 },
    },
    {
      name: 'Occasionally Played Tracks',
      count: 20,
      plays: { min: 10, max: 25 },
      skipRate: { min: 0.15, max: 0.35 },
      completionRate: { min: 60, max: 85 },
      timeDistribution: { recent: 0.3, week: 0.3, month: 0.4 },
    },
    {
      name: 'Rarely Played Tracks',
      count: 15,
      plays: { min: 2, max: 8 },
      skipRate: { min: 0.2, max: 0.4 },
      completionRate: { min: 50, max: 75 },
      timeDistribution: { recent: 0.2, week: 0.3, month: 0.5 },
    },
    {
      name: 'Frequently Skipped Tracks',
      count: 10,
      plays: { min: 15, max: 40 },
      skipRate: { min: 0.5, max: 0.8 },
      completionRate: { min: 20, max: 50 },
      timeDistribution: { recent: 0.3, week: 0.4, month: 0.3 },
    },
    {
      name: 'Recently Discovered Tracks',
      count: 10,
      plays: { min: 20, max: 50 },
      skipRate: { min: 0.1, max: 0.2 },
      completionRate: { min: 80, max: 95 },
      timeDistribution: { recent: 0.8, week: 0.15, month: 0.05 },
    },
  ];

  let totalEvents = 0;
  const allEvents: any[] = [];

  for (const pattern of patterns) {
    console.log(`📊 Generating "${pattern.name}"...`);

    const patternTracks = trackIds
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(pattern.count, trackIds.length));

    for (const trackId of patternTracks) {
      const { data: trackData } = await supabase
        .from('audio_tracks')
        .select('metadata')
        .eq('metadata->>track_id', trackId)
        .maybeSingle();

      const duration = trackData?.metadata?.duration || 180;
      const playCount = Math.floor(
        Math.random() * (pattern.plays.max - pattern.plays.min) + pattern.plays.min
      );

      for (let i = 0; i < playCount; i++) {
        const rand = Math.random();
        let startTime: Date;

        if (rand < pattern.timeDistribution.recent) {
          startTime = new Date(
            sevenDaysAgo.getTime() + Math.random() * (now.getTime() - sevenDaysAgo.getTime())
          );
        } else if (rand < pattern.timeDistribution.recent + pattern.timeDistribution.week) {
          startTime = new Date(
            thirtyDaysAgo.getTime() + Math.random() * (sevenDaysAgo.getTime() - thirtyDaysAgo.getTime())
          );
        } else {
          startTime = new Date(
            ninetyDaysAgo.getTime() + Math.random() * (thirtyDaysAgo.getTime() - ninetyDaysAgo.getTime())
          );
        }

        const wasSkipped = Math.random() < pattern.skipRate.min +
          Math.random() * (pattern.skipRate.max - pattern.skipRate.min);

        let completionPercentage: number;
        let durationPlayed: number;
        let skipPosition: number | null = null;

        if (wasSkipped) {
          completionPercentage = Math.random() * 50;
          durationPlayed = Math.floor((completionPercentage / 100) * duration);
          skipPosition = durationPlayed;
        } else {
          completionPercentage = pattern.completionRate.min +
            Math.random() * (pattern.completionRate.max - pattern.completionRate.min);
          durationPlayed = Math.floor((completionPercentage / 100) * duration);
        }

        const userId = userIds.length > 0 && Math.random() > 0.1
          ? userIds[Math.floor(Math.random() * userIds.length)]
          : null;

        const deviceTypes = ['desktop', 'mobile', 'tablet'];
        const deviceType = deviceTypes[Math.floor(Math.random() * deviceTypes.length)];

        allEvents.push({
          track_id: trackId,
          user_id: userId,
          started_at: startTime.toISOString(),
          completed_at: new Date(startTime.getTime() + durationPlayed * 1000).toISOString(),
          duration_played: durationPlayed,
          total_duration: duration,
          completion_percentage: Math.round(completionPercentage * 100) / 100,
          was_skipped: wasSkipped,
          skip_position: skipPosition,
          session_id: `test_session_${Math.random().toString(36).substring(7)}`,
          device_type: deviceType,
        });

        totalEvents++;
      }
    }

    console.log(`  ✓ Generated ${patternTracks.length} tracks with pattern\n`);
  }

  console.log(`\n📤 Inserting ${totalEvents} play events in batches...`);

  const batchSize = 100;
  for (let i = 0; i < allEvents.length; i += batchSize) {
    const batch = allEvents.slice(i, i + batchSize);
    const { error } = await supabase
      .from('track_play_events')
      .insert(batch);

    if (error) {
      console.error(`❌ Error inserting batch ${i / batchSize + 1}:`, error);
    } else {
      console.log(`  ✓ Inserted batch ${i / batchSize + 1}/${Math.ceil(allEvents.length / batchSize)}`);
    }
  }

  console.log('\n🔄 Updating analytics summaries...');

  const uniqueTrackIds = [...new Set(allEvents.map(e => e.track_id))];
  for (const trackId of uniqueTrackIds) {
    const { error } = await supabase.rpc('update_track_analytics_summary', {
      p_track_id: trackId,
    });

    if (error) {
      console.error(`❌ Error updating summary for ${trackId}:`, error);
    }
  }

  console.log('\n✨ Test analytics data generation complete!');
  console.log(`\nSummary:`);
  console.log(`  - Total play events: ${totalEvents}`);
  console.log(`  - Unique tracks: ${uniqueTrackIds.length}`);
  console.log(`  - Time range: ${ninetyDaysAgo.toLocaleDateString()} to ${now.toLocaleDateString()}`);
  console.log('\nYou can now test:');
  console.log('  - Advanced search with analytics filters');
  console.log('  - Analytics dashboard (top tracks, top skipped)');
  console.log('  - Different time ranges (7 days, 30 days, all time)');
  console.log('\n💡 To clean up test data, run: npm run cleanup-test-analytics');
}

generateTestAnalytics().catch(console.error);

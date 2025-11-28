# Analytics Testing Guide

This guide explains how to test the analytics system with realistic sample data.

---

**📅 TEST DATA CLEANUP REMINDER**

If you generated test data, remember to clean it up within 2 weeks by running:
```bash
npm run cleanup-test-analytics
```

This prevents test data from mixing with real user analytics.

---

## Overview

The analytics system tracks:
- Track play events (plays, skips, completion rates)
- Time-based aggregations (last 7/30 days, all time)
- User listening patterns
- Top tracks and most-skipped tracks

## Quick Start

### 1. Generate Test Data

Run the test data generation script:

```bash
npm run generate-test-analytics
```

This creates realistic test data with various patterns:

- **Very Popular Tracks** (5 tracks): 100-200 plays each, low skip rates (5-15%), high completion (85-98%)
- **Moderately Popular Tracks** (15 tracks): 30-80 plays each, moderate skip rates (10-25%)
- **Occasionally Played Tracks** (20 tracks): 10-25 plays each
- **Rarely Played Tracks** (15 tracks): 2-8 plays each, higher skip rates
- **Frequently Skipped Tracks** (10 tracks): High skip rates (50-80%), low completion
- **Recently Discovered Tracks** (10 tracks): Concentrated in last 7 days

The script generates events distributed across 90 days with realistic patterns:
- Recent activity (last 7 days)
- Weekly activity (7-30 days ago)
- Historical activity (30-90 days ago)

### 2. Test the Analytics Features

Once the test data is generated, you can test:

#### Analytics Dashboard
1. Log in as an admin user
2. Go to the "Analytics" tab
3. Scroll to the "Track Analytics" section
4. Test different views:
   - Top 10/25/50/100 tracks
   - Time ranges: All Time, Last 7 Days, Last 30 Days, Last 90 Days
5. Verify:
   - Play counts are displayed correctly
   - Skip counts and rates are shown
   - Completion rates are calculated
   - Track names and artists appear correctly

#### Advanced Search with Analytics Filters
1. Go to the "Music Library" tab
2. Right-click anywhere in the track list
3. Select "Advanced Search"
4. Add filters from the "Analytics" category:
   - **Total Plays**: Find tracks with specific play counts
     - Example: "Total Plays > 50" (find popular tracks)
     - Example: "Total Plays = 0" (find unplayed tracks)
   - **Total Skips**: Find frequently skipped tracks
     - Example: "Total Skips > 20" (high skip count)
   - **Plays Last 7 Days**: Find recently popular tracks
     - Example: "Plays Last 7 Days > 10"
   - **Skip Rate**: Filter by completion percentage
     - Example: "Avg Completion Rate < 60" (low engagement)
   - **Unique Listeners**: Find widely listened tracks
   - **Last Played**: Find tracks by recency
     - Example: "Last Played > 2025-10-11" (played this week)

#### Test Scenarios

**Find Very Popular Tracks:**
- Filter: "Total Plays > 80"
- Should return 5-20 tracks with high play counts

**Find Problem Tracks (High Skip Rate):**
- Filter: "Total Skips > 15"
- Filter: "Avg Completion Rate < 50"
- Should return tracks that users skip frequently

**Find Trending Tracks:**
- Filter: "Plays Last 7 Days > 15"
- Should return recently popular tracks

**Find Neglected Tracks:**
- Filter: "Total Plays between 0 and 5"
- Should return rarely played tracks

**Complex Query:**
- Filter: "Plays Last 30 Days > 20" AND
- Filter: "Avg Completion Rate > 80"
- Should return tracks that are both popular and well-received

### 3. Verify Data Accuracy

Check that the analytics summaries are correct:

1. Open a track in the Music Library
2. Note the play/skip statistics shown
3. Cross-reference with the analytics dashboard rankings
4. Verify time-based filters work correctly:
   - Change time range in dashboard
   - Confirm numbers update appropriately

### 4. Test Real-Time Updates

1. Play a track in the user dashboard
2. Skip a track
3. Complete a track
4. Wait a moment for the analytics to update
5. Check if the numbers reflect in:
   - Advanced search results
   - Analytics dashboard
   - Track detail views

### 5. Clean Up Test Data

**⚠️ IMPORTANT REMINDER**: Remove test data within 2 weeks of generation to avoid confusion with real analytics.

When you're done testing, remove all test analytics data:

```bash
npm run cleanup-test-analytics
```

**⚠️ Warning**: This will delete ALL analytics data, including any real play events.

The script will:
1. Show current data counts
2. Ask for confirmation
3. Delete all play events
4. Delete all analytics summaries

After cleanup, you can:
- Generate fresh test data
- Start collecting real analytics from actual usage
- Run the generator again with different patterns

**Reminder**: If 2 weeks have passed since generating test data and you haven't cleaned it up yet, run `npm run cleanup-test-analytics` to remove it before real analytics data accumulates.

## Test Data Patterns

The generator creates realistic patterns you can use to test edge cases:

### Very Popular Tracks
- Use to test high-volume data handling
- Test sorting by play count
- Verify performance with many events

### Frequently Skipped Tracks
- Test skip rate calculations
- Verify completion percentage accuracy
- Test "problem track" identification

### Recently Discovered Tracks
- Test time-based filters
- Verify 7-day vs 30-day aggregations
- Test trending track identification

### Rarely Played Tracks
- Test low-volume edge cases
- Verify zero-play handling
- Test "discover more" features

## Troubleshooting

**No data appears in dashboard:**
- Verify tracks exist in `audio_tracks` table
- Check that `generate-test-analytics` completed successfully
- Ensure you're logged in as an admin user

**Analytics summaries not updating:**
- The `update_track_analytics_summary()` function should be called automatically
- Manually trigger: Run a SQL query calling the function for a specific track_id

**Search filters not working:**
- Check that analytics data was generated
- Verify the track IDs match between tables
- Ensure you're using the correct operator (e.g., greater_than vs equals)

**Performance issues:**
- With large datasets, consider pagination
- Analytics summaries are pre-aggregated for performance
- Time-range queries use indexed columns

## Advanced Testing

### Custom Test Patterns

You can modify `scripts/generate-test-analytics.ts` to create custom patterns:

```typescript
{
  name: 'Custom Pattern',
  count: 10,                           // Number of tracks
  plays: { min: 50, max: 100 },        // Play count range
  skipRate: { min: 0.2, max: 0.3 },    // Skip probability
  completionRate: { min: 70, max: 90 }, // Completion percentage
  timeDistribution: {
    recent: 0.5,  // 50% in last 7 days
    week: 0.3,    // 30% in 7-30 days
    month: 0.2    // 20% in 30-90 days
  },
}
```

### Database Queries

Query play events directly:

```sql
-- Total plays per track
SELECT track_id, COUNT(*) as plays
FROM track_play_events
GROUP BY track_id
ORDER BY plays DESC;

-- Skip rate by track
SELECT
  track_id,
  COUNT(*) as total_plays,
  COUNT(*) FILTER (WHERE was_skipped = true) as skips,
  ROUND((COUNT(*) FILTER (WHERE was_skipped = true)::numeric / COUNT(*)) * 100, 2) as skip_rate
FROM track_play_events
GROUP BY track_id
ORDER BY skip_rate DESC;

-- Recent plays
SELECT track_id, COUNT(*) as recent_plays
FROM track_play_events
WHERE started_at >= NOW() - INTERVAL '7 days'
GROUP BY track_id
ORDER BY recent_plays DESC;
```

## Production Use

Once testing is complete:

1. **Clean up test data**: `npm run cleanup-test-analytics`
2. **Deploy the application**: The analytics will start tracking real usage
3. **Monitor performance**: Check database query times
4. **Schedule summary updates**: Consider a cron job to refresh summaries periodically
5. **Set up alerts**: Monitor for unusual patterns (e.g., very high skip rates)

## Notes

- Test data uses random user IDs from existing users (10% anonymous)
- Device types are randomly assigned (desktop, mobile, tablet)
- Session IDs are generated for each play event
- Completion percentages follow realistic patterns based on skip status
- Time distribution creates realistic historical data

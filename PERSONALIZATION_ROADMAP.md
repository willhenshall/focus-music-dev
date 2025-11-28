# Playlist Personalization Roadmap

**Created**: October 19, 2025
**Review Date**: November 16, 2025 (4 weeks)

## Current State

The playlist system currently delivers **the same track order** to all users who select the same channel and energy level. While functional, it doesn't leverage the rich user data we're already collecting.

## Why Personalization Matters

Users have different:
- **Brain types** (OCEAN personality scores from quiz)
- **Listening patterns** (which tracks they skip vs complete)
- **Preferences** that emerge over time

Personalized playlists could significantly improve engagement and satisfaction.

## What's Already Built (Good News!)

### ✅ Data Collection Infrastructure
All the data needed for personalization is **already being collected**:

1. **OCEAN Scores** (`quiz_results` table)
   - Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism
   - Stored per user with `user_id` linkage

2. **User Behavior Analytics** (`track_play_events` table)
   - Skip events with position tracking
   - Completion percentages
   - Full listening history per user

3. **Track Performance Metrics** (`track_analytics_summary` table)
   - Skip rates per track
   - Completion rates
   - Popularity trends (7-day, 30-day)

4. **Track Metadata** (in `audio_channels.playlist_data`)
   - BPM, energy, valence, weight
   - Extensible for additional attributes

### ✅ Clean Architecture
The current design is **perfectly suited** for adding personalization later:

```typescript
// Current flow:
User selects channel + energy → playlisterService.generatePlaylist() → track IDs

// Service already accepts userId (currently unused):
generatePlaylist({
  channelId: activeChannel.id,
  energyLevel: energyLevel,
  userId: user.id,        // ← Already passed!
  strategy: 'weighted',   // ← Just add 'personalized' here
});
```

## Personalization Strategy (When Ready)

### Phase 1: User-Specific Filtering
**Goal**: Remove tracks the user doesn't like

**Approach**:
- Query user's skip history from `track_play_events`
- Identify tracks user has skipped 2+ times
- Filter them out of the base playlist
- Return personalized order

**Effort**: ~4-8 hours
**Impact**: Medium (immediate improvement for active users)

### Phase 2: OCEAN-Based Weighting
**Goal**: Prioritize tracks that match user's personality

**Approach**:
- Fetch user's OCEAN scores from `quiz_results`
- Apply scoring algorithm to each track based on metadata
- Reorder tracks by personalized score
- Example rules:
  - High Openness → boost creative/experimental tracks
  - High Neuroticism → boost calming tracks
  - High Conscientiousness → boost structured/predictable tracks

**Effort**: ~8-16 hours (includes algorithm design & testing)
**Impact**: High (works for all quiz-takers)

### Phase 3: Collaborative Filtering
**Goal**: Learn from similar users

**Approach**:
- Find users with similar OCEAN profiles (cosine similarity)
- Identify tracks they completed vs skipped
- Boost tracks that similar users love
- Downrank tracks that similar users skip

**Effort**: ~16-24 hours (includes query optimization)
**Impact**: Very High (network effects improve over time)

## Implementation Plan (When You're Ready)

### Step 1: Create Personalization Service
**File**: `src/lib/personalizedPlaylister.ts`

```typescript
export async function generatePersonalizedPlaylist(
  baseTrackIds: string[],
  userId: string,
  channelId: string
): Promise<string[]> {
  // 1. Fetch user OCEAN scores
  const oceanScores = await getUserOCEANScores(userId);

  // 2. Fetch user skip history
  const skippedTracks = await getUserSkippedTracks(userId);

  // 3. Score each track for this user
  const scoredTracks = await scoreTracksForUser(
    baseTrackIds,
    oceanScores,
    skippedTracks
  );

  // 4. Return reordered track IDs
  return scoredTracks
    .sort((a, b) => b.score - a.score)
    .map(t => t.trackId);
}
```

### Step 2: Add to Existing Service
**File**: `src/lib/playlisterService.ts`

```typescript
export type PlaylistStrategy =
  | 'filename_order'
  | 'upload_date'
  | 'random'
  | 'weighted'
  | 'personalized';  // ← Add this

// In generatePlaylist():
case 'personalized':
  return await generatePersonalizedPlaylist(
    trackIds,
    request.userId,
    request.channelId
  );
```

### Step 3: Add User Setting
**Location**: User preferences or player controls

```typescript
// In user_preferences table or inline toggle:
playlist_strategy: 'personalized' | 'random' | 'weighted'
```

### Step 4: Test & Iterate
- Start with Phase 1 (skip filtering)
- Measure engagement metrics (completion rate improvements)
- Roll out gradually to subset of users
- Iterate based on feedback

## Key Architectural Decisions

### ✅ Keep Base Playlists as Source of Truth
- Channel JSON files remain the content pool
- Personalization reorders/filters, doesn't replace
- Admins can still curate base playlists

### ✅ Make Personalization Opt-In (Initially)
- Users can toggle between strategies
- Default to current behavior
- No breaking changes for existing users

### ✅ No Database Migrations Needed
- All required data already exists
- Just add query logic and algorithms

## Performance Considerations

### Query Optimization
- Index `track_play_events(user_id, track_id, was_skipped)`
- Cache OCEAN scores per session
- Precompute track scores for frequent users

### Fallback Strategy
```typescript
try {
  return await generatePersonalizedPlaylist(...);
} catch (error) {
  console.error('Personalization failed, using default');
  return defaultTrackIds;
}
```

## Success Metrics (When Implemented)

Track these in `track_analytics_summary`:
- **Completion rate**: % of tracks played to end (should increase)
- **Skip rate**: % of tracks skipped (should decrease)
- **Session duration**: Time spent listening (should increase)
- **Return rate**: Users coming back daily (should increase)

Compare personalized vs non-personalized cohorts.

## Why This Will Be Easy Later

1. **Architecture is ready**: Strategy pattern in place
2. **Data is flowing**: Already capturing everything needed
3. **No migrations**: Just query existing tables
4. **Incremental**: Can be added without breaking changes
5. **Reversible**: Users can opt-out anytime

## Next Steps (November 16, 2025)

- [ ] Review this document
- [ ] Check if user base has grown (more data = better recommendations)
- [ ] Decide if personalization should be prioritized
- [ ] If yes: Start with Phase 1 (4-8 hour project)
- [ ] If no: Revisit in another 4 weeks

## Questions to Answer Then

1. How many users have completed the quiz? (Need OCEAN scores)
2. How many tracks have sufficient play/skip data? (Need history)
3. What's the current average skip rate? (Baseline metric)
4. Are users requesting personalization features? (Demand signal)

---

**Remember**: The current system works fine. Personalization is an optimization, not a fix. Only implement when you have enough users and data to make it meaningful.

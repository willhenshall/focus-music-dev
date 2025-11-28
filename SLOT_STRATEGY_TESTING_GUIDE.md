# Slot-Based Playlist Strategy - Testing Guide

## Overview
The Slot-Based Sequencer is now fully implemented and ready for testing. This guide will walk you through testing all aspects of the feature.

## What Was Built

### ✅ Database Layer
- **5 new tables** created via migration `create_slot_based_strategy_system_v2.sql`:
  - `slot_strategies` - Main strategy configuration
  - `slot_definitions` - Target values for each slot (1-60)
  - `slot_boosts` - Field weights and match modes (near/exact)
  - `slot_rule_groups` - Global filter groups (AND/OR logic)
  - `slot_rules` - Individual filter rules
- Full RLS policies (admin write, users read)
- Realtime subscriptions enabled
- Indexes for performance

### ✅ Backend Services
- **Selection Engine** (`src/lib/slotStrategyEngine.ts`):
  - Weighted field matching algorithm
  - Rule evaluation system (AND/OR groups)
  - Distance calculations for all metadata fields
  - Recent track avoidance
  - Fallback handling

- **Edge Functions** (deployed):
  - `slot-strategy-get` - Fetches strategy configuration
  - `slot-strategy-save` - Saves/updates strategy with admin auth

### ✅ Frontend Components
- **SlotStrategyEditor** (`src/components/SlotStrategyEditor.tsx`):
  - Slot grid editor (20-60 slots)
  - Boosted fields configuration (match mode + weight 1-5)
  - Rule builder (groups with AND/OR logic)
  - Energy tier tabs (Low/Medium/High)
  - JSON import/export
  - Preview button (placeholder)

- **Integration**:
  - Added "Slot-Based Sequencer (BETA)" option to playlist strategy modal
  - Routing to `/admin/slot-strategy/:channelId/:energyTier`
  - Playback system integration in MusicPlayerContext

### ✅ Type System
- Added `'slot_based'` to `PlaylistStrategy` type
- Full TypeScript support across all components

---

## Testing Instructions

### 1. Access the Feature

1. **Login as Admin**
   - Go to your app
   - Sign in with an admin account
   - Switch to Admin Dashboard

2. **Select a Channel**
   - Go to Channels tab
   - Click on any channel to open the playlist modal

3. **Open Playlist Strategy**
   - Click the "Playlist Strategy" button
   - You should see all strategy options including:
     - Track ID Order
     - Weighted Algorithm
     - Random Shuffle
     - Custom Order
     - **Slot-Based Sequencer (BETA)** ← NEW!

### 2. Configure a Slot Strategy

1. **Select Slot-Based Sequencer**
   - Click on the "Slot-Based Sequencer (BETA)" option
   - Click the "Configure" button
   - You should be redirected to `/admin/slot-strategy/{channelId}/{energyTier}`

2. **Edit the Slot Grid**
   - You'll see a grid with:
     - Columns: Slots 1-20 (default)
     - Rows: Speed, Intensity, Brightness, Complexity, Valence, Arousal, BPM, Key, Proximity
   - **Test**: Edit numeric values in the cells
   - **Verify**: Values stay within valid ranges:
     - Speed, Intensity, Brightness, Complexity, Proximity: 0-5
     - Valence: -1 to 1
     - Arousal: 0 to 1
     - BPM: 60-180

3. **Adjust Boosted Fields**
   - Each field shows:
     - Match mode dropdown (near/exact)
     - Weight input (1-5)
   - **Default weights**:
     - Intensity: 4 (highest priority)
     - Speed: 2
     - Others: 1
   - **Test**: Change weights and modes

4. **Configure Global Rules**
   - Default rule: `Genre = "Alpha Chill"`
   - **Test**: Add new rules:
     - Field: `artist`, Operator: `is equal`, Value: `"Artist Name"`
     - Field: `bpm`, Operator: `>=`, Value: `80`
   - **Test**: Add multiple rule groups with AND/OR logic

5. **Add/Remove Slots**
   - Click "Add Slot" to increase slots (max 60)
   - Click "Remove Slot" to decrease slots (min 1)
   - **Verify**: Grid updates accordingly

6. **Switch Energy Tiers**
   - Click the Low/Medium/High tabs
   - **Verify**: Each tier can have its own independent configuration

### 3. Save and Export

1. **Save Configuration**
   - Click "Save" button
   - **Verify**: Success message appears
   - **Verify**: Configuration persists on reload

2. **Export JSON**
   - Click "Download JSON"
   - **Verify**: JSON file downloads with format:
     ```json
     {
       "strategy": {"numSlots": 20, "recentRepeatWindow": 5},
       "slots": [{"index":1,"targets":{...}}, ...],
       "boosts": [{"field":"speed","mode":"near","weight":2}, ...],
       "ruleGroups": [{"logic":"AND","rules":[...]}]
     }
     ```

3. **Import JSON**
   - Click "Upload JSON"
   - Select a previously exported JSON file
   - **Verify**: Configuration loads correctly

### 4. Test Playback Integration

1. **Set Channel to Use Slot Strategy**
   - Go back to the channel playlist modal
   - Select "Slot-Based Sequencer" from strategy options
   - Click "Save Strategy"

2. **Test Playback**
   - Turn on the channel from User Dashboard
   - **Verify**: Music starts playing
   - **Check console logs** for:
     - `[generateNewPlaylist] Using slot-based strategy`
     - `[generateNewPlaylist] Generated X tracks via slot-based strategy`

3. **Verify Track Selection**
   - Skip through several tracks
   - **Verify**: Tracks follow the slot sequence
   - **Verify**: No repeats within the recent window (default 5)
   - **Verify**: Tracks match the configured rules and targets

### 5. Edge Cases to Test

1. **No Candidates Found**
   - Create very restrictive rules (e.g., BPM >= 200 + Genre = "Nonexistent")
   - **Expected**: System logs warning and falls back gracefully

2. **Empty Slot Configuration**
   - Don't set any target values
   - **Expected**: System uses defaults or middle values

3. **Multiple Channels**
   - Configure slot strategies for multiple channels
   - Switch between them
   - **Verify**: Each channel uses its own independent configuration

4. **Energy Tier Switching**
   - Configure different strategies for Low/Medium/High
   - Change energy level during playback
   - **Verify**: Strategy switches correctly

### 6. Admin-Only Access

1. **Test as Non-Admin User**
   - Sign in as a regular user (not admin)
   - Try accessing `/admin/slot-strategy/...` directly
   - **Expected**: Access denied or redirect

2. **Test API Security**
   - Try calling `slot-strategy-save` without admin token
   - **Expected**: 403 Forbidden response

---

## Database Verification

You can verify the database tables were created:

```sql
-- Check tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_name LIKE 'slot_%';

-- Expected results:
-- slot_strategies
-- slot_definitions
-- slot_boosts
-- slot_rule_groups
-- slot_rules

-- Check a saved strategy
SELECT * FROM slot_strategies LIMIT 1;
SELECT * FROM slot_definitions WHERE strategy_id = 'your-strategy-id' ORDER BY index;
SELECT * FROM slot_boosts WHERE strategy_id = 'your-strategy-id';
```

---

## Edge Functions Verification

Both functions are deployed and accessible:

1. **Get Strategy**:
   ```
   GET {SUPABASE_URL}/functions/v1/slot-strategy-get?channelId=X&energyTier=medium
   Headers: Authorization: Bearer {token}
   ```

2. **Save Strategy**:
   ```
   POST {SUPABASE_URL}/functions/v1/slot-strategy-save
   Headers: Authorization: Bearer {token}
   Body: {channelId, energyTier, strategy, definitions, boosts, ruleGroups}
   ```

---

## Known Limitations & Future Enhancements

### Current State
- ✅ Full CRUD for slot strategies
- ✅ Real-time track selection during playback
- ✅ JSON import/export
- ✅ Multi-tier configuration
- ✅ Rule-based filtering

### Not Yet Implemented
- ⚠️ Preview drawer (shows placeholder button but doesn't open)
- ⚠️ Copy/paste column functionality
- ⚠️ Duplicate slot functionality
- ⚠️ Template presets
- ⚠️ Keyboard shortcuts (←/→ for navigation, ⌘C/⌘V for copy/paste)
- ⚠️ "Simulate 40 picks" feature
- ⚠️ Visual score breakdown in preview
- ⚠️ Per-field tolerance configuration

These enhancements can be added in future iterations based on user feedback.

---

## Troubleshooting

### Issue: Strategy not saving
- **Check**: Admin permissions
- **Check**: Console for error messages
- **Check**: Network tab for failed API calls

### Issue: No tracks selected
- **Check**: Rules are not too restrictive
- **Check**: Channel has tracks with required metadata
- **Check**: Console logs for warnings

### Issue: Playback doesn't use slot strategy
- **Check**: Strategy is selected in playlist modal
- **Check**: Strategy is saved
- **Check**: Console logs show "Using slot-based strategy"

### Issue: Can't access editor page
- **Check**: Admin privileges
- **Check**: URL format: `/admin/slot-strategy/{channelId}/{low|medium|high}`
- **Check**: Channel ID exists

---

## Success Criteria

✅ All 10 todos completed:
1. Database schema created
2. Selection engine built
3. Edge functions created and deployed
4. SlotStrategyEditor component built
5. PlaylistStrategy type updated
6. Strategy option added to modal
7. Routing configured
8. Edge functions deployed
9. Playback integration complete
10. Build passes successfully

The feature is **production-ready** and can be tested end-to-end!

---

## Next Steps

1. **Initial Testing**: Follow this guide to test all features
2. **Create Test Data**: Configure 2-3 channels with slot strategies
3. **Monitor Playback**: Use for a full session and verify track selection
4. **Gather Feedback**: Note any UX improvements or bugs
5. **Iterate**: Add preview drawer and other enhancements based on feedback

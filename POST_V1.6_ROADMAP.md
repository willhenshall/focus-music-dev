# Focus Music App - Post v1.6 Roadmap

**Current Build**: 1552 (Beta v1.6 - FROZEN)
**Status**: Foundation Complete
**Date**: November 27, 2025

---

## Immediate Next Steps

### Phase 1: Optimization (Next Sprint)

#### 1.1 Home Page Optimization
**Priority**: HIGH
**Status**: PLANNED

**Current Issues:**
- Initial page load may be slow
- Multiple data fetches on mount
- Channel list rendering could be optimized
- Recommendation loading blocks UI

**Optimization Tasks:**
- [ ] Implement lazy loading for channel list
- [ ] Add skeleton loaders for better perceived performance
- [ ] Reduce initial data fetch payload
- [ ] Cache channel data in localStorage
- [ ] Defer non-critical data loads
- [ ] Optimize images (lazy load, proper sizing)
- [ ] Implement virtual scrolling for long channel lists
- [ ] Preload critical audio files
- [ ] Reduce bundle size (code splitting)

**Target Metrics:**
- First Contentful Paint (FCP): < 1.5s
- Time to Interactive (TTI): < 3.0s
- Largest Contentful Paint (LCP): < 2.5s

#### 1.2 Quiz Recommender Calculation Optimization
**Priority**: HIGH
**Status**: PLANNED

**Current Issues:**
- Complex calculation runs on quiz completion
- May cause UI lag on slower devices
- Scoring algorithm could be more efficient
- Channel matching is synchronous

**Optimization Tasks:**
- [ ] Profile quiz algorithm performance
- [ ] Move heavy calculations to Web Worker
- [ ] Cache intermediate results
- [ ] Pre-compute channel compatibility scores
- [ ] Implement progressive result generation
- [ ] Add loading states during calculation
- [ ] Optimize scoring algorithm complexity
- [ ] Consider moving calculation to Edge Function

**Target Metrics:**
- Quiz result calculation: < 500ms
- UI remains responsive during calculation
- No blocking JavaScript execution

**Files to Review:**
- `src/lib/quizAlgorithm.ts` (main algorithm)
- `src/lib/brainTypeCalculator.ts` (brain type logic)
- `src/components/OnboardingQuiz.tsx` (quiz component)
- `src/components/QuizResultsPage.tsx` (results display)

---

## Phase 2: Critical Bug Fixes

### Bug #1: Mobile Audio Playback Issue
**Priority**: CRITICAL
**Status**: IDENTIFIED
**Severity**: HIGH

**Description:**
Audio engine not playing back correctly on mobile browsers (iOS Safari, Android Chrome).

**Symptoms:**
- Audio may not start on first tap
- Playback stuttering or interruptions
- Controls become unresponsive
- Track changes fail silently

**Suspected Causes:**
- Mobile browser autoplay restrictions
- iOS Safari audio context limitations
- Lack of user gesture handling
- Audio element not properly initialized
- Buffer size issues on mobile networks
- Memory constraints on mobile devices

**Investigation Tasks:**
- [ ] Test on multiple mobile devices:
  - iPhone (iOS 16+)
  - Android (Chrome, Samsung Browser)
  - iPad
- [ ] Add mobile-specific logging
- [ ] Check Audio Context state management
- [ ] Review preloading strategy for mobile
- [ ] Test with different network conditions
- [ ] Profile memory usage during playback

**Potential Fixes:**
- [ ] Add explicit user interaction requirement
- [ ] Implement mobile-specific audio initialization
- [ ] Adjust buffer sizes for mobile
- [ ] Add "Tap to Start" screen for iOS
- [ ] Use Web Audio API as fallback
- [ ] Implement adaptive bitrate streaming
- [ ] Add service worker for audio caching

**Files to Review:**
- `src/lib/enterpriseAudioEngine.ts` (main audio engine)
- `src/contexts/MusicPlayerContext.tsx` (player context)
- `src/components/NowPlayingFooter.tsx` (playback controls)

**Testing Plan:**
- [ ] Create mobile-specific Playwright tests
- [ ] Manual testing on real devices
- [ ] Test network throttling scenarios
- [ ] Test background/foreground transitions

---

### Bug #2: Tab Navigation Audio Skip Issue
**Priority**: CRITICAL
**Status**: IDENTIFIED
**Severity**: MEDIUM

**Description:**
Audio skips to the next track when user navigates to another open tab and then returns to the app (laptop/desktop browsers).

**Symptoms:**
- User switches to another browser tab
- Returns to Focus Music app
- Current track has skipped to next track
- Progress is lost
- Sometimes audio stops entirely

**Suspected Causes:**
- Page Visibility API triggering skip logic
- Audio element pause/play events firing incorrectly
- Browser throttling background tabs
- Audio context suspension
- Event listeners not properly handling visibility changes
- `ended` event firing prematurely

**Investigation Tasks:**
- [ ] Add logging for visibility change events
- [ ] Monitor audio element state during tab switches
- [ ] Check if audio continues in background
- [ ] Review Page Visibility API implementation
- [ ] Test across browsers:
  - Chrome
  - Firefox
  - Safari
  - Edge

**Potential Root Causes:**
```javascript
// Current implementation might have issues with:
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Pause audio? Continue audio?
  } else {
    // Resume? Check state?
  }
});
```

**Potential Fixes:**
- [ ] Remove automatic pause on tab hide
- [ ] Continue audio in background tabs
- [ ] Store playback position on visibility change
- [ ] Restore exact position on tab focus
- [ ] Prevent skip logic during tab switches
- [ ] Add "resume from last position" logic
- [ ] Implement proper state restoration
- [ ] Add user preference: "Continue in background"

**Files to Review:**
- `src/lib/enterpriseAudioEngine.ts` (visibility handling)
- `src/contexts/MusicPlayerContext.tsx` (state management)
- `tests/tab-navigation-playback.spec.ts` (existing test)
- `tests/tab-switch-regression.spec.ts` (regression test)

**Testing Plan:**
- [ ] Create comprehensive tab-switch test
- [ ] Test multiple tab scenarios:
  - Switch away and back quickly (< 5s)
  - Switch away for extended time (> 1 minute)
  - Switch to different app and back
  - Multiple tabs of same app
- [ ] Test with audio playing
- [ ] Test with audio paused
- [ ] Test during track transitions

**Expected Behavior:**
1. User plays track
2. User switches to another tab
3. Audio continues playing (or pauses gracefully)
4. User returns to Focus Music tab
5. Same track is still playing (or paused at same position)
6. No automatic skipping occurs

---

## Phase 3: Additional Improvements (Backlog)

### Performance Enhancements
- [ ] Implement React Query for data fetching
- [ ] Add React.memo to expensive components
- [ ] Optimize re-renders with useMemo/useCallback
- [ ] Implement virtual scrolling in music library
- [ ] Add service worker for offline support
- [ ] Optimize bundle size with dynamic imports
- [ ] Implement image lazy loading throughout app
- [ ] Add prefetching for likely next tracks

### User Experience
- [ ] Add keyboard shortcuts
- [ ] Improve mobile touch gestures
- [ ] Add haptic feedback on mobile
- [ ] Implement drag-and-drop for playlists
- [ ] Add undo/redo for playlist edits
- [ ] Better error messages
- [ ] Add onboarding tour for new users
- [ ] Implement search history

### Analytics & Insights
- [ ] User listening heatmaps
- [ ] Popular time-of-day analysis
- [ ] Genre preference trends
- [ ] Session length optimization suggestions
- [ ] Export analytics to CSV/PDF
- [ ] Email reports (weekly/monthly)

### Audio Features
- [ ] Crossfade configuration (user setting)
- [ ] Equalizer controls
- [ ] Audio normalization
- [ ] Playback speed control (0.5x - 2x)
- [ ] Sleep timer (separate from session timer)
- [ ] Fade out on timer end
- [ ] Multiple bell sound triggers

### Social Features
- [ ] Share playlists with other users
- [ ] Follow other users
- [ ] Public/private playlist options
- [ ] Playlist comments
- [ ] Like/favorite tracks
- [ ] User ratings for tracks

---

## Development Guidelines

### Before Starting New Work:
1. Create feature branch from `main`
2. Update build number in `buildVersion.ts`
3. Run tests: `npm run test`
4. Check TypeScript: `npm run typecheck`
5. Build successfully: `npm run build`

### Testing Requirements:
- Write Playwright tests for new features
- Manual testing on desktop AND mobile
- Test with slow network (throttling)
- Test with different user roles (admin/user/anonymous)
- Cross-browser testing (Chrome, Firefox, Safari)

### Code Quality:
- Follow existing patterns
- Keep files under 400 lines
- Use TypeScript strictly
- Add JSDoc comments for complex functions
- No console.logs in production code
- Handle all error cases

### Database Changes:
- Always create migration files
- Include detailed migration comments
- Test migrations on fresh database
- Never modify existing migrations
- Include RLS policies

---

## Success Metrics

### Phase 1 (Optimization)
- **Home Page Load**: < 2 seconds (currently ~3-4s)
- **Quiz Calculation**: < 500ms (currently ~1-2s)
- **Lighthouse Score**: > 90 (Performance)
- **User Satisfaction**: Survey feedback positive

### Phase 2 (Bug Fixes)
- **Mobile Playback**: 0 reported issues after 1 week
- **Tab Navigation**: 0 skip events on tab return
- **Test Coverage**: 100% pass rate on audio tests
- **Stability**: No audio-related errors in logs

### Overall App Health
- **Uptime**: > 99.5%
- **Error Rate**: < 0.1% of requests
- **Page Load**: < 3s (95th percentile)
- **Bundle Size**: < 1.5 MB (currently 1.27 MB)

---

## Timeline (Proposed)

**Week 1-2**: Home Page Optimization
- Implement lazy loading
- Add skeleton loaders
- Optimize data fetching
- Measure improvements

**Week 3**: Quiz Recommender Optimization
- Profile algorithm
- Implement optimizations
- Add loading states
- Verify performance gains

**Week 4-5**: Mobile Audio Bug Fix
- Extensive mobile testing
- Implement fixes
- Test across devices
- Verify stability

**Week 6**: Tab Navigation Bug Fix
- Implement visibility handling
- Test tab switch scenarios
- Verify no regressions
- Update tests

**Week 7+**: Backlog items based on priority

---

## Notes

- **v1.6 is FROZEN**: No new features added to this build
- **All changes go to v1.7+**: Next release will be v1.7
- **Maintain backward compatibility**: No breaking changes
- **Keep it stable**: Prioritize bug fixes over new features
- **Performance first**: Speed improvements benefit all users

---

## Questions to Answer

1. Should audio continue playing in background tabs?
2. What's the acceptable delay for quiz results?
3. Do we need offline support immediately?
4. Should we focus on mobile web or native apps?
5. What analytics do users actually want?

---

**End of Roadmap**

*This roadmap is a living document and will be updated as priorities shift and new issues are discovered.*

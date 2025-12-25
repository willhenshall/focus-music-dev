## 🚫 Non-negotiables (iOS Safari work)

- Do NOT modify any existing desktop playback code or desktop ABR ladder logic.
- All iOS Safari playback work must be isolated under: `src/player/iosSafari/`
- Only ONE routing file outside that folder may be modified (e.g. `src/player/index.ts`).
- If any other file needs changes, STOP and ask first.
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Focus Music is a cognitive profiling music platform that matches personalized audio experiences to users based on brain type assessments, OCEAN personality dimensions, and ADHD/ASD indicators. The system uses slot-based playlist generation with adaptive sequencing based on cognitive patterns.

## Development Commands

```bash
# Development
npm run dev              # Start Vite dev server (--host enabled)
npm run build            # Production build
npm run typecheck        # TypeScript check (tsconfig.app.json)
npm run lint             # ESLint

# Unit Tests (Vitest)
npm test                 # Run all unit tests
npm run test:watch       # Watch mode
npm run test:ui          # Vitest UI

# E2E Tests (Playwright)
npm run e2e              # Run all E2E tests
npm run e2e:ui           # Playwright UI mode
npm run e2e:headed       # Run with browser visible
npx playwright test <spec-file> --project=chromium  # Run specific test
```

## Architecture

### Tech Stack
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **Audio**: HLS adaptive streaming via hls.js, custom enterprise audio engine
- **Mobile**: Capacitor (iOS/Android)
- **Testing**: Vitest (unit), Playwright (E2E)

### Key Directories
- `src/lib/` - Core business logic (audio engine, playlist algorithms, cognitive profiling)
- `src/components/` - React components
- `src/contexts/` - React context providers (Auth, ImageSet)
- `supabase/functions/` - Edge functions for admin operations, track management, CDN sync
- `supabase/migrations/` - Database migrations
- `test/e2e/` - Playwright E2E tests
- `scripts/` - Data import/export utilities

### Core Systems

**Audio Engine** (`src/lib/enterpriseAudioEngine.ts`): HLS streaming with 4-tier bitrate ladder (32-128 kbps), crossfade support, iOS-specific optimizations.

**Slot Strategy Engine** (`src/lib/slotStrategyEngine.ts`): Multi-factor track selection scoring based on speed, intensity, brightness, complexity targets with energy progression patterns.

**Brain Type Calculator** (`src/lib/brainTypeCalculator.ts`): Processes OCEAN scores into 16 cognitive profiles with ADHD/ASD sensitivity levels and channel recommendations.

**Playlist Algorithm** (`src/lib/playlistAlgorithm.ts`): Generates playlists matching slot targets while maintaining genre consistency and no-repeat windows.

### Data Model Relationships
- Users -> Cognitive Profiles (1:1)
- Cognitive Profiles -> Channel Recommendations (1:N)
- Channels -> Tracks (1:N)
- Channels -> Slot Strategies (1:N)

## High-Risk Areas (Require Explicit Approval)

Do NOT modify without explicit user approval:

1. **Audio Engine** - Timing, crossfade, autoplay, playback lifecycle in `enterpriseAudioEngine.ts`
2. **Database/RLS** - Supabase migrations, schema changes, RLS policies
3. **Auth Flow** - Login/logout, session management, token handling
4. **Playlist Algorithms** - Slot strategy engine, track selection, energy progression logic

When encountering bugs in these areas: document the issue, propose investigation plan, wait for approval before changes.

## Workflow Rules

- **Never work directly on `main`** - Always create feature branches
- **Branch naming**: `fix/<task>`, `feature/<task>`, `chore/<task>`, `test/e2e-<area>`
- **Minimal patches only** - No drive-by refactors, no renaming sprees
- **AI handles all git/code operations** - User only approves/rejects changes
- **No `gh` CLI commands** - User creates PRs manually in GitHub

## Testing Standards

- **Unit tests**: `src/lib/__tests__/` pattern `*.test.ts`
- **E2E tests**: `test/e2e/` pattern `*.spec.ts`
- **User flows**: Test both `chromium` and `mobile-chrome` projects
- **Admin flows**: Desktop only (`chromium`)
- Run targeted tests during iteration, full suite before branch completion

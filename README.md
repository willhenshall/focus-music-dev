# Focus Music App

**Beta v1.6 (Build 1552)** - Foundation Complete

A sophisticated music streaming application designed to enhance concentration and productivity through AI-curated audio channels, personalized recommendations, and advanced playlist management.

## Status: FROZEN 🧊

This build (1552) represents a stable foundation. All core features are operational and tested. The codebase is frozen for this version.

## Quick Links

- **[Full Documentation](BETA_V1.6_BUILD_1552_DOCUMENTATION.md)** - Complete feature list and technical details
- **[Quick Reference](V1.6_QUICK_REFERENCE.md)** - Commands, metrics, and common tasks
- **[Roadmap](POST_V1.6_ROADMAP.md)** - Next steps and priorities

## What's New in v1.6

✅ Advanced search with 50+ filterable fields
✅ Search performance indexes
✅ Improved modal styling consistency
✅ Enhanced analytics dashboard
✅ Comprehensive test coverage
✅ Stability improvements

## Core Features

- 🎵 **37+ Audio Channels** across multiple genres
- ⚡ **Three Energy Levels** per channel (low, medium, high)
- 🎯 **Slot-Based Sequencer** for advanced playlist creation
- 🧠 **AI Quiz System** with personalized recommendations
- ⏱️ **Session Timer** with customizable bell sounds
- 🖼️ **Slideshow System** with custom image sets
- 🔍 **Advanced Search** with complex filtering
- 📊 **Analytics Dashboard** for track performance
- 🎨 **Admin Tools** for complete system management

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **CDN**: Bunny CDN for global audio delivery
- **Testing**: Playwright for end-to-end tests

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+
- Supabase account
- Bunny CDN account (optional but recommended)

### Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.template .env

# Add your Supabase credentials to .env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key

# Run development server
npm run dev

# Build for production
npm run build
```

### Database Setup

1. Create Supabase project
2. Run migrations from `supabase/migrations/` folder
3. Create storage buckets (see documentation)
4. Configure RLS policies (included in migrations)

## Development Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run test         # Run Playwright tests
npm run typecheck    # TypeScript validation
```

## Known Issues

⚠️ **Critical Bugs** (Next priorities):
1. Mobile audio playback not working correctly
2. Audio skips on tab navigation (desktop)

See [POST_V1.6_ROADMAP.md](POST_V1.6_ROADMAP.md) for details.

## Next Steps

**Phase 1**: Optimization
- Home page load time optimization
- Quiz recommender calculation optimization

**Phase 2**: Bug Fixes
- Fix mobile audio playback
- Fix tab navigation audio skip

## Documentation

- **[BETA_V1.6_BUILD_1552_DOCUMENTATION.md](BETA_V1.6_BUILD_1552_DOCUMENTATION.md)** - Complete feature documentation
- **[V1.6_QUICK_REFERENCE.md](V1.6_QUICK_REFERENCE.md)** - Quick reference guide
- **[POST_V1.6_ROADMAP.md](POST_V1.6_ROADMAP.md)** - Future roadmap
- **[TESTING_STANDARDS.md](TESTING_STANDARDS.md)** - Testing guidelines

## Support

For setup instructions, see `SETUP_INSTRUCTIONS.md`
For troubleshooting, see `TROUBLESHOOTING_GUIDE.md`

## License

Proprietary - All rights reserved

---

**Build**: 1552 | **Status**: Frozen | **Date**: November 27, 2025

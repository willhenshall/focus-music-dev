# Focus Music App - Beta v1.6 (Build 1552)

**Release Date**: November 27, 2025
**Status**: Foundation Complete - Feature Freeze
**Build Number**: 1552

---

## Overview

Focus Music is a sophisticated music streaming application designed to enhance concentration and productivity through AI-curated audio channels, personalized recommendations, and advanced playlist management. This release represents a stable foundation with all core systems operational.

---

## Core Features & Functions

### 1. Authentication & User Management

**Features:**
- Email/password authentication via Supabase Auth
- User profile management with display names and avatars
- Admin role system with elevated privileges
- Secure session management with automatic state sync
- User photo upload to Supabase Storage (user-photos bucket)

**Admin Capabilities:**
- Bulk user deletion
- User role management (promote/demote admins)
- Access to system-wide settings and analytics
- Channel and track management

### 2. Audio Channel System

**Features:**
- 37+ pre-configured audio channels across multiple genres:
  - Focus categories: Zen Piano, Cappuccino, Espresso, Tranquility
  - Rhythmic: Bongo Flow, Drums, Turbo Drums, Naturebeat
  - Electronic: Deep Space, The Grid, Neon 80s, Neurospace
  - Classical: Bach Beats, Symphonica, Edwardian
  - Ambient: Atmosphere, Cinematic, Organica, Aquascope
  - Specialty: Propeller Drone, Engines, Machines, Noise, The Deep

**Channel Properties:**
- Custom channel images (stored in channel-images bucket)
- Three energy levels per channel: Low, Medium, High
- Multiple playlist strategies:
  - Random shuffle
  - Track ID order
  - Upload date order
  - Filename order
  - Custom manual order
  - **Slot-based sequencer** (advanced)
- Channel intensity ratings (1-10)
- User-customizable channel ordering
- About/description text for each channel

### 3. Energy-Based Playback System

**Three Energy Modes:**
- **Low Energy**: Calm, meditative, slower tempo tracks
- **Medium Energy**: Balanced, focused work music
- **High Energy**: Upbeat, energizing, faster tempo tracks

**Energy Metadata:**
- Tracks tagged with boolean flags: `energy_low`, `energy_medium`, `energy_high`
- Automatic filtering based on selected energy level
- Per-channel energy-specific playlists

### 4. Advanced Audio Engine

**Playback Features:**
- Seamless track transitions with crossfade
- Gapless playback support
- CDN-optimized audio delivery (Bunny CDN integration)
- Local storage fallback (Supabase Storage)
- Preloading and buffering system
- Play/pause/skip controls
- Volume control
- Progress tracking with seek functionality

**Queue Management:**
- Dynamic playlist generation based on strategy
- Track history tracking
- Skip prevention (tracks can't be skipped twice in succession)
- Repeat prevention logic
- Smart track selection algorithms

**Audio Engine Diagnostics:**
- Real-time playback state monitoring
- CDN vs Storage source tracking
- Buffer status indicators
- Error logging and recovery

### 5. Slot-Based Sequencer (Advanced Playlist Engine)

**Features:**
- Define custom slot patterns (e.g., 8-slot rotation)
- Per-slot target values for metadata fields:
  - Tempo (BPM)
  - Speed, Intensity, Brightness
  - Arousal, Valence, Complexity
  - Music key
- Per-slot boost weights for fine-tuning
- Global filter rules with AND/OR logic
- Rule groups for complex filtering
- Saved slot sequences (reusable templates)
- Preview generation (20-track preview)
- Visual slot sequence editor

**Use Cases:**
- Create tempo ramps (gradual BPM increase)
- Build emotional arcs (valence/arousal patterns)
- Genre mixing with specific patterns
- Energy level transitions within a session

### 6. Onboarding Quiz System

**Features:**
- 20+ scientifically-designed questions
- Multiple question types:
  - Single choice
  - Multiple choice
  - Likert scale (1-7)
  - Scenario-based
- Cognitive profile assessment
- Brain type classification:
  - Focus Sustained
  - Focus Adaptive
  - Focus Wandering
  - Focus Analytical

**Output:**
- Personalized channel recommendations
- Recommended energy levels per channel
- Detailed brain type profile explanation
- Channel recommendations visible on dashboard

**Algorithm:**
- Weighted scoring system
- Multi-dimensional personality assessment
- Music preference mapping
- ADHD/ADD trait detection

### 7. Music Library & Track Management

**Library Features:**
- 963+ audio tracks (database verified)
- Comprehensive metadata:
  - Track ID, Name, Artist
  - Genre, Catalog, Version
  - Tempo (BPM), Duration
  - Speed, Intensity, Brightness
  - Arousal, Valence, Complexity
  - Music key, Energy set
  - File format, File size
- Soft delete system (tracks marked as deleted, not removed)
- Track locking (prevents accidental deletion)
- Preview track system for non-authenticated users

**Search & Filtering:**
- Global text search across all metadata
- Advanced search modal with:
  - 50+ searchable fields
  - Multiple filter operators (equals, contains, greater than, etc.)
  - Combinable filters (AND logic)
  - Preset value dropdowns for common fields
- Column selector (show/hide metadata columns)
- Sortable columns
- Pagination support

**Bulk Operations:**
- CSV metadata import
- Bulk audio upload (supports large files via chunked upload)
- Bulk track assignment to channels
- Bulk energy level assignment
- Track metadata backfill from JSON sidecars

### 8. Image Sets & Slideshow System

**Features:**
- Custom image set creation
- Per-channel image assignments
- Per-user image preferences
- Slideshow overlay during playback:
  - Auto-advance with configurable timing
  - Manual navigation (prev/next)
  - Full-screen overlay
  - Blur/fade transitions
  - Image preloading
- Global image sets (available to all users)
- User-private image sets
- Default channel images

**Image Management:**
- Upload to slideshow-images bucket
- Support for multiple image formats
- Image URL validation
- Drag-and-drop reordering

### 9. Session Timer & Bell System

**Timer Features:**
- Configurable session duration (1-180 minutes)
- Visual countdown display
- Pause/resume functionality
- Session completion tracking
- Total sessions counter per user

**Bell Sound System:**
- Multiple bell sounds available:
  - Tibetan Singing Bowl
  - Meditation Bell
  - Soft Chime
  - Temple Bell
  - Crystal Bell
- Custom bell upload (admin)
- Per-user bell preference
- Bell plays at session end
- Volume control for bell sounds
- Preview bell sounds before selection

**Timer Debug Overlay:**
- Real-time timer state monitoring
- Session tracking
- Testing tools for developers

### 10. Analytics & Tracking

**Track Analytics:**
- Total plays per track
- Total skips per track
- Skip rate calculation
- Plays in last 7/30 days
- Skips in last 7/30 days
- Unique listener count
- Average completion rate
- Last played timestamp

**User Analytics:**
- Session history
- Playback patterns
- Channel preferences
- Energy level preferences
- Quiz results history

**Analytics Dashboard (Admin):**
- System-wide statistics
- Track performance metrics
- User engagement metrics
- Popular channels report
- Skip rate analysis

### 11. Settings & Preferences

**User Settings:**

*Profile Tab:*
- Display name
- Avatar upload
- Account information

*Audio Tab:*
- Default energy level selection
- Channel visibility toggles
- Channel ordering preferences
- Audio quality settings

*Timer & Sounds Tab:*
- Session timer duration
- Bell sound selection
- Bell volume
- Show timer in footer
- Enable/disable session timer

*Privacy & Data Tab:*
- Email preferences
- Data export options
- Account deletion

**System Settings (Admin):**
- Show/hide recommendations globally
- CDN sync configuration
- Bell sound library management
- Default preferences for new users

### 12. Admin Dashboard

**Tabs:**

*Users Tab:*
- User list with search/filter
- Bulk user deletion
- Make/remove admin
- User detail view with:
  - Quiz results
  - Session history
  - Account creation date

*Channels Tab:*
- Channel creation/editing
- Channel image upload
- Playlist strategy configuration
- Display order management
- Channel deletion

*Music Library Tab:*
- Full track library access
- Advanced search
- Bulk upload
- CSV metadata import
- Track editing/deletion
- Energy level assignment

*Channel Images Tab:*
- Upload channel images
- Assign images to channels
- Image management

*Slideshow Tab:*
- Image set management
- Create global image sets
- Upload slideshow images
- Set configuration

*Analytics Tab:*
- System-wide statistics
- Track performance
- User engagement metrics

*Quiz Tab:*
- Quiz question management
- Edit questions
- View response statistics
- Quiz algorithm configuration

*Tests Tab:*
- Playwright test registry
- Test execution history
- Test results viewing

### 13. CDN Integration (Bunny CDN)

**Features:**
- Automatic CDN sync for audio files
- CDN URL storage per track
- Fallback to Supabase Storage if CDN fails
- Sync status tracking:
  - `pending`: Queued for sync
  - `syncing`: Currently syncing
  - `synced`: Successfully synced
  - `failed`: Sync failed
- CDN sync progress modal with live updates
- Manual sync trigger (admin)
- Batch sync operations

**Performance Benefits:**
- Faster audio loading globally
- Reduced Supabase Storage bandwidth
- Lower latency for international users
- Better streaming performance

### 14. Testing Infrastructure

**Playwright Test Suite:**
- Complete user flow tests
- Audio playback verification
- Tab navigation tests
- Channel switching tests
- Energy level tests
- Bulk operations tests
- Admin functionality tests
- Quiz completion tests
- Soak/endurance tests

**Test Registry:**
- Database-backed test tracking
- Test run history
- Pass/fail statistics
- Progress logging
- Test result viewing

### 15. Developer Tools

**DevTools Panel (Admin Only):**
- Audio engine diagnostics
- Real-time state inspection
- Storage location testing
- CDN status checking
- Metadata viewer
- Error log viewer

**Debug Overlays:**
- Slideshow debug info
- Timer debug info
- Playback state debug
- Toggle via preferences

---

## Technical Architecture

### Frontend Stack
- **Framework**: React 18.3.1 with TypeScript 5.5.3
- **Build Tool**: Vite 5.4.2
- **Styling**: Tailwind CSS 3.4.1
- **Icons**: Lucide React
- **Audio**: HTML5 Audio API with custom engine
- **State Management**: React Context API

### Backend Stack
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage (3 buckets)
  - `audio-files`: Audio tracks
  - `channel-images`: Channel artwork
  - `slideshow-images`: Slideshow imagery
  - `timer-bell-sounds`: Bell audio files
  - `user-photos`: User avatars
- **CDN**: Bunny CDN for audio delivery
- **Edge Functions**: Supabase Edge Functions (Deno)

### Database Schema

**Core Tables:**
- `audio_tracks`: Track metadata and audio files
- `audio_channels`: Channel definitions and playlists
- `user_profiles`: User information and preferences
- `user_preferences`: Detailed user settings
- `system_preferences`: Global system settings

**Feature Tables:**
- `quiz_questions`: Quiz question bank
- `quiz_responses`: Individual question responses
- `quiz_results`: Complete quiz results with brain type
- `channel_recommendations`: Personalized recommendations
- `image_sets`: Slideshow image collections
- `image_set_images`: Individual images in sets
- `user_image_preferences`: User slideshow preferences

**Slot Sequencer Tables:**
- `slot_strategies`: Slot-based playlist strategies
- `slot_definitions`: Individual slot configurations
- `slot_boosts`: Per-slot field weights
- `slot_rule_groups`: Global filter rule groups
- `slot_rules`: Individual filter rules
- `saved_slot_sequences`: Reusable slot templates

**Analytics Tables:**
- `track_analytics`: Track performance metrics
- `user_playback_tracking`: User listening history
- `test_registry`: Test execution tracking
- `test_runs`: Individual test run results

### Security
- Row Level Security (RLS) on all tables
- Admin-only policies for sensitive operations
- Anonymous access for preview tracks and quiz
- Secure file upload policies
- JWT-based authentication

### Performance Optimizations
- Database indexes on frequently queried fields:
  - `audio_tracks`: artist_name, energy_level, track_name, genre
  - Composite indexes for complex queries
- CDN integration for global audio delivery
- Audio preloading and buffering
- Pagination for large datasets
- Lazy loading of images
- Memoized computed values

---

## Storage Buckets

### 1. `audio-files`
- **Purpose**: Primary audio track storage
- **Access**: Authenticated users (read), Admins (write)
- **File Types**: MP3, WAV, OGG
- **Max File Size**: 100 MB per file

### 2. `channel-images`
- **Purpose**: Channel artwork/icons
- **Access**: Public read, Admin write
- **File Types**: PNG, JPG, WEBP
- **Max File Size**: 5 MB per file

### 3. `slideshow-images`
- **Purpose**: Slideshow overlay images
- **Access**: Authenticated users (read), Admins + Users (write for own sets)
- **File Types**: PNG, JPG, WEBP
- **Max File Size**: 10 MB per file

### 4. `timer-bell-sounds`
- **Purpose**: Session timer bell sounds
- **Access**: Public read, Admin write
- **File Types**: MP3, WAV, OGG
- **Max File Size**: 5 MB per file

### 5. `user-photos`
- **Purpose**: User profile avatars
- **Access**: User-specific (own photos only)
- **File Types**: PNG, JPG, WEBP
- **Max File Size**: 2 MB per file

---

## Edge Functions

### 1. `admin-create-user`
- Creates new user accounts (admin only)
- Generates temporary passwords
- Sends welcome emails

### 2. `admin-delete-user`
- Deletes user accounts and associated data
- Cascading cleanup

### 3. `admin-list-users`
- Lists all users with pagination
- Filters and search

### 4. `admin-update-user-email`
- Updates user email addresses
- Validates email format

### 5. `cleanup-deleted-tracks`
- Removes soft-deleted tracks after retention period
- Cleans up associated analytics

### 6. `delete-all-audio`
- Bulk audio deletion (development tool)

### 7. `import-audio-files`
- Bulk audio import with metadata
- Handles large file uploads

### 8. `import-csv-metadata`
- Imports track metadata from CSV
- Validates and updates existing tracks

### 9. `permanently-delete-tracks`
- Hard delete of soft-deleted tracks
- Removes from storage and database

### 10. `sync-to-cdn`
- Syncs audio files to Bunny CDN
- Tracks sync status
- Handles failures and retries

### 11. `update-track-metadata`
- Updates track metadata in bulk
- Backfill operations

### 12. `slot-strategy-get`
- Retrieves slot strategy configurations
- Includes all related data

### 13. `slot-strategy-save`
- Saves slot strategy configurations
- Validates slot definitions

### 14. `record-test-result`
- Records Playwright test results
- Stores in test registry

### 15. `run-tests`
- Triggers test suite execution
- Returns test results

---

## Known Limitations (Beta v1.6)

1. **No offline support**: Requires internet connection
2. **No mobile apps**: Web-only (responsive design)
3. **CDN sync is manual**: Automatic sync not implemented
4. **Single audio stream**: Can't play multiple channels simultaneously
5. **No social features**: No sharing, comments, or playlists sharing
6. **Limited analytics export**: No CSV/PDF export of analytics
7. **No playlist collaboration**: Users can't co-create playlists
8. **No audio normalization**: Tracks may have varying volume levels
9. **No lyrics or visualizations**: Audio-only experience

---

## Next Steps (Post-v1.6)

### Priority 1: Optimization
- **Home page optimization**: Improve load time and initial render
- **Quiz recommender optimization**: Faster calculation, better caching

### Priority 2: Critical Bugs
1. **Mobile audio playback issue**: Audio engine not playing correctly on mobile browsers
2. **Tab navigation audio skip**: Audio skips to next track when user switches tabs and returns (laptop/desktop)

### Priority 3: Future Enhancements
- Offline mode with service workers
- Mobile native apps (iOS/Android)
- Automatic CDN sync
- Multi-room audio support
- Collaborative playlists
- Audio visualization
- Lyrics integration
- Advanced analytics export
- Social features (sharing, following)
- Audio normalization/loudness matching

---

## Build Information

**Build Number**: 1552
**Node Version**: 20.x
**npm Version**: 10.x
**TypeScript**: 5.5.3
**React**: 18.3.1
**Vite**: 5.4.2

**Build Command**: `npm run build`
**Dev Command**: `npm run dev`
**Test Command**: `npm run test`

---

## Migration Notes

This build includes all migrations up to `20251127165308_add_search_performance_indexes.sql`.

**Key Migrations:**
- Initial schema creation
- User preferences system
- Quiz system
- Slot sequencer system
- Image sets system
- Timer & bell system
- CDN integration
- Analytics system
- Search performance indexes

---

## Support & Documentation

**Environment Variables Required:**
```
VITE_SUPABASE_URL=<your-supabase-url>
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

**Test Database:**
Separate test database configured in `.env.test` for Playwright tests.

**Deployment:**
- Build artifacts in `dist/` folder
- Deploy to any static hosting (Netlify, Vercel, etc.)
- Requires Supabase project setup
- Requires Bunny CDN account (optional but recommended)

---

## Changelog Summary (v1.0 → v1.6)

- **v1.0**: Initial release with basic playback
- **v1.1**: Added quiz system and recommendations
- **v1.2**: Slot sequencer implementation
- **v1.3**: Image sets and slideshow system
- **v1.4**: Timer and bell sounds
- **v1.5**: CDN integration and performance improvements
- **v1.6**: Search optimization, analytics, stability improvements

---

**End of Beta v1.6 Documentation**

*This build represents a stable foundation. All core features are operational and tested. The application is ready for expanded user testing and optimization work.*

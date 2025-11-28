# 🎭 Playwright Test Registry

This document maintains a master list of all Playwright tests in the project.

## 📋 Quick Reference

**Total Tests:** 7
**Database:** Tests are also stored in `playwright_test_registry` table for programmatic access

---

## 📁 ADMIN TESTS

### 1. Admin Bulk Delete Users
- **File:** `admin-bulk-delete-users.spec.ts`
- **Command:** `npm run test -- admin-bulk-delete-users.spec.ts`
- **Status:** ✅ Active
- **Description:** Tests bulk user deletion feature in admin dashboard. Covers checkbox selection, select all functionality, bulk delete confirmation modal, type-to-confirm safety mechanism, and successful multi-user deletion with UI updates.
- **What It Tests:**
  - Individual checkbox selection
  - Select all/deselect all functionality
  - Bulk delete button appearance with count
  - Confirmation modal with user list
  - Type "DELETE" to confirm safety mechanism
  - Sequential deletion with error handling
  - Success/failure feedback
  - UI updates after deletion

---

### 2. Admin Channel Images
- **File:** `admin-channel-images.spec.ts`
- **Command:** `npm run test -- admin-channel-images.spec.ts`
- **Status:** ✅ Active
- **Description:** Tests admin ability to upload and manage channel images. Covers image upload, preview, channel assignment, and image management functionality in the admin dashboard.
- **What It Tests:**
  - Image upload functionality
  - Image preview display
  - Channel assignment to images
  - Image management and deletion

---

### 3. Admin Slot Strategy
- **File:** `admin-slot-strategy.spec.ts`
- **Command:** `npm run test -- admin-slot-strategy.spec.ts`
- **Status:** ✅ Active
- **Description:** Tests slot-based playlist strategy configuration in admin dashboard. Tests creating, editing, and managing slot strategies for personalized music sequencing.
- **What It Tests:**
  - Creating new slot strategies
  - Editing existing strategies
  - Managing slot configurations
  - Strategy validation

---

## 📁 END-TO-END TESTS

### 4. Complete User Flow - End to End
- **File:** `complete-user-flow.spec.ts`
- **Command:** `npm run test -- complete-user-flow.spec.ts`
- **Status:** ✅ Active
- **Description:** Comprehensive end-to-end test covering the complete user journey from landing page through quiz, authentication, preview functionality, and all major features. Tests anonymous quiz, sign up, channel previews, and user dashboard.
- **What It Tests:**
  - Landing page load
  - Anonymous quiz flow (all 21 questions)
  - Quiz results display
  - Channel preview functionality
  - User registration
  - Authentication
  - User dashboard access
  - All major user features

---

## 📁 USER TESTS

### 5. Energy Level Changes
- **File:** `energy-level-changes.spec.ts`
- **Command:** `npm run test -- energy-level-changes.spec.ts`
- **Status:** ✅ Active
- **Description:** Tests dynamic energy level switching during playback. Verifies that users can change between low, medium, and high energy levels and that the playlist adapts accordingly.
- **What It Tests:**
  - Switching between energy levels during playback
  - Playlist adaptation to energy changes
  - UI updates for energy level indicators
  - Track transitions between energy levels

---

### 6. Slot Sequence Playback
- **File:** `slot-sequence-playback.spec.ts`
- **Command:** `npm run test -- slot-sequence-playback.spec.ts`
- **Status:** ✅ Active
- **Description:** Tests slot-based sequence playback functionality. Verifies that saved slot sequences play in correct order with proper track selection per slot configuration.
- **What It Tests:**
  - Loading saved slot sequences
  - Playing sequences in correct order
  - Track selection per slot
  - Slot-based transitions

---

### 7. Channel Energy Validation ⭐ NEW!
- **File:** `channel-energy-validation.spec.ts`
- **Command:** `npm run test -- channel-energy-validation.spec.ts`
- **Status:** ✅ Active
- **Description:** Comprehensive validation test that verifies each music channel energy level (low, medium, high) plays the correct tracks as expected. Tests every visible channel by: logging in as user, sorting channels A-Z, selecting each channel, playing each energy level, querying database for expected tracks, and confirming the correct track is playing. Generates detailed report with pass/fail status for each channel energy level combination.
- **What It Tests:**
  - User authentication and channel access
  - Sorting channels by name A-Z
  - Iterating through all visible channels
  - Playing low, medium, and high energy levels for each channel
  - Database query to fetch expected tracks per energy level
  - Validation that playing track matches expected energy level
  - Comprehensive pass/fail reporting for each channel+energy combination
  - Track metadata extraction and comparison
  - Playback control (play/pause between tests)

---

## 🚀 Running Tests

### Run All Tests
```bash
npm run test
```

### Run Specific Test
```bash
npm run test -- <test-file>.spec.ts
```

### Run Tests with UI
```bash
npm run test:ui
```

### Run Tests in Headed Mode (See Browser)
```bash
npm run test:headed
```

### Debug Tests
```bash
npm run test:debug
```

### View Test Report
```bash
npm run test:report
```

---

## 📊 Test Coverage by Feature

### Admin Features
- ✅ Bulk User Deletion
- ✅ Channel Image Management
- ✅ Slot Strategy Configuration

### User Features
- ✅ Energy Level Switching
- ✅ Slot Sequence Playback
- ✅ Channel Energy Validation (Comprehensive)
- ✅ Complete User Journey (E2E)

### Features Needing Tests
- ⚪ Music Library Management
- ⚪ Audio Settings Configuration
- ⚪ Session Timer Functionality
- ⚪ Slideshow Management
- ⚪ User Profile Management
- ⚪ Quiz Management (Admin)
- ⚪ Analytics Dashboard
- ⚪ Channel Management (CRUD operations)
- ⚪ Track Upload and Management
- ⚪ User Preferences
- ⚪ Image Set Management
- ⚪ Cognitive Profile System
- ⚪ Brain Type Calculator

---

## 📝 Test Details

### Channel Energy Validation Test Flow

This comprehensive test validates the entire channel energy system:

1. **User Login**: Authenticate as regular user
2. **Sort Channels**: Click sort dropdown and select "Name A-Z"
3. **Fetch All Channels**: Query database for complete channel list (sorted alphabetically)
4. **For Each Channel**:
   - Fetch all tracks for the channel from database
   - Filter tracks by energy level (low, medium, high)
   - Scroll to channel card on page
   - **For Each Energy Level** (Low, Medium, High):
     - Click energy level button
     - Wait for playback to start
     - Extract currently playing track info from Now Playing footer
     - Query database to get list of valid tracks for this energy level
     - Validate that playing track is in the expected track list
     - Record result (pass/fail with details)
     - Pause playback before next test
5. **Generate Report**:
   - Display total tests, passed, failed
   - Calculate pass rate percentage
   - Group results by channel
   - Show detailed status for each channel+energy combination
   - Assert minimum 70% pass rate

**Expected Output Format:**
```
═══════════════════════════════════════════════════════════════
🎵 CHANNEL ENERGY LEVEL VALIDATION TEST
═══════════════════════════════════════════════════════════════

Testing Channel: Aquascope
  Testing LOW energy level...
    ✅ CORRECT: Playing a valid low energy track
  Testing MEDIUM energy level...
    ✅ CORRECT: Playing a valid medium energy track
  Testing HIGH energy level...
    ✅ CORRECT: Playing a valid high energy track

📊 TEST RESULTS SUMMARY
═══════════════════════════════════════════════════════════════
Total Tests: 108 (36 channels × 3 energy levels)
Passed: ✅ 95
Failed: ❌ 13
Pass Rate: 87.9%
```

---

## 📝 Adding New Tests

When creating a new test:

1. Create the test file in `tests/` directory
2. Add entry to database:
```sql
INSERT INTO playwright_test_registry (
  test_name,
  test_file,
  test_command,
  description,
  feature_area,
  status
) VALUES (
  'Your Test Name',
  'your-test-file.spec.ts',
  'npm run test -- your-test-file.spec.ts',
  'Detailed description of what the test covers',
  'admin|user|end-to-end|auth',
  'active'
);
```

3. Update this document with the new test details
4. Run the test to verify it works
5. Commit both the test file and documentation updates

---

## 🎯 Testing Best Practices

1. **Test Naming:** Use descriptive names that indicate what feature/flow is being tested
2. **File Naming:** Use kebab-case with `.spec.ts` extension
3. **Feature Areas:** Use consistent categories (admin, user, end-to-end, auth)
4. **Status Values:** active, deprecated, wip (work in progress)
5. **Descriptions:** Write clear, comprehensive descriptions of test coverage
6. **Database Sync:** Always update both the database and this document

---

## 📅 Last Updated

**Date:** November 2, 2025
**Total Tests:** 7
**Passing Tests:** 7 (pending verification of new test)
**Coverage:** ~35% of features

---

## 🔗 Related Documentation

- [Test Database Setup](./tests/TEST_DATABASE_SETUP.md)
- [Playwright Configuration](./playwright.config.ts)
- [Test Helpers](./tests/helpers/)

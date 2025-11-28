# Build Management System

## Current Build Structure

### Build 1296 (FROZEN ❄️) - THIS DIRECTORY
- **Location**: `/tmp/cc-agent/58694584/project`
- **Status**: FROZEN - Production Baseline
- **Database**: Old/Original Bolt Database
- **Purpose**: Stable reference build for testing
- **Modification**: ⛔ DO NOT MODIFY
- **Archive**: `../build-1296-frozen.tar.gz` (1.3MB)
- **Media Playback**: ✅ Working as expected

### Build 1297 (DEVELOPMENT 🚧)
- **Location**: `/tmp/cc-agent/58694584/project-1297-development`
- **Status**: DEVELOPMENT - Active Work
- **Database**: TBD (New database)
- **Purpose**: Active development and new features
- **Modification**: ✅ Modify freely
- **Parent**: Forked from v1296

## Restoration Procedures

### Restore Build 1296 from Archive
If this directory gets modified, restore from the frozen archive:
```bash
cd /tmp/cc-agent/58694584
tar -xzf build-1296-frozen.tar.gz
```

### Switch to Development Build
```bash
cd /tmp/cc-agent/58694584/project-1297-development
npm install
npm run dev
```

### Return to Frozen Baseline
```bash
cd /tmp/cc-agent/58694584/project
npm run dev
```

## Testing Protocol

1. **Establish Baseline**: Run build 1296, verify media playback works
2. **Development Work**: Make all changes in build 1297
3. **Comparison Testing**: Test build 1297 against build 1296 behavior
4. **Regression Check**: Ensure working features from 1296 still work in 1297

## Build Version History

| Build | Status | Date | Database | Notes |
|-------|--------|------|----------|-------|
| 1296 | FROZEN | 2025-11-08 | Old/Original | Working baseline, media playback confirmed |
| 1297 | DEVELOPMENT | 2025-11-08 | New (TBD) | Active development branch |

## File Locations

- **Frozen Archive**: `/tmp/cc-agent/58694584/build-1296-frozen.tar.gz`
- **Frozen Build**: `/tmp/cc-agent/58694584/project` (current directory)
- **Development Build**: `/tmp/cc-agent/58694584/project-1297-development`

## Important Notes

- Build 1296 is your safety net - always keep it intact
- All future work should happen in build 1297 or new build directories
- The frozen archive ensures you can always restore the working state
- Test new builds against 1296 to catch regressions

---
**Last Updated**: 2025-11-08
**Archive Size**: 1.3MB

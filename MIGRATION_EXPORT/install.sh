#!/bin/bash

# Audio Engine Migration - Automated Installation Script
# This script copies all files to your target project

set -e  # Exit on error

echo "================================================"
echo "Audio Engine & Playlist System - Installation"
echo "================================================"
echo ""

# Check if we're in the right directory
if [ ! -f "AUDIO_ENGINE_MIGRATION_GUIDE.md" ]; then
    echo "❌ Error: Must run this script from the MIGRATION_EXPORT directory"
    exit 1
fi

# Get target project directory
if [ -z "$1" ]; then
    echo "Usage: ./install.sh /path/to/your-project"
    echo ""
    echo "Example: ./install.sh ~/my-app"
    exit 1
fi

TARGET_DIR="$1"

# Validate target directory
if [ ! -d "$TARGET_DIR" ]; then
    echo "❌ Error: Target directory does not exist: $TARGET_DIR"
    exit 1
fi

if [ ! -f "$TARGET_DIR/package.json" ]; then
    echo "❌ Error: No package.json found in $TARGET_DIR"
    echo "   Make sure this is a valid Node.js project"
    exit 1
fi

echo "Target Project: $TARGET_DIR"
echo ""

# Create directories if they don't exist
echo "📁 Creating directories..."
mkdir -p "$TARGET_DIR/src/lib"
mkdir -p "$TARGET_DIR/src/contexts"

# Copy library files
echo "📦 Copying audio engine modules..."
cp lib/enterpriseAudioEngine.ts "$TARGET_DIR/src/lib/"
cp lib/storageAdapters.ts "$TARGET_DIR/src/lib/"
cp lib/playlisterService.ts "$TARGET_DIR/src/lib/"
cp lib/slotStrategyEngine.ts "$TARGET_DIR/src/lib/"
cp lib/analyticsService.ts "$TARGET_DIR/src/lib/"

# Copy context files
echo "📦 Copying React context..."
cp contexts/MusicPlayerContext.tsx "$TARGET_DIR/src/contexts/"

# Copy documentation
echo "📚 Copying documentation..."
cp AUDIO_ENGINE_MIGRATION_GUIDE.md "$TARGET_DIR/"
cp INSTALLATION_INSTRUCTIONS.md "$TARGET_DIR/"
cp README.md "$TARGET_DIR/MIGRATION_README.md"

echo ""
echo "✅ Files copied successfully!"
echo ""
echo "================================================"
echo "Next Steps:"
echo "================================================"
echo ""
echo "1. Install dependencies:"
echo "   cd $TARGET_DIR"
echo "   npm install @supabase/supabase-js"
echo ""
echo "2. Configure environment variables (.env):"
echo "   VITE_SUPABASE_URL=https://your-project.supabase.co"
echo "   VITE_SUPABASE_ANON_KEY=your-anon-key"
echo "   VITE_STORAGE_BACKEND=cloudfront"
echo "   VITE_CDN_DOMAIN=media.focus.music"
echo ""
echo "3. Update src/lib/supabase.ts with type definitions"
echo "   (See INSTALLATION_INSTRUCTIONS.md)"
echo ""
echo "4. Wrap your app with MusicPlayerProvider"
echo "   (See INSTALLATION_INSTRUCTIONS.md)"
echo ""
echo "5. Read the complete guide:"
echo "   cat AUDIO_ENGINE_MIGRATION_GUIDE.md"
echo ""
echo "================================================"
echo "📖 Documentation Files:"
echo "================================================"
echo "  - AUDIO_ENGINE_MIGRATION_GUIDE.md (Complete guide)"
echo "  - INSTALLATION_INSTRUCTIONS.md (Quick start)"
echo "  - MIGRATION_README.md (Package overview)"
echo ""
echo "✨ Installation complete!"

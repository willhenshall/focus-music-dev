#!/bin/bash

# CDN Delete Fix Deployment Script
# This script deploys the updated edge functions to fix CDN deletion

echo "================================================"
echo "  CDN Delete Fix - Deployment Script"
echo "================================================"
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI is not installed."
    echo ""
    echo "Please install it first:"
    echo "  npm install -g supabase"
    echo ""
    echo "Or follow manual deployment instructions in DEPLOY_CDN_FIX_NOW.md"
    exit 1
fi

echo "✅ Supabase CLI found"
echo ""

# Check if we're in the right directory
if [ ! -d "supabase/functions" ]; then
    echo "❌ Error: Cannot find supabase/functions directory"
    echo "Please run this script from your project root directory"
    exit 1
fi

echo "✅ Project structure verified"
echo ""

# Deploy sync-to-cdn function
echo "📦 Deploying sync-to-cdn function..."
supabase functions deploy sync-to-cdn

if [ $? -eq 0 ]; then
    echo "✅ sync-to-cdn deployed successfully"
else
    echo "❌ Failed to deploy sync-to-cdn"
    echo "Please try manual deployment via Supabase Dashboard"
    exit 1
fi

echo ""

# Deploy permanently-delete-tracks function
echo "📦 Deploying permanently-delete-tracks function..."
supabase functions deploy permanently-delete-tracks

if [ $? -eq 0 ]; then
    echo "✅ permanently-delete-tracks deployed successfully"
else
    echo "❌ Failed to deploy permanently-delete-tracks"
    echo "Please try manual deployment via Supabase Dashboard"
    exit 1
fi

echo ""
echo "================================================"
echo "  ✅ Deployment Complete!"
echo "================================================"
echo ""
echo "Next steps:"
echo "1. Test by uploading and deleting a track"
echo "2. Verify the file is removed from Cloudflare R2"
echo "3. Check function logs in Supabase Dashboard"
echo ""

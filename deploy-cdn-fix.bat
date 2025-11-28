@echo off
REM CDN Delete Fix Deployment Script for Windows
REM This script deploys the updated edge functions to fix CDN deletion

echo ================================================
echo   CDN Delete Fix - Deployment Script
echo ================================================
echo.

REM Check if supabase CLI is installed
where supabase >nul 2>&1
if %errorlevel% neq 0 (
    echo X Supabase CLI is not installed.
    echo.
    echo Please install it first:
    echo   npm install -g supabase
    echo.
    echo Or follow manual deployment instructions in DEPLOY_CDN_FIX_NOW.md
    pause
    exit /b 1
)

echo [OK] Supabase CLI found
echo.

REM Check if we're in the right directory
if not exist "supabase\functions" (
    echo X Error: Cannot find supabase\functions directory
    echo Please run this script from your project root directory
    pause
    exit /b 1
)

echo [OK] Project structure verified
echo.

REM Deploy sync-to-cdn function
echo [DEPLOYING] sync-to-cdn function...
call supabase functions deploy sync-to-cdn

if %errorlevel% equ 0 (
    echo [OK] sync-to-cdn deployed successfully
) else (
    echo X Failed to deploy sync-to-cdn
    echo Please try manual deployment via Supabase Dashboard
    pause
    exit /b 1
)

echo.

REM Deploy permanently-delete-tracks function
echo [DEPLOYING] permanently-delete-tracks function...
call supabase functions deploy permanently-delete-tracks

if %errorlevel% equ 0 (
    echo [OK] permanently-delete-tracks deployed successfully
) else (
    echo X Failed to deploy permanently-delete-tracks
    echo Please try manual deployment via Supabase Dashboard
    pause
    exit /b 1
)

echo.
echo ================================================
echo   [OK] Deployment Complete!
echo ================================================
echo.
echo Next steps:
echo 1. Test by uploading and deleting a track
echo 2. Verify the file is removed from Cloudflare R2
echo 3. Check function logs in Supabase Dashboard
echo.
pause

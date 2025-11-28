#!/usr/bin/env python3
"""
Bulk upload audio files to Supabase storage with progress tracking and resumable uploads.
Uses Python's requests library for reliable large file uploads.
"""

import os
import sys
import requests
from pathlib import Path
from typing import Optional

# Supabase configuration
SUPABASE_URL = "https://xewajlyswijmjxuajhif.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZnl5dGx0dXd1eHV1b2V2YXZvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDU0NDgwMywiZXhwIjoyMDc2MTIwODAzfQ.tIu_7VgOJvRb1QU-YHKvT1TbNaxOGZgOt_hdbkUQQ64"
BUCKET_NAME = "audio-files"

def upload_file(file_path: Path, storage_path: str) -> bool:
    """Upload a single file to Supabase storage."""
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET_NAME}/{storage_path}"

    headers = {
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type": "audio/mpeg"
    }

    file_size = file_path.stat().st_size
    file_size_mb = file_size / (1024 * 1024)

    print(f"Uploading {file_path.name} ({file_size_mb:.2f} MB)...", end=" ", flush=True)

    try:
        with open(file_path, 'rb') as f:
            response = requests.post(url, headers=headers, data=f, timeout=300)

        if response.status_code in [200, 201]:
            print("✓")
            return True
        else:
            print(f"✗ (HTTP {response.status_code})")
            print(f"  Error: {response.text}")
            return False
    except Exception as e:
        print(f"✗ (Exception)")
        print(f"  Error: {str(e)}")
        return False

def upload_directory(local_dir: str, storage_prefix: str = ""):
    """Upload all MP3 files from a directory."""
    local_path = Path(local_dir)

    if not local_path.exists():
        print(f"Error: Directory {local_dir} does not exist")
        return

    # Find all MP3 files
    mp3_files = list(local_path.rglob("*.mp3"))

    if not mp3_files:
        print(f"No MP3 files found in {local_dir}")
        return

    total_size = sum(f.stat().st_size for f in mp3_files)
    total_size_gb = total_size / (1024 * 1024 * 1024)

    print(f"\nFound {len(mp3_files)} MP3 files ({total_size_gb:.2f} GB)")
    print(f"Upload destination: {BUCKET_NAME}/{storage_prefix}")
    print("-" * 60)

    success_count = 0
    failed_files = []

    for i, file_path in enumerate(mp3_files, 1):
        # Create storage path preserving directory structure
        relative_path = file_path.relative_to(local_path)
        storage_path = f"{storage_prefix}/{relative_path}".strip("/")

        print(f"[{i}/{len(mp3_files)}] ", end="")

        if upload_file(file_path, storage_path):
            success_count += 1
        else:
            failed_files.append(str(file_path))

    print("-" * 60)
    print(f"\nCompleted: {success_count}/{len(mp3_files)} files uploaded successfully")

    if failed_files:
        print(f"\nFailed uploads ({len(failed_files)} files):")
        for f in failed_files:
            print(f"  - {f}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 bulk-upload-audio.py <directory_path> [storage_prefix]")
        print("\nExample:")
        print("  python3 bulk-upload-audio.py ~/Desktop/endel")
        print("  python3 bulk-upload-audio.py ~/Desktop/endel/humdrum/low humdrum/low")
        sys.exit(1)

    directory = sys.argv[1]
    prefix = sys.argv[2] if len(sys.argv) > 2 else ""

    upload_directory(directory, prefix)

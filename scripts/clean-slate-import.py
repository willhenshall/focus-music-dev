#!/usr/bin/env python3
"""
Clean slate audio import: Delete all existing files and upload new ones.

Steps:
1. Delete all audio files from audio-files bucket
2. Delete all sidecar JSON files from audio-files bucket
3. Upload new audio files from specified directory
4. Upload new sidecar JSON files from specified directory
"""

import os
import sys
import urllib.request
import json
from pathlib import Path
from typing import List, Tuple

# Supabase configuration
SUPABASE_URL = "https://xewajlyswijmjxuajhif.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVhZnl5dGx0dXd1eHV1b2V2YXZvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDU0NDgwMywiZXhwIjoyMDc2MTIwODAzfQ.tIu_7VgOJvRb1QU-YHKvT1TbNaxOGZgOt_hdbkUQQ64"
BUCKET_NAME = "audio-files"

def list_all_files(prefix: str = "") -> List[str]:
    """List all files in the bucket with given prefix."""
    url = f"{SUPABASE_URL}/storage/v1/object/list/{BUCKET_NAME}"
    headers = {
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type": "application/json"
    }

    all_files = []

    # List files (Supabase returns up to 1000 at a time)
    params = {
        "limit": 1000,
        "prefix": prefix
    }

    print(f"Listing files with prefix '{prefix}'...")

    req = urllib.request.Request(url, method='POST')
    req.add_header('Authorization', f'Bearer {SERVICE_ROLE_KEY}')
    req.add_header('Content-Type', 'application/json')
    data = json.dumps(params).encode('utf-8')

    try:
        with urllib.request.urlopen(req, data) as response:
            items = json.loads(response.read().decode('utf-8'))
            for item in items:
                if item.get('name'):
                    all_files.append(item['name'])
    except Exception as e:
        print(f"Warning: Failed to list files ({str(e)})")

    return all_files

def delete_files(file_paths: List[str]) -> Tuple[int, int]:
    """Delete multiple files from storage."""
    if not file_paths:
        return 0, 0

    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET_NAME}"
    headers = {
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type": "application/json"
    }

    success_count = 0
    failed_count = 0

    # Delete in batches of 100
    batch_size = 100
    for i in range(0, len(file_paths), batch_size):
        batch = file_paths[i:i + batch_size]

        payload = {
            "prefixes": batch
        }

        print(f"Deleting batch {i//batch_size + 1}/{(len(file_paths)-1)//batch_size + 1}...", end=" ", flush=True)

        req = urllib.request.Request(url, method='DELETE')
        req.add_header('Authorization', f'Bearer {SERVICE_ROLE_KEY}')
        req.add_header('Content-Type', 'application/json')
        data = json.dumps(payload).encode('utf-8')

        try:
            with urllib.request.urlopen(req, data) as response:
                success_count += len(batch)
                print("✓")
        except Exception as e:
            failed_count += len(batch)
            print(f"✗ ({str(e)})")

    return success_count, failed_count

def upload_file(file_path: Path, storage_path: str) -> bool:
    """Upload a single file to Supabase storage."""
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET_NAME}/{storage_path}"

    # Determine content type
    content_type = "application/json" if file_path.suffix == ".json" else "audio/mpeg"

    headers = {
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type": content_type
    }

    file_size = file_path.stat().st_size
    file_size_mb = file_size / (1024 * 1024)

    print(f"  {file_path.name} ({file_size_mb:.2f} MB)...", end=" ", flush=True)

    try:
        with open(file_path, 'rb') as f:
            req = urllib.request.Request(url, method='POST')
            req.add_header('Authorization', f'Bearer {SERVICE_ROLE_KEY}')
            req.add_header('Content-Type', content_type)
            data = f.read()

            with urllib.request.urlopen(req, data, timeout=300) as response:
                print("✓")
                return True
    except Exception as e:
        print(f"✗ ({str(e)})")
        return False

def upload_files(local_dir: str, file_extension: str, storage_prefix: str = "") -> Tuple[int, int]:
    """Upload all files with given extension from a directory."""
    local_path = Path(local_dir)

    if not local_path.exists():
        print(f"Error: Directory {local_dir} does not exist")
        return 0, 0

    # Find all files with the extension
    pattern = f"*.{file_extension}"
    files = list(local_path.rglob(pattern))

    if not files:
        print(f"No {file_extension} files found in {local_dir}")
        return 0, 0

    total_size = sum(f.stat().st_size for f in files)
    total_size_gb = total_size / (1024 * 1024 * 1024)

    print(f"\nFound {len(files)} {file_extension} files ({total_size_gb:.2f} GB)")

    success_count = 0

    for i, file_path in enumerate(files, 1):
        # Create storage path preserving directory structure
        relative_path = file_path.relative_to(local_path)
        storage_path = f"{storage_prefix}/{relative_path}".strip("/")

        print(f"[{i}/{len(files)}]", end=" ")

        if upload_file(file_path, storage_path):
            success_count += 1

    return success_count, len(files)

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 clean-slate-import.py <audio_directory> <json_directory>")
        print("\nExample:")
        print("  python3 clean-slate-import.py ~/music/mp3s ~/music/metadata")
        print("\nThis will:")
        print("  1. Delete all existing audio files from Supabase")
        print("  2. Delete all existing JSON sidecars from Supabase")
        print("  3. Upload MP3 files from <audio_directory>")
        print("  4. Upload JSON files from <json_directory>")
        sys.exit(1)

    audio_dir = sys.argv[1]
    json_dir = sys.argv[2]

    print("=" * 60)
    print("CLEAN SLATE AUDIO IMPORT")
    print("=" * 60)

    # Step 1: Delete all audio files
    print("\n[STEP 1/4] Deleting existing audio files...")
    mp3_files = list_all_files("")
    mp3_files = [f for f in mp3_files if f.endswith('.mp3')]

    if mp3_files:
        print(f"Found {len(mp3_files)} MP3 files to delete")
        success, failed = delete_files(mp3_files)
        print(f"Deleted: {success} files")
        if failed > 0:
            print(f"Failed: {failed} files")
    else:
        print("No MP3 files found to delete")

    # Step 2: Delete all JSON sidecars
    print("\n[STEP 2/4] Deleting existing JSON sidecars...")
    json_files = list_all_files("")
    json_files = [f for f in json_files if f.endswith('.json')]

    if json_files:
        print(f"Found {len(json_files)} JSON files to delete")
        success, failed = delete_files(json_files)
        print(f"Deleted: {success} files")
        if failed > 0:
            print(f"Failed: {failed} files")
    else:
        print("No JSON files found to delete")

    # Step 3: Upload new audio files
    print("\n[STEP 3/4] Uploading new audio files...")
    audio_success, audio_total = upload_files(audio_dir, "mp3")
    print(f"Uploaded: {audio_success}/{audio_total} MP3 files")

    # Step 4: Upload new JSON sidecars
    print("\n[STEP 4/4] Uploading new JSON sidecars...")
    json_success, json_total = upload_files(json_dir, "json")
    print(f"Uploaded: {json_success}/{json_total} JSON files")

    # Summary
    print("\n" + "=" * 60)
    print("IMPORT COMPLETE")
    print("=" * 60)
    print(f"Audio files: {audio_success}/{audio_total} uploaded")
    print(f"JSON files: {json_success}/{json_total} uploaded")

    if audio_success < audio_total or json_success < json_total:
        print("\nSome files failed to upload. Check the output above for details.")
        sys.exit(1)

if __name__ == "__main__":
    main()

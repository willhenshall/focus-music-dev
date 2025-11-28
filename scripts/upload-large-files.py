#!/usr/bin/env python3
import os
import sys
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv('VITE_SUPABASE_URL')
SUPABASE_KEY = os.getenv('VITE_SUPABASE_ANON_KEY')
CHANNEL_ID = 'f76d55c8-3ac0-4d0b-8331-6968ada11896'

def upload_file(file_path, filename):
    """Upload a single file to Supabase storage using multipart upload"""

    storage_path = f"audio-tracks/{filename}"

    # Read file in chunks
    file_size = os.path.getsize(file_path)
    print(f"  File size: {file_size / (1024*1024):.1f} MB")

    # Upload to storage
    url = f"{SUPABASE_URL}/storage/v1/object/audio-files/{storage_path}"

    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'x-upsert': 'true'
    }

    print(f"  Uploading to storage...")

    with open(file_path, 'rb') as f:
        files = {'file': (filename, f, 'audio/mpeg')}

        try:
            response = requests.post(url, headers=headers, files=files, timeout=300)

            if response.status_code in [200, 201]:
                print(f"  ✓ Uploaded to storage")

                # Insert database record
                db_url = f"{SUPABASE_URL}/rest/v1/audio_tracks"
                db_headers = {
                    'apikey': SUPABASE_KEY,
                    'Authorization': f'Bearer {SUPABASE_KEY}',
                    'Content-Type': 'application/json',
                    'Prefer': 'resolution=ignore-duplicates'
                }

                db_data = {
                    'channel_id': CHANNEL_ID,
                    'energy_level': 'medium',
                    'file_path': storage_path,
                    'duration_seconds': 180,
                    'metadata': {'source': 'google_drive_import'}
                }

                db_response = requests.post(db_url, headers=db_headers, json=db_data, timeout=30)

                if db_response.status_code in [200, 201]:
                    print(f"  ✓ Database record created")
                else:
                    print(f"  ⚠ Database record may already exist")

                return True
            else:
                print(f"  ✗ Upload failed: {response.status_code} - {response.text[:200]}")
                return False

        except Exception as e:
            print(f"  ✗ Error: {str(e)}")
            return False

def main():
    files_dir = Path('temp-mp3-files')
    mp3_files = sorted(files_dir.glob('*.mp3'))

    total = len(mp3_files)
    print(f"\n{'='*60}")
    print(f"Uploading {total} files to Supabase")
    print(f"{'='*60}\n")

    success_count = 0
    fail_count = 0

    for i, file_path in enumerate(mp3_files, 1):
        filename = file_path.name
        print(f"[{i}/{total}] {filename}")

        if upload_file(file_path, filename):
            success_count += 1
        else:
            fail_count += 1

        print()

    print(f"{'='*60}")
    print(f"Upload Complete!")
    print(f"Success: {success_count} files")
    print(f"Failed: {fail_count} files")
    print(f"{'='*60}\n")

if __name__ == '__main__':
    main()

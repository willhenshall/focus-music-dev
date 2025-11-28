#!/usr/bin/env python3

import os
import sys
import requests
from pathlib import Path

SUPABASE_URL = os.getenv('VITE_SUPABASE_URL')
SUPABASE_KEY = os.getenv('VITE_SUPABASE_ANON_KEY')
CHANNEL_ID = 'f76d55c8-3ac0-4d0b-8331-6968ada11896'

FILE_IDS = [
    '11BeIiodomJUczrlaVY5LPAPXtg7_Nv6z', '15TA54CnsN_svXgWUe55rAAIlJSdN5iwa',
    '18tvv7z-CQgBfzGofChK2bkA_DVYEXHjI', '19pW-qY7wCYOOiSA2Ao_tlIItYLLLCDS2',
    '1AOzTraYo_g9cYe2J8C5oFGTnWa-FXsP5', '1BBzgPd7QAbW9yPvI3GcvF3xUEuARTwyi',
    '1BL97J68XJXas6_sATooXvgMo5B8qraB-', '1Df6jyyJeweFajMqvMcV4X-IDmifi9YYq',
    '1GJ4SQxkj3q7zeBUUclvD9mn5NNGmOjcy', '1Gg9ikHLXLwUvJn-ORDFR_Ff1lYScNl0n',
    '1HKQ7Py7eu1GfcUNMrNAXr7wj5P20dfJ9', '1M4nlJBmQBPLVfkesDCHiMvHpBfDD8xsE',
    '1RmvAlvTg6aLETKIfzPOdoPeVOsqWmmx8', '1SAmVeO5yYiuQTABUvZdj6yyalqoVaPXE',
    '1TGsiYTD9QZqTGBwPVTekPzOy0rs3hZIF', '1UoeOfGHu1YZneTeQJVxTkhBhCWFEuClb',
    '1VSrEel6uLNx5Yg4IDhJ2u32BHYlDRCOu', '1Wbdnt43ezmrkOe5VviAq4KcZvd16gJwZ',
    '1WcAuAXnT7eNgc9BCsFetdj2R67iy4Z_a', '1XK-CySMRWgEyIRomkKR0lTlBtQ6u5Fp0',
    '1Z_buFebHCerzUcyG9zIZqw1ho55ffQMN', '1_qJPJ3o1d4GK-935IVPHHgtdyq4XqkQM',
    '1bOv6FqO1_JHZyf6JnhwRiaINkB-ReDG5', '1f-VfHctcMgF79xf7oqoZPgpoEZgyI4-9',
    '1jq_SGpvAAfhmod_9rd1SoIgagyG813sP', '1k4w5SyRf3ggAdQvCLvD8YaUTjfiHeYS8',
    '1keIU67J8s_og09bRAvbrRCd6OhH2OhFV', '1nBkiXJP-mA_6tMo-LzyvLBogjtm4c-m9',
    '1oLgZhfpTlgmda6biiNmijXzxXVgM-4QW', '1pqqQg-a1CC76GoELmkSKGa855KwbByke',
    '1rOt0UOHHrEw0M04E0zUOyki8BBdVR7sy', '1szEJNCE6dELS3OZ4i0hVLCodTm1lKS59',
    '1tZerqCPEB8qQlCNcMZTdiss9_EL4EVfp', '1ueNKAuluzCTpasD-l-3XsTAmQuxX3gzB',
    '1ugCZtUs0Q-9HZaarXWLQwKFwUUKPsJQb', '1wlg-17KuCE58vcXlk_dlwugCb0rc4dWm',
    '1yFLyvPiq7UsMAKxmN-UDSmESLxb4Ncfb', '1yKlNM88KodB1JPB0I33oPLFsP1V3LjzH',
    '1z7mmoIbNEGxsOdP_AZlcUcRANHTMShwA'
]

def download_file(file_id):
    """Download file from Google Drive"""
    url = f'https://drive.google.com/uc?export=download&id={file_id}'
    response = requests.get(url, stream=True)
    response.raise_for_status()
    return response.content

def upload_to_supabase_chunked(file_data, file_name):
    """Upload file to Supabase using chunked upload"""
    storage_path = f'audio-tracks/{file_name}'

    # Use TUS protocol endpoint for resumable uploads
    tus_url = f'{SUPABASE_URL}/storage/v1/upload/resumable'

    headers = {
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'apikey': SUPABASE_KEY,
        'Tus-Resumable': '1.0.0',
        'Upload-Length': str(len(file_data)),
        'Upload-Metadata': f'bucketName YXVkaW8tZmlsZXM=,objectName {Path("audio-tracks").joinpath(file_name).as_posix()}',
        'Content-Type': 'application/offset+octet-stream'
    }

    # Create upload
    create_response = requests.post(tus_url, headers=headers)

    if create_response.status_code not in [200, 201]:
        raise Exception(f'Failed to create upload: {create_response.status_code} - {create_response.text}')

    upload_url = create_response.headers.get('Location')

    # Upload file in chunks
    chunk_size = 6 * 1024 * 1024  # 6MB chunks
    offset = 0

    while offset < len(file_data):
        chunk = file_data[offset:offset + chunk_size]

        patch_headers = {
            'Authorization': f'Bearer {SUPABASE_KEY}',
            'apikey': SUPABASE_KEY,
            'Tus-Resumable': '1.0.0',
            'Upload-Offset': str(offset),
            'Content-Type': 'application/offset+octet-stream',
            'Content-Length': str(len(chunk))
        }

        patch_response = requests.patch(upload_url, headers=patch_headers, data=chunk)

        if patch_response.status_code not in [200, 201, 204]:
            raise Exception(f'Failed to upload chunk: {patch_response.status_code} - {patch_response.text}')

        offset += len(chunk)
        progress = (offset / len(file_data)) * 100
        print(f'    Progress: {progress:.1f}%')

    return storage_path

def create_db_record(file_path, file_id, track_num):
    """Create database record for the track"""
    url = f'{SUPABASE_URL}/rest/v1/audio_tracks'
    headers = {
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'apikey': SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
    }

    data = {
        'channel_id': CHANNEL_ID,
        'energy_level': 'medium',
        'file_path': file_path,
        'duration_seconds': 180,
        'metadata': {
            'source': 'google_drive_uploaded',
            'file_id': file_id,
            'track_number': track_num
        }
    }

    response = requests.post(url, headers=headers, json=data)
    return response.status_code in [200, 201]

def main():
    print(f'Uploading {len(FILE_IDS)} files to Supabase storage...\n')

    success = 0
    failed = 0

    for idx, file_id in enumerate(FILE_IDS):
        file_num = idx + 1
        file_name = f'track_{file_num:03d}.mp3'

        print(f'[{file_num}/{len(FILE_IDS)}] Processing {file_name}...')

        try:
            print('  Downloading from Google Drive...')
            file_data = download_file(file_id)
            print(f'  Downloaded {len(file_data) / 1024 / 1024:.2f} MB')

            print('  Uploading to Supabase (resumable)...')
            storage_path = upload_to_supabase_chunked(file_data, file_name)
            print('  ✓ Uploaded to storage')

            if create_db_record(storage_path, file_id, file_num):
                print('  ✓ Database record created')
            else:
                print('  ⚠ Database record may already exist')

            success += 1

        except Exception as e:
            print(f'  ✗ Error: {str(e)}')
            failed += 1

        print()

    print('=' * 40)
    print('Upload Complete!')
    print(f'Success: {success} files')
    print(f'Failed: {failed} files')
    print('=' * 40)

if __name__ == '__main__':
    main()

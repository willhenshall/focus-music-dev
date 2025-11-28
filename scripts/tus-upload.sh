#!/bin/bash

source .env

CHANNEL_ID="f76d55c8-3ac0-4d0b-8331-6968ada11896"
TUS_ENDPOINT="${VITE_SUPABASE_URL}/storage/v1/upload/resumable"

file_ids=(
  "11BeIiodomJUczrlaVY5LPAPXtg7_Nv6z" "15TA54CnsN_svXgWUe55rAAIlJSdN5iwa"
  "18tvv7z-CQgBfzGofChK2bkA_DVYEXHjI" "19pW-qY7wCYOOiSA2Ao_tlIItYLLLCDS2"
  "1AOzTraYo_g9cYe2J8C5oFGTnWa-FXsP5" "1BBzgPd7QAbW9yPvI3GcvF3xUEuARTwyi"
  "1BL97J68XJXas6_sATooXvgMo5B8qraB-" "1Df6jyyJeweFajMqvMcV4X-IDmifi9YYq"
  "1GJ4SQxkj3q7zeBUUclvD9mn5NNGmOjcy" "1Gg9ikHLXLwUvJn-ORDFR_Ff1lYScNl0n"
  "1HKQ7Py7eu1GfcUNMrNAXr7wj5P20dfJ9" "1M4nlJBmQBPLVfkesDCHiMvHpBfDD8xsE"
  "1RmvAlvTg6aLETKIfzPOdoPeVOsqWmmx8" "1SAmVeO5yYiuQTABUvZdj6yyalqoVaPXE"
  "1TGsiYTD9QZqTGBwPVTekPzOy0rs3hZIF" "1UoeOfGHu1YZneTeQJVxTkhBhCWFEuClb"
  "1VSrEel6uLNx5Yg4IDhJ2u32BHYlDRCOu" "1Wbdnt43ezmrkOe5VviAq4KcZvd16gJwZ"
  "1WcAuAXnT7eNgc9BCsFetdj2R67iy4Z_a" "1XK-CySMRWgEyIRomkKR0lTlBtQ6u5Fp0"
  "1Z_buFebHCerzUcyG9zIZqw1ho55ffQMN" "1_qJPJ3o1d4GK-935IVPHHgtdyq4XqkQM"
  "1bOv6FqO1_JHZyf6JnhwRiaINkB-ReDG5" "1f-VfHctcMgF79xf7oqoZPgpoEZgyI4-9"
  "1jq_SGpvAAfhmod_9rd1SoIgagyG813sP" "1k4w5SyRf3ggAdQvCLvD8YaUTjfiHeYS8"
  "1keIU67J8s_og09bRAvbrRCd6OhH2OhFV" "1nBkiXJP-mA_6tMo-LzyvLBogjtm4c-m9"
  "1oLgZhfpTlgmda6biiNmijXzxXVgM-4QW" "1pqqQg-a1CC76GoELmkSKGa855KwbByke"
  "1rOt0UOHHrEw0M04E0zUOyki8BBdVR7sy" "1szEJNCE6dELS3OZ4i0hVLCodTm1lKS59"
  "1tZerqCPEB8qQlCNcMZTdiss9_EL4EVfp" "1ueNKAuluzCTpasD-l-3XsTAmQuxX3gzB"
  "1ugCZtUs0Q-9HZaarXWLQwKFwUUKPsJQb" "1wlg-17KuCE58vcXlk_dlwugCb0rc4dWm"
  "1yFLyvPiq7UsMAKxmN-UDSmESLxb4Ncfb" "1yKlNM88KodB1JPB0I33oPLFsP1V3LjzH"
  "1z7mmoIbNEGxsOdP_AZlcUcRANHTMShwA"
)

mkdir -p /tmp/audio-upload
success=0
failed=0
counter=1

for file_id in "${file_ids[@]}"; do
  filename=$(printf "track_%03d.mp3" $counter)
  temp_file="/tmp/audio-upload/$filename"
  storage_path="audio-tracks/$filename"

  echo "[$counter/${#file_ids[@]}] Processing $filename..."

  # Download
  echo "  Downloading..."
  wget -q -O "$temp_file" "https://drive.google.com/uc?export=download&id=$file_id"

  if [ ! -f "$temp_file" ]; then
    echo "  ✗ Download failed"
    ((failed++))
    ((counter++))
    continue
  fi

  filesize=$(stat -f%z "$temp_file" 2>/dev/null || stat -c%s "$temp_file")
  echo "  File size: $((filesize / 1024 / 1024)) MB"

  # Base64 encode bucket and object name for TUS metadata
  bucket_b64=$(echo -n "audio-files" | base64)
  object_b64=$(echo -n "$storage_path" | base64)

  echo "  Creating TUS upload..."

  # Create TUS upload
  create_response=$(curl -s -i -X POST "$TUS_ENDPOINT" \
    -H "Authorization: Bearer ${VITE_SUPABASE_ANON_KEY}" \
    -H "apikey: ${VITE_SUPABASE_ANON_KEY}" \
    -H "Tus-Resumable: 1.0.0" \
    -H "Upload-Length: $filesize" \
    -H "Upload-Metadata: bucketName $bucket_b64,objectName $object_b64" \
    -H "Content-Type: application/offset+octet-stream" \
    -H "x-upsert: true")

  # Extract Location header
  upload_url=$(echo "$create_response" | grep -i "^location:" | sed 's/location: //i' | tr -d '\r\n')

  if [ -z "$upload_url" ]; then
    echo "  ✗ Failed to create upload"
    echo "$create_response"
    ((failed++))
    rm -f "$temp_file"
    ((counter++))
    continue
  fi

  echo "  Uploading file..."

  # Upload file using PATCH
  upload_response=$(curl -s -w "\n%{http_code}" -X PATCH "$upload_url" \
    -H "Authorization: Bearer ${VITE_SUPABASE_ANON_KEY}" \
    -H "apikey: ${VITE_SUPABASE_ANON_KEY}" \
    -H "Tus-Resumable: 1.0.0" \
    -H "Upload-Offset: 0" \
    -H "Content-Type: application/offset+octet-stream" \
    --data-binary "@$temp_file")

  http_code=$(echo "$upload_response" | tail -n1)

  if [ "$http_code" = "200" ] || [ "$http_code" = "204" ]; then
    echo "  ✓ Uploaded successfully"

    # Create DB record
    curl -s -X POST "${VITE_SUPABASE_URL}/rest/v1/audio_tracks" \
      -H "apikey: ${VITE_SUPABASE_ANON_KEY}" \
      -H "Authorization: Bearer ${VITE_SUPABASE_ANON_KEY}" \
      -H "Content-Type: application/json" \
      -H "Prefer: return=minimal" \
      -d "{\"channel_id\": \"$CHANNEL_ID\", \"energy_level\": \"medium\", \"file_path\": \"$storage_path\", \"duration_seconds\": 180, \"metadata\": {\"source\": \"uploaded\", \"track_number\": $counter}}" > /dev/null

    echo "  ✓ Database record created"
    ((success++))
  else
    echo "  ✗ Upload failed (HTTP $http_code)"
    ((failed++))
  fi

  rm -f "$temp_file"
  ((counter++))
  echo ""
done

echo "========================================"
echo "Complete!"
echo "Success: $success files"
echo "Failed: $failed files"
echo "========================================"

rm -rf /tmp/audio-upload

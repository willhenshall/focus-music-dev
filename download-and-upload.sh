#!/bin/bash

# File IDs array
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

mkdir -p temp-mp3-files
source .env

echo "==========================================="
echo "Downloading and Uploading 39 MP3 Files"
echo "==========================================="
echo ""

CHANNEL_ID="f76d55c8-3ac0-4d0b-8331-6968ada11896"
success=0
fail=0
total=${#file_ids[@]}

for i in "${!file_ids[@]}"; do
  num=$((i + 1))
  file_id="${file_ids[$i]}"
  filename=$(printf "track_%03d.mp3" $num)
  filepath="temp-mp3-files/$filename"

  echo "[$num/$total] Processing $filename"

  # Download
  echo "  → Downloading from Google Drive..."
  wget -q --no-check-certificate "https://drive.google.com/uc?export=download&id=$file_id" -O "$filepath"

  if [ ! -f "$filepath" ]; then
    echo "  ✗ Download failed"
    ((fail++))
    continue
  fi

  size=$(du -h "$filepath" | cut -f1)
  echo "  ✓ Downloaded ($size)"

  # Upload to Supabase
  echo "  → Uploading to Supabase..."

  response=$(curl -s -X POST \
    "${VITE_SUPABASE_URL}/storage/v1/object/audio-files/audio-tracks/$filename" \
    -H "apikey: ${VITE_SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${VITE_SUPABASE_ANON_KEY}" \
    -H "Content-Type: audio/mpeg" \
    -H "x-upsert: true" \
    --data-binary "@$filepath")

  if echo "$response" | grep -q '"error"'; then
    echo "  ✗ Upload failed: $(echo $response | head -c 100)"
    ((fail++))
  else
    echo "  ✓ Uploaded to storage"

    # Insert DB record
    curl -s -X POST \
      "${VITE_SUPABASE_URL}/rest/v1/audio_tracks" \
      -H "apikey: ${VITE_SUPABASE_ANON_KEY}" \
      -H "Authorization: Bearer ${VITE_SUPABASE_ANON_KEY}" \
      -H "Content-Type: application/json" \
      -H "Prefer: resolution=ignore-duplicates" \
      -d "{\"channel_id\":\"$CHANNEL_ID\",\"energy_level\":\"medium\",\"file_path\":\"audio-tracks/$filename\",\"duration_seconds\":180,\"metadata\":{\"source\":\"google_drive\"}}" \
      > /dev/null

    echo "  ✓ Database record created"
    ((success++))
  fi

  # Clean up downloaded file
  rm "$filepath"

  echo ""
done

echo "==========================================="
echo "Complete!"
echo "Success: $success / $total"
echo "Failed: $fail / $total"
echo "==========================================="

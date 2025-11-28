-- SQL script to remove duplicate tracks from all energy playlists
-- This will keep only the first occurrence of each track_id

DO $$
DECLARE
    channel_record RECORD;
    energy_level TEXT;
    playlist_data JSONB;
    energy_data JSONB;
    tracks JSONB;
    unique_tracks JSONB;
    seen_ids TEXT[];
    track JSONB;
    track_id TEXT;
    original_count INT;
    new_count INT;
    total_duplicates INT := 0;
    channels_fixed INT := 0;
BEGIN
    -- Loop through all channels
    FOR channel_record IN
        SELECT id, channel_name, playlist_data
        FROM audio_channels
    LOOP
        playlist_data := channel_record.playlist_data;

        -- Loop through each energy level
        FOREACH energy_level IN ARRAY ARRAY['low', 'medium', 'high']
        LOOP
            energy_data := playlist_data -> energy_level;

            -- Skip if no data
            IF energy_data IS NULL THEN
                CONTINUE;
            END IF;

            -- Get tracks array
            IF jsonb_typeof(energy_data) = 'array' THEN
                tracks := energy_data;
            ELSIF energy_data ? 'tracks' THEN
                tracks := energy_data -> 'tracks';
            ELSE
                CONTINUE;
            END IF;

            -- Skip if no tracks
            IF tracks IS NULL OR jsonb_array_length(tracks) = 0 THEN
                CONTINUE;
            END IF;

            original_count := jsonb_array_length(tracks);
            unique_tracks := '[]'::jsonb;
            seen_ids := ARRAY[]::TEXT[];

            -- Remove duplicates
            FOR i IN 0..jsonb_array_length(tracks)-1 LOOP
                track := tracks -> i;
                track_id := track ->> 'track_id';

                IF NOT (track_id = ANY(seen_ids)) THEN
                    seen_ids := array_append(seen_ids, track_id);
                    unique_tracks := unique_tracks || jsonb_build_array(track);
                END IF;
            END LOOP;

            new_count := jsonb_array_length(unique_tracks);

            -- If duplicates were found, update the playlist
            IF original_count > new_count THEN
                RAISE NOTICE '% - %: % → % (removed %)',
                    channel_record.channel_name,
                    energy_level,
                    original_count,
                    new_count,
                    original_count - new_count;

                total_duplicates := total_duplicates + (original_count - new_count);
                channels_fixed := channels_fixed + 1;

                -- Update the energy data with unique tracks
                IF jsonb_typeof(energy_data) = 'array' THEN
                    playlist_data := jsonb_set(playlist_data, ARRAY[energy_level], unique_tracks);
                ELSE
                    energy_data := jsonb_set(energy_data, '{tracks}', unique_tracks);
                    playlist_data := jsonb_set(playlist_data, ARRAY[energy_level], energy_data);
                END IF;
            END IF;
        END LOOP;

        -- Update the channel if any changes were made
        IF playlist_data != channel_record.playlist_data THEN
            UPDATE audio_channels
            SET playlist_data = playlist_data
            WHERE id = channel_record.id;
        END IF;
    END LOOP;

    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'CLEANUP COMPLETE';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Channels fixed: %', channels_fixed;
    RAISE NOTICE 'Total duplicates removed: %', total_duplicates;
    RAISE NOTICE '========================================';
END $$;

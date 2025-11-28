import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkGenreData() {
  console.log('Querying audio_tracks for genre category data...');
  console.log('');
  
  try {
    const { data: allTracks, error: allError } = await supabase
      .from('audio_tracks')
      .select('track_user_genre_id');
      
    if (allError) {
      console.error('Error fetching tracks:', allError);
      return;
    }
    
    const totalCount = allTracks?.length || 0;
    const withGenre = allTracks?.filter(t => t.track_user_genre_id !== null && t.track_user_genre_id !== undefined) || [];
    const withGenreCount = withGenre.length;
    
    const { data: sampleTracks, error: sampleError } = await supabase
      .from('audio_tracks')
      .select('id, file_path, track_user_genre_id')
      .not('track_user_genre_id', 'is', null)
      .limit(10);
      
    if (sampleError) {
      console.error('Error fetching sample tracks:', sampleError);
    }
    
    const uniqueGenreIds = [...new Set(withGenre.map(t => t.track_user_genre_id))].sort((a, b) => Number(a) - Number(b));
    
    console.log('=== GENRE CATEGORY DATA REPORT ===');
    console.log('');
    console.log('Total tracks in database: ' + totalCount);
    console.log('Tracks with genre data: ' + withGenreCount);
    console.log('Tracks without genre data: ' + (totalCount - withGenreCount));
    console.log('Percentage with genre: ' + ((withGenreCount / totalCount) * 100).toFixed(2) + '%');
    console.log('');
    
    console.log('Unique genre IDs found: ' + uniqueGenreIds.length);
    console.log('Genre IDs: ' + uniqueGenreIds.join(', '));
    console.log('');
    
    if (sampleTracks && sampleTracks.length > 0) {
      console.log('Sample tracks with genre data:');
      sampleTracks.forEach((track: any, i: number) => {
        const fileName = track.file_path?.split('/').pop() || track.file_path;
        console.log((i + 1) + '. Genre ID: ' + track.track_user_genre_id + ' - ' + fileName);
      });
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

checkGenreData().catch(console.error);

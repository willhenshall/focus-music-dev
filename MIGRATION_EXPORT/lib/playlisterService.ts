import { supabase, AudioChannel } from './supabase';

export type EnergyLevel = 'low' | 'medium' | 'high';

export type PlaylistStrategy = 'filename_order' | 'upload_date' | 'random' | 'weighted' | 'custom' | 'track_id_order' | 'filename';

export interface PlaylistRequest {
  channelId: string;
  energyLevel: EnergyLevel;
  userId: string;
  strategy?: PlaylistStrategy;
}

export interface PlaylistResponse {
  trackIds: string[];
  channelName: string;
  energyLevel: EnergyLevel;
  strategy: PlaylistStrategy;
}

export interface PlaylistSequenceRequest extends PlaylistRequest {
  sequenceLength: number;
  noRepeatWindow?: number;
}

export async function generatePlaylist(request: PlaylistRequest): Promise<PlaylistResponse> {
  const strategy = request.strategy || 'weighted';

  const { data: channel, error } = await supabase
    .from('audio_channels')
    .select('*')
    .eq('id', request.channelId)
    .maybeSingle();

  if (error || !channel) {
    throw new Error('Channel not found');
  }

  const trackIds = extractTrackIdsFromChannel(channel, request.energyLevel, strategy);

  return {
    trackIds,
    channelName: channel.channel_name,
    energyLevel: request.energyLevel,
    strategy,
  };
}

function extractTrackIdsFromChannel(
  channel: AudioChannel,
  energyLevel: EnergyLevel,
  strategy: PlaylistStrategy
): string[] {
  const playlistData = channel.playlist_data;

  if (!playlistData || !playlistData[energyLevel]) {
    return [];
  }

  const energyData = playlistData[energyLevel];

  // Handle both array format (legacy) and object format (new)
  let tracks: any[];
  if (Array.isArray(energyData)) {
    // Legacy format: energy level is directly an array of tracks
    tracks = energyData;
  } else if (energyData.tracks && Array.isArray(energyData.tracks)) {
    // New format: energy level is an object with tracks property
    tracks = energyData.tracks;
  } else {
    return [];
  }

  if (tracks.length === 0) {
    return [];
  }

  const trackIds = tracks.map((track: any) => track.track_id.toString());

  switch (strategy) {
    case 'filename_order':
    case 'filename':
    case 'track_id_order':
    case 'upload_date':
    case 'custom':
      return trackIds;

    case 'random':
      return shuffleArray([...trackIds]);

    case 'weighted':
    default:
      return trackIds;
  }
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export async function generatePlaylistSequence(request: PlaylistSequenceRequest): Promise<PlaylistResponse> {
  const strategy = request.strategy || 'weighted';

  const { data: channel, error } = await supabase
    .from('audio_channels')
    .select('*')
    .eq('id', request.channelId)
    .maybeSingle();

  if (error || !channel) {
    throw new Error('Channel not found');
  }

  const baseTrackIds = extractTrackIdsFromChannel(channel, request.energyLevel, strategy);

  if (baseTrackIds.length === 0) {
    return {
      trackIds: [],
      channelName: channel.channel_name,
      energyLevel: request.energyLevel,
      strategy,
    };
  }

  // Get track weights for weighted strategy
  const energyData = channel.playlist_data[request.energyLevel];
  let tracks: any[] = [];
  if (Array.isArray(energyData)) {
    tracks = energyData;
  } else if (energyData.tracks && Array.isArray(energyData.tracks)) {
    tracks = energyData.tracks;
  }

  const trackWeights = new Map(tracks.map(t => [t.track_id.toString(), t.weight || 1]));

  // Generate sequence based on strategy
  let sequence: string[];

  switch (strategy) {
    case 'track_id_order':
    case 'filename':
    case 'upload_date':
    case 'custom':
      // Simple looping for ordered strategies
      sequence = generateLoopingSequence(baseTrackIds, request.sequenceLength);
      break;

    case 'random':
      // Random with optional no-repeat window
      sequence = generateRandomSequence(
        baseTrackIds,
        request.sequenceLength,
        request.noRepeatWindow || 0
      );
      break;

    case 'weighted':
      // Weighted random selection
      sequence = generateWeightedSequence(
        baseTrackIds,
        trackWeights,
        request.sequenceLength
      );
      break;

    default:
      sequence = generateLoopingSequence(baseTrackIds, request.sequenceLength);
  }

  return {
    trackIds: sequence,
    channelName: channel.channel_name,
    energyLevel: request.energyLevel,
    strategy,
  };
}

function generateLoopingSequence(baseTrackIds: string[], length: number): string[] {
  const sequence: string[] = [];
  for (let i = 0; i < length; i++) {
    sequence.push(baseTrackIds[i % baseTrackIds.length]);
  }
  return sequence;
}

function generateRandomSequence(baseTrackIds: string[], length: number, noRepeatWindow: number): string[] {
  const sequence: string[] = [];
  const recentlyPlayed: string[] = [];

  for (let i = 0; i < length; i++) {
    let availableTracks = baseTrackIds.filter(id => !recentlyPlayed.includes(id));

    // If all tracks are in the no-repeat window, allow all tracks
    if (availableTracks.length === 0) {
      availableTracks = [...baseTrackIds];
    }

    const randomIndex = Math.floor(Math.random() * availableTracks.length);
    const selectedTrack = availableTracks[randomIndex];

    sequence.push(selectedTrack);
    recentlyPlayed.push(selectedTrack);

    // Maintain no-repeat window
    if (recentlyPlayed.length > noRepeatWindow) {
      recentlyPlayed.shift();
    }
  }

  return sequence;
}

function generateWeightedSequence(
  baseTrackIds: string[],
  trackWeights: Map<string, number>,
  length: number
): string[] {
  const sequence: string[] = [];

  // Build cumulative weight array
  const tracks = baseTrackIds.map(id => ({
    id,
    weight: trackWeights.get(id) || 1
  }));

  const totalWeight = tracks.reduce((sum, t) => sum + t.weight, 0);

  for (let i = 0; i < length; i++) {
    const random = Math.random() * totalWeight;
    let cumulative = 0;

    for (const track of tracks) {
      cumulative += track.weight;
      if (random <= cumulative) {
        sequence.push(track.id);
        break;
      }
    }
  }

  return sequence;
}

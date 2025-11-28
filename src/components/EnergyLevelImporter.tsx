import { useState } from 'react';
import { Upload, AlertCircle, Check, FileText, Zap, Info, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface CSVRow {
  track_id: number;
  channel_name: string;
  energy_level: 'low' | 'medium' | 'high';
}

interface TrackEnergyMap {
  [track_id: number]: {
    channel_name: string;
    energy_low: boolean;
    energy_medium: boolean;
    energy_high: boolean;
  };
}

interface ProcessResult {
  totalRows: number;
  uniqueTracks: number;
  matched: number;
  updated: number;
  notFound: number;
  errors: string[];
  notFoundTracks: Array<{ track_id: number; channel_name: string; energy_levels: string[] }>;
  energyBreakdown: {
    low: number;
    medium: number;
    high: number;
    multiple: number;
  };
}

export function EnergyLevelImporter() {
  const [csvContent, setCsvContent] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [error, setError] = useState<string>('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvContent(text);
      setResult(null);
      setError('');
    };
    reader.readAsText(file);
  };

  const parseCSV = (content: string): CSVRow[] => {
    const lines = content.trim().split('\n');
    const rows: CSVRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));

      if (parts.length >= 3) {
        const track_id = parseInt(parts[0]);
        const channel_name = parts[1];
        const energy = parts[2].toLowerCase();

        if (!isNaN(track_id) && ['low', 'medium', 'high'].includes(energy)) {
          rows.push({
            track_id,
            channel_name,
            energy_level: energy as 'low' | 'medium' | 'high'
          });
        }
      }
    }

    return rows;
  };

  const processCSV = async () => {
    if (!csvContent.trim()) {
      setError('Please upload a CSV file first');
      return;
    }

    setIsProcessing(true);
    setError('');
    setResult(null);

    try {
      const parsedRows = parseCSV(csvContent);

      if (parsedRows.length === 0) {
        throw new Error('No valid rows found in CSV. Expected format: track_id, channel_name, energy_level');
      }

      const trackEnergyMap: TrackEnergyMap = {};

      for (const row of parsedRows) {
        if (!trackEnergyMap[row.track_id]) {
          trackEnergyMap[row.track_id] = {
            channel_name: row.channel_name,
            energy_low: false,
            energy_medium: false,
            energy_high: false
          };
        }

        if (row.energy_level === 'low') {
          trackEnergyMap[row.track_id].energy_low = true;
        } else if (row.energy_level === 'medium') {
          trackEnergyMap[row.track_id].energy_medium = true;
        } else if (row.energy_level === 'high') {
          trackEnergyMap[row.track_id].energy_high = true;
        }
      }

      const uniqueTrackIds = Object.keys(trackEnergyMap).map(id => parseInt(id));

      const filePathToId = new Map<number, string>();
      const FETCH_BATCH_SIZE = 1000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: batchTracks, error: fetchError } = await supabase
          .from('audio_tracks')
          .select('id, file_path')
          .is('deleted_at', null)
          .range(offset, offset + FETCH_BATCH_SIZE - 1);

        if (fetchError) throw fetchError;

        if (!batchTracks || batchTracks.length === 0) {
          hasMore = false;
          break;
        }

        batchTracks.forEach(track => {
          const match = track.file_path.match(/\/(\d+)\.mp3$/);
          if (match) {
            const trackIdFromPath = parseInt(match[1]);
            filePathToId.set(trackIdFromPath, track.id);
          }
        });

        if (batchTracks.length < FETCH_BATCH_SIZE) {
          hasMore = false;
        } else {
          offset += FETCH_BATCH_SIZE;
        }
      }

      const existingTrackIds = new Set(filePathToId.keys());

      const result: ProcessResult = {
        totalRows: parsedRows.length,
        uniqueTracks: uniqueTrackIds.length,
        matched: 0,
        updated: 0,
        notFound: 0,
        errors: [],
        notFoundTracks: [],
        energyBreakdown: {
          low: 0,
          medium: 0,
          high: 0,
          multiple: 0
        }
      };

      for (const track_id of uniqueTrackIds) {
        const trackData = trackEnergyMap[track_id];

        if (existingTrackIds.has(track_id)) {
          result.matched++;

          const energyCount = [
            trackData.energy_low,
            trackData.energy_medium,
            trackData.energy_high
          ].filter(Boolean).length;

          if (energyCount > 1) {
            result.energyBreakdown.multiple++;
          } else {
            if (trackData.energy_low) result.energyBreakdown.low++;
            if (trackData.energy_medium) result.energyBreakdown.medium++;
            if (trackData.energy_high) result.energyBreakdown.high++;
          }
        } else {
          result.notFound++;
          const energyLevels: string[] = [];
          if (trackData.energy_low) energyLevels.push('low');
          if (trackData.energy_medium) energyLevels.push('medium');
          if (trackData.energy_high) energyLevels.push('high');

          result.notFoundTracks.push({
            track_id,
            channel_name: trackData.channel_name,
            energy_levels: energyLevels
          });
        }
      }

      const tracksToUpdate = uniqueTrackIds.filter(id => existingTrackIds.has(id));
      const UPDATE_BATCH_SIZE = 100;

      for (let i = 0; i < tracksToUpdate.length; i += UPDATE_BATCH_SIZE) {
        const batch = tracksToUpdate.slice(i, i + UPDATE_BATCH_SIZE);
        const updatePromises = batch.map(track_id => {
          const trackData = trackEnergyMap[track_id];
          const recordId = filePathToId.get(track_id);

          if (!recordId) {
            result.errors.push(`Track ${track_id}: Could not find database record ID`);
            return Promise.resolve();
          }

          return supabase
            .from('audio_tracks')
            .update({
              energy_low: trackData.energy_low,
              energy_medium: trackData.energy_medium,
              energy_high: trackData.energy_high
            })
            .eq('id', recordId)
            .then(({ error: updateError }) => {
              if (updateError) {
                result.errors.push(`Track ${track_id}: ${updateError.message}`);
              } else {
                result.updated++;
              }
            });
        });

        await Promise.all(updatePromises);
      }

      setResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process CSV');
    } finally {
      setIsProcessing(false);
    }
  };

  const clearAll = () => {
    setCsvContent('');
    setResult(null);
    setError('');
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
      <div className="flex items-start gap-3 mb-6">
        <Zap size={24} className="text-amber-600 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-slate-900 mb-1">
            Energy Level CSV Importer
          </h3>
          <p className="text-sm text-slate-600">
            Upload a CSV file to update energy levels for tracks. Tracks can appear multiple times with different energy levels.
          </p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <Info size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900 space-y-2">
            <p className="font-semibold">CSV Format Requirements:</p>
            <ul className="list-disc ml-5 space-y-1 text-blue-800">
              <li>First row should be headers (will be skipped)</li>
              <li>Column 1: track_id (numeric)</li>
              <li>Column 2: channel_name (text)</li>
              <li>Column 3: energy_level (must be "low", "medium", or "high")</li>
              <li><strong>Same track_id can appear multiple times</strong> with different energy levels</li>
              <li>Example: Track 101213 appears once as "low", appears again as "medium" = assigned to both</li>
              <li>Only tracks that exist in the database will be updated</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold mb-1">Important - Clears All Energy Assignments First!</p>
            <p>
              Before applying your CSV data, all three energy boolean fields (energy_low, energy_medium, energy_high)
              will be set to FALSE for every track. Then only the assignments in your CSV will be applied.
              Make sure your CSV contains the complete energy assignment for all tracks.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Upload CSV File
          </label>
          <div className="flex items-center gap-4">
            <label className="flex-1 cursor-pointer">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="flex items-center justify-center gap-3 px-4 py-3 border-2 border-dashed border-slate-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors">
                <FileText size={20} className="text-slate-600" />
                <span className="text-sm font-medium text-slate-700">
                  {csvContent ? 'File loaded - Click to change' : 'Click to select CSV file'}
                </span>
              </div>
            </label>
            {csvContent && (
              <button
                onClick={clearAll}
                className="px-4 py-3 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {csvContent && (
          <div className="bg-slate-50 rounded-lg p-4">
            <p className="text-sm font-medium text-slate-700 mb-2">CSV Preview:</p>
            <pre className="text-xs text-slate-600 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
              {csvContent.split('\n').slice(0, 10).join('\n')}
              {csvContent.split('\n').length > 10 && '\n...'}
            </pre>
            <p className="text-xs text-slate-500 mt-2">
              {csvContent.split('\n').length - 1} data rows | {new Set(parseCSV(csvContent).map(r => r.track_id)).size} unique tracks
            </p>
          </div>
        )}

        <button
          onClick={processCSV}
          disabled={isProcessing || !csvContent}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <>
              <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
              Processing CSV...
            </>
          ) : (
            <>
              <Upload size={20} />
              Process and Update Energy Levels
            </>
          )}
        </button>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-900">
                <p className="font-semibold mb-1">Error</p>
                <p>{error}</p>
              </div>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Check size={18} className="text-green-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-green-900 w-full">
                  <p className="font-semibold mb-3">Processing Complete</p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-4">
                    <div>
                      <span className="font-medium">Total CSV rows:</span> {result.totalRows}
                    </div>
                    <div>
                      <span className="font-medium">Unique tracks:</span> {result.uniqueTracks}
                    </div>
                    <div>
                      <span className="font-medium">Tracks found in DB:</span> {result.matched}
                    </div>
                    <div>
                      <span className="font-medium">Successfully updated:</span> {result.updated}
                    </div>
                    <div>
                      <span className="font-medium">Not found in DB:</span> {result.notFound}
                    </div>
                  </div>

                  <div className="border-t border-green-200 pt-3 mt-3">
                    <p className="font-medium mb-2">Energy Level Breakdown:</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                      <div>Low only: {result.energyBreakdown.low}</div>
                      <div>Medium only: {result.energyBreakdown.medium}</div>
                      <div>High only: {result.energyBreakdown.high}</div>
                      <div className="font-semibold text-green-700">
                        Multiple levels: {result.energyBreakdown.multiple}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {result.notFoundTracks.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <XCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-900 flex-1">
                    <p className="font-semibold mb-2">
                      Tracks Not Found in Database ({result.notFoundTracks.length})
                    </p>
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-amber-100">
                          <tr>
                            <th className="text-left p-2 font-semibold">Track ID</th>
                            <th className="text-left p-2 font-semibold">Channel Name</th>
                            <th className="text-left p-2 font-semibold">Energy Levels</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.notFoundTracks.map((track, index) => (
                            <tr key={index} className="border-t border-amber-200">
                              <td className="p-2">{track.track_id}</td>
                              <td className="p-2">{track.channel_name}</td>
                              <td className="p-2">
                                <div className="flex gap-1 flex-wrap">
                                  {track.energy_levels.map((level) => (
                                    <span
                                      key={level}
                                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                                        level === 'low' ? 'bg-blue-100 text-blue-700' :
                                        level === 'medium' ? 'bg-amber-100 text-amber-700' :
                                        'bg-red-100 text-red-700'
                                      }`}
                                    >
                                      {level}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-red-900 flex-1">
                    <p className="font-semibold mb-2">Update Errors ({result.errors.length})</p>
                    <ul className="list-disc ml-5 space-y-1 max-h-48 overflow-y-auto">
                      {result.errors.map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useRef } from 'react';
import { Upload, AlertCircle, Check, Info, FileText, X, Database } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface CSVRow {
  track_id: number;
  track_name: string;
  artist_name: string;
  tempo: number;
  locked: boolean;
  speed: number;
  intensity: number;
  arousal: number;
  valence: number;
  brightness: number;
  complexity: number;
  energy_set: number;
}

interface ProgressStats {
  total: number;
  processed: number;
  updated: number;
  notFound: number;
  errors: number;
  currentBatch: number;
  totalBatches: number;
}

interface ProcessingLog {
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export function CSVMetadataImporter() {
  const [csvFile, setCSVFile] = useState<File | null>(null);
  const [csvData, setCSVData] = useState<CSVRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState<ProgressStats>({
    total: 0,
    processed: 0,
    updated: 0,
    notFound: 0,
    errors: 0,
    currentBatch: 0,
    totalBatches: 0,
  });
  const [logs, setLogs] = useState<ProcessingLog[]>([]);
  const [batchSize, setBatchSize] = useState(50);
  const [delayMs, setDelayMs] = useState(500);
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pauseRef = useRef(false);

  const addLog = (type: ProcessingLog['type'], message: string) => {
    const log: ProcessingLog = {
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
    };
    setLogs((prev) => [log, ...prev].slice(0, 100));
  };

  const parseCSV = (text: string): CSVRow[] => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('CSV file is empty or has no data rows');
    }

    const headers = lines[0].split(',').map(h => h.trim());

    const requiredHeaders = ['track_id', 'track_name', 'artist_name', 'tempo', 'locked',
                             'speed', 'intensity', 'arousal', 'valence', 'brightness',
                             'complexity', 'energy_set'];

    const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
    if (missingHeaders.length > 0) {
      throw new Error(`Missing required headers: ${missingHeaders.join(', ')}`);
    }

    const rows: CSVRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(',').map(v => v.trim());
      const row: any = {};

      headers.forEach((header, index) => {
        row[header] = values[index];
      });

      try {
        rows.push({
          track_id: parseInt(row.track_id),
          track_name: row.track_name || '',
          artist_name: row.artist_name || '',
          tempo: parseInt(row.tempo) || 0,
          locked: row.locked === '1' || row.locked === 'true',
          speed: parseFloat(row.speed) || 0,
          intensity: parseFloat(row.intensity) || 0,
          arousal: parseFloat(row.arousal) || 0,
          valence: parseFloat(row.valence) || 0,
          brightness: parseFloat(row.brightness) || 0,
          complexity: parseFloat(row.complexity) || 0,
          energy_set: parseInt(row.energy_set) || 1,
        });
      } catch (err) {
        throw new Error(`Error parsing row ${i}: ${err}`);
      }
    }

    return rows;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setCSVFile(file);
    setCSVData([]);
    setLogs([]);

    try {
      const text = await file.text();
      const parsed = parseCSV(text);
      setCSVData(parsed);
      addLog('success', `CSV file parsed successfully: ${parsed.length} rows found`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to parse CSV file';
      setError(errorMsg);
      addLog('error', errorMsg);
      setCSVFile(null);
    }
  };

  const updateTrackMetadata = async (rows: CSVRow[]): Promise<{ updated: number; notFound: number; errors: number }> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('No active session');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/import-csv-metadata`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rows }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Import failed');
      }

      if (result.errorDetails && result.errorDetails.length > 0) {
        result.errorDetails.forEach((detail: string) => {
          addLog('error', detail);
        });
      }

      if (result.notFound > 0) {
        addLog('warning', `${result.notFound} tracks not found in database`);
      }

      return {
        updated: result.updated || 0,
        notFound: result.notFound || 0,
        errors: result.errors || 0,
      };
    } catch (err) {
      let errorMsg = 'Unknown error';
      if (err instanceof Error) {
        errorMsg = err.message;
      } else if (typeof err === 'object' && err !== null && 'message' in err) {
        errorMsg = String((err as any).message);
      } else if (typeof err === 'string') {
        errorMsg = err;
      }
      addLog('error', `Batch error: ${errorMsg}`);
      return { updated: 0, notFound: 0, errors: rows.length };
    }
  };

  const processMetadata = async () => {
    if (csvData.length === 0) {
      setError('No CSV data to process');
      return;
    }

    setIsProcessing(true);
    setIsPaused(false);
    pauseRef.current = false;
    setError('');

    const totalBatches = Math.ceil(csvData.length / batchSize);

    setProgress({
      total: csvData.length,
      processed: 0,
      updated: 0,
      notFound: 0,
      errors: 0,
      currentBatch: 0,
      totalBatches,
    });

    addLog('info', `Starting metadata import: ${csvData.length} tracks in ${totalBatches} batches`);
    addLog('info', `Batch size: ${batchSize}, Delay: ${delayMs}ms`);

    let totalUpdated = 0;
    let totalNotFound = 0;
    let totalErrors = 0;

    for (let i = 0; i < csvData.length; i += batchSize) {
      if (pauseRef.current) {
        addLog('warning', 'Processing paused by user');
        setIsPaused(true);
        setIsProcessing(false);
        return;
      }

      const batch = csvData.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;

      addLog('info', `Processing batch ${batchNum}/${totalBatches} (${batch.length} tracks)`);

      const { updated, notFound, errors } = await updateTrackMetadata(batch);

      totalUpdated += updated;
      totalNotFound += notFound;
      totalErrors += errors;

      setProgress({
        total: csvData.length,
        processed: i + batch.length,
        updated: totalUpdated,
        notFound: totalNotFound,
        errors: totalErrors,
        currentBatch: batchNum,
        totalBatches,
      });

      addLog('success', `Batch ${batchNum} complete: ${updated} updated, ${notFound} not found, ${errors} errors`);

      if (i + batchSize < csvData.length) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    addLog('success', `Import complete! Total: ${totalUpdated} updated, ${totalNotFound} not found, ${totalErrors} errors`);
    setIsProcessing(false);
  };

  const handlePause = () => {
    pauseRef.current = true;
    addLog('info', 'Pause requested...');
  };

  const handleResume = () => {
    setIsPaused(false);
    processMetadata();
  };

  const handleReset = () => {
    setCSVFile(null);
    setCSVData([]);
    setIsProcessing(false);
    setIsPaused(false);
    setProgress({
      total: 0,
      processed: 0,
      updated: 0,
      notFound: 0,
      errors: 0,
      currentBatch: 0,
      totalBatches: 0,
    });
    setLogs([]);
    setError('');
    pauseRef.current = false;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const progressPercent = progress.total > 0 ? (progress.processed / progress.total) * 100 : 0;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
      <div className="flex items-start gap-3 mb-6">
        <Database size={24} className="text-blue-600 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-slate-900 mb-1">
            CSV Metadata Importer
          </h3>
          <p className="text-sm text-slate-600">
            Import complete metadata from CSV file to update tracks. Critical for energy_set field and all audio characteristics.
          </p>
        </div>
      </div>

      {/* Configuration */}
      {!isProcessing && !isPaused && (
        <div className="space-y-4 mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Batch Size
              </label>
              <input
                type="number"
                min="1"
                max="200"
                value={batchSize}
                onChange={(e) => setBatchSize(parseInt(e.target.value) || 50)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={csvData.length > 0}
              />
              <p className="text-xs text-slate-500 mt-1">Tracks per batch (1-200)</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Delay Between Batches (ms)
              </label>
              <input
                type="number"
                min="0"
                max="5000"
                step="100"
                value={delayMs}
                onChange={(e) => setDelayMs(parseInt(e.target.value) || 500)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={csvData.length > 0}
              />
              <p className="text-xs text-slate-500 mt-1">Delay in milliseconds (0-5000)</p>
            </div>
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Select CSV File
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {csvFile && (
              <div className="flex items-center gap-2 mt-2 text-sm text-slate-600">
                <FileText size={16} />
                <span>{csvFile.name}</span>
                <span className="text-slate-400">({csvData.length} rows)</span>
              </div>
            )}
          </div>

          {/* CSV Requirements */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <Info size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                <p className="font-semibold mb-1">CSV Requirements:</p>
                <ul className="list-disc ml-4 space-y-1">
                  <li>Required columns: track_id, track_name, artist_name, tempo, locked, speed, intensity, arousal, valence, brightness, complexity, energy_set</li>
                  <li>Track matching uses track_id column to match with database Track ID</li>
                  <li>All tracks in CSV will be processed - no skipping</li>
                  <li>Progress is shown in real-time</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          {csvData.length > 0 && (
            <div className="flex gap-3">
              <button
                onClick={processMetadata}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-md transition-colors flex items-center justify-center gap-2"
              >
                <Upload size={20} />
                Start Import ({csvData.length} tracks)
              </button>
              <button
                onClick={handleReset}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-3 px-4 rounded-md transition-colors flex items-center justify-center gap-2"
              >
                <X size={20} />
                Reset
              </button>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}

      {/* Progress Display */}
      {(isProcessing || isPaused || progress.processed > 0) && (
        <div className="space-y-4 mb-6">
          {/* Progress Bar */}
          <div>
            <div className="flex justify-between text-sm font-medium text-slate-700 mb-2">
              <span>Progress</span>
              <span>{progress.processed} / {progress.total} tracks</span>
            </div>
            <div className="w-full h-4 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="text-center text-sm font-semibold text-slate-700 mt-1">
              {progressPercent.toFixed(1)}%
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="text-xs text-green-600 font-medium mb-1">Updated</div>
              <div className="text-2xl font-bold text-green-700">{progress.updated}</div>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="text-xs text-yellow-600 font-medium mb-1">Not Found</div>
              <div className="text-2xl font-bold text-yellow-700">{progress.notFound}</div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="text-xs text-red-600 font-medium mb-1">Errors</div>
              <div className="text-2xl font-bold text-red-700">{progress.errors}</div>
            </div>
          </div>

          {/* Batch Progress */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="text-sm text-slate-700">
              Batch {progress.currentBatch} of {progress.totalBatches}
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex gap-3">
            {isProcessing && !isPaused && (
              <button
                onClick={handlePause}
                className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white font-semibold py-2 px-4 rounded-md transition-colors"
              >
                Pause
              </button>
            )}
            {isPaused && (
              <button
                onClick={handleResume}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-md transition-colors"
              >
                Resume
              </button>
            )}
            {!isProcessing && progress.processed > 0 && (
              <button
                onClick={handleReset}
                className="flex-1 bg-slate-600 hover:bg-slate-700 text-white font-semibold py-2 px-4 rounded-md transition-colors"
              >
                Start New Import
              </button>
            )}
          </div>

          {progress.processed === progress.total && progress.total > 0 && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              <Check size={16} className="flex-shrink-0" />
              <span className="font-semibold">Import Complete!</span>
            </div>
          )}
        </div>
      )}

      {/* Processing Log */}
      {logs.length > 0 && (
        <div>
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-sm font-semibold text-slate-700">Processing Log</h4>
            <span className="text-xs text-slate-500">{logs.length} entries</span>
          </div>
          <div className="bg-slate-900 rounded-lg p-3 max-h-64 overflow-y-auto font-mono text-xs">
            {logs.map((log, index) => (
              <div
                key={index}
                className={`flex gap-2 mb-1 ${
                  log.type === 'error' ? 'text-red-400' :
                  log.type === 'warning' ? 'text-yellow-400' :
                  log.type === 'success' ? 'text-green-400' :
                  'text-slate-300'
                }`}
              >
                <span className="text-slate-500">[{log.timestamp}]</span>
                <span>{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

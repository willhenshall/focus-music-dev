import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Play, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface BatchStatus {
  batch: number;
  status: 'pending' | 'running' | 'success' | 'error';
  updated?: number;
  skipped?: number;
  errors?: number;
  message?: string;
}

export default function MetadataBackfillRunner() {
  const [isRunning, setIsRunning] = useState(false);
  const [batches, setBatches] = useState<BatchStatus[]>(
    Array.from({ length: 23 }, (_, i) => ({
      batch: i + 1,
      status: 'pending',
    }))
  );
  const [overallProgress, setOverallProgress] = useState(0);

  const executeBatch = async (batchNumber: number): Promise<boolean> => {
    setBatches(prev =>
      prev.map(b =>
        b.batch === batchNumber ? { ...b, status: 'running' } : b
      )
    );

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/execute-metadata-backfill`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ batchNumber }),
      });

      const result = await response.json();

      if (result.success) {
        setBatches(prev =>
          prev.map(b =>
            b.batch === batchNumber
              ? {
                  ...b,
                  status: 'success',
                  updated: result.updated,
                  skipped: result.skipped,
                  errors: result.errors,
                  message: result.message,
                }
              : b
          )
        );
        return true;
      } else {
        throw new Error(result.error || 'Unknown error');
      }
    } catch (error: any) {
      setBatches(prev =>
        prev.map(b =>
          b.batch === batchNumber
            ? {
                ...b,
                status: 'error',
                message: error.message,
              }
            : b
        )
      );
      return false;
    }
  };

  const executeAllBatches = async () => {
    setIsRunning(true);
    setOverallProgress(0);

    for (let i = 1; i <= 23; i++) {
      await executeBatch(i);
      setOverallProgress((i / 23) * 100);

      // Brief pause between batches
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setIsRunning(false);
  };

  const successCount = batches.filter(b => b.status === 'success').length;
  const errorCount = batches.filter(b => b.status === 'error').length;
  const totalUpdated = batches.reduce((sum, b) => sum + (b.updated || 0), 0);

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Metadata Backfill Runner</h2>
        <p className="text-gray-600">
          This will execute all 23 batches to populate missing metadata for ~11,285 tracks.
        </p>
        <p className="text-sm text-gray-500 mt-2">
          <strong>Note:</strong> Artist names and track names will NOT be modified.
        </p>
      </div>

      {/* Start Button */}
      {!isRunning && successCount === 0 && (
        <button
          onClick={executeAllBatches}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          <Play className="w-5 h-5" />
          Start Metadata Backfill
        </button>
      )}

      {/* Progress Bar */}
      {(isRunning || successCount > 0) && (
        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Overall Progress</span>
            <span>{Math.round(overallProgress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className="bg-blue-600 h-full transition-all duration-300 ease-out"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
          <div className="mt-2 text-sm text-gray-600">
            Completed: {successCount}/23 batches | Tracks updated: {totalUpdated}
          </div>
        </div>
      )}

      {/* Batch List */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {batches.map((batch) => (
          <div
            key={batch.batch}
            className={`flex items-center justify-between p-3 rounded-lg border ${
              batch.status === 'success'
                ? 'bg-green-50 border-green-200'
                : batch.status === 'error'
                ? 'bg-red-50 border-red-200'
                : batch.status === 'running'
                ? 'bg-blue-50 border-blue-200'
                : 'bg-gray-50 border-gray-200'
            }`}
          >
            <div className="flex items-center gap-3">
              {batch.status === 'pending' && (
                <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
              )}
              {batch.status === 'running' && (
                <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
              )}
              {batch.status === 'success' && (
                <CheckCircle className="w-5 h-5 text-green-600" />
              )}
              {batch.status === 'error' && (
                <XCircle className="w-5 h-5 text-red-600" />
              )}

              <div>
                <div className="font-medium">Batch {batch.batch}/23</div>
                {batch.message && (
                  <div className="text-sm text-gray-600">{batch.message}</div>
                )}
              </div>
            </div>

            {batch.updated !== undefined && (
              <div className="text-sm text-gray-600">
                {batch.updated} updated
                {batch.skipped ? ` | ${batch.skipped} skipped` : ''}
                {batch.errors ? ` | ${batch.errors} errors` : ''}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Summary */}
      {successCount === 23 && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <h3 className="font-semibold text-green-900 mb-2">
            Backfill Complete!
          </h3>
          <p className="text-sm text-green-800">
            Successfully updated {totalUpdated} tracks across all 23 batches.
          </p>
          {errorCount > 0 && (
            <p className="text-sm text-orange-600 mt-1">
              {errorCount} batches had some errors - check the Music Library to verify.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

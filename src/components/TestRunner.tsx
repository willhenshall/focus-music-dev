import { useState } from 'react';
import { Play, Terminal, CheckCircle, XCircle, Clock, AlertCircle, Loader, Eye } from 'lucide-react';

type TestStatus = 'idle' | 'running' | 'completed' | 'error';
type TestResult = {
  file: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
};

export function TestRunner() {
  const [status, setStatus] = useState<TestStatus>('idle');
  const [output, setOutput] = useState<string[]>([]);
  const [results, setResults] = useState<TestResult[]>([]);
  const [startTime, setStartTime] = useState<number | null>(null);

  const runTests = async () => {
    setStatus('running');
    setOutput([]);
    setResults([]);
    setStartTime(Date.now());

    try {
      const response = await fetch('/api/run-tests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to run tests');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(Boolean);

        for (const line of lines) {
          setOutput((prev) => [...prev, line]);

          if (line.includes('passed') || line.includes('failed') || line.includes('skipped')) {
            const match = line.match(/(\w+\.spec\.ts).*?(passed|failed|skipped).*?(\d+)ms/);
            if (match) {
              const [, file, status, duration] = match;
              setResults((prev) => [
                ...prev,
                {
                  file,
                  status: status as 'passed' | 'failed' | 'skipped',
                  duration: parseInt(duration),
                },
              ]);
            }
          }
        }
      }

      setStatus('completed');
    } catch (error) {
      setStatus('error');
      setOutput((prev) => [
        ...prev,
        '',
        `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
      ]);
    }
  };

  const getStatusIcon = (testStatus: 'passed' | 'failed' | 'skipped') => {
    switch (testStatus) {
      case 'passed':
        return <CheckCircle size={18} className="text-green-600" />;
      case 'failed':
        return <XCircle size={18} className="text-red-600" />;
      case 'skipped':
        return <Clock size={18} className="text-slate-400" />;
    }
  };

  const getTotalDuration = () => {
    if (!startTime) return 0;
    if (status === 'running') return Date.now() - startTime;
    return results.reduce((sum, r) => sum + r.duration, 0);
  };

  const passedCount = results.filter((r) => r.status === 'passed').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;
  const skippedCount = results.filter((r) => r.status === 'skipped').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={runTests}
            disabled={status === 'running'}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white font-semibold py-2 px-6 rounded-md transition-colors flex items-center gap-2"
          >
            {status === 'running' ? (
              <>
                <Loader size={20} className="animate-spin" />
                Running Tests...
              </>
            ) : (
              <>
                <Play size={20} />
                Run All Tests
              </>
            )}
          </button>

          {status === 'running' && (
            <div className="text-sm text-slate-600">
              {Math.floor(getTotalDuration() / 1000)}s elapsed
            </div>
          )}
        </div>

        {results.length > 0 && (
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <CheckCircle size={16} className="text-green-600" />
              <span className="font-semibold">{passedCount} passed</span>
            </div>
            {failedCount > 0 && (
              <div className="flex items-center gap-1">
                <XCircle size={16} className="text-red-600" />
                <span className="font-semibold">{failedCount} failed</span>
              </div>
            )}
            {skippedCount > 0 && (
              <div className="flex items-center gap-1">
                <Clock size={16} className="text-slate-400" />
                <span className="font-semibold">{skippedCount} skipped</span>
              </div>
            )}
          </div>
        )}
      </div>

      {results.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Eye size={18} />
            Test Results
          </h4>
          <div className="space-y-2">
            {results.map((result, idx) => (
              <div
                key={idx}
                className={`flex items-center justify-between p-3 rounded-md border ${
                  result.status === 'passed'
                    ? 'bg-green-50 border-green-200'
                    : result.status === 'failed'
                    ? 'bg-red-50 border-red-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {getStatusIcon(result.status)}
                  <span className="font-mono text-sm">{result.file}</span>
                </div>
                <span className="text-xs text-slate-600">{result.duration}ms</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {output.length > 0 && (
        <div className="bg-slate-900 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3 text-green-400">
            <Terminal size={18} />
            <span className="font-semibold text-sm">Terminal Output</span>
          </div>
          <div className="font-mono text-xs text-green-400 space-y-1 max-h-96 overflow-y-auto">
            {output.map((line, idx) => (
              <div key={idx} className="whitespace-pre-wrap">
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      {status === 'idle' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-semibold mb-1">Ready to run tests</p>
            <p>Click "Run All Tests" to execute your Playwright test suite and see results in real-time.</p>
          </div>
        </div>
      )}

      {status === 'completed' && (
        <div
          className={`border rounded-lg p-4 flex items-start gap-3 ${
            failedCount > 0
              ? 'bg-red-50 border-red-200'
              : 'bg-green-50 border-green-200'
          }`}
        >
          {failedCount > 0 ? (
            <>
              <XCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-900">
                <p className="font-semibold mb-1">Tests completed with failures</p>
                <p>
                  {failedCount} test{failedCount > 1 ? 's' : ''} failed. Review the output above to identify and fix issues.
                </p>
              </div>
            </>
          ) : (
            <>
              <CheckCircle size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-green-900">
                <p className="font-semibold mb-1">All tests passed!</p>
                <p>
                  {passedCount} test{passedCount > 1 ? 's' : ''} completed successfully in{' '}
                  {Math.floor(getTotalDuration() / 1000)}s.
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

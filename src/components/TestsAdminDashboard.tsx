import { useState, useEffect } from 'react';
import { TestTube2, ChevronDown, ChevronUp, ExternalLink, Activity } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Test = {
  id: string;
  test_name: string;
  test_file: string;
  description: string;
  last_run_date: string | null;
  last_run_status: string | null;
  total_runs: number;
  pass_rate: number;
};

type TestRun = {
  id: string;
  run_date: string;
  status: string;
  duration_ms: number;
  passed_count: number;
  failed_count: number;
  error_message: string | null;
};

type TestsAdminDashboardProps = {
  showAudioDiagnostics?: boolean;
  onToggleAudioDiagnostics?: () => void;
};

export function TestsAdminDashboard({ showAudioDiagnostics = false, onToggleAudioDiagnostics }: TestsAdminDashboardProps) {
  const [tests, setTests] = useState<Test[]>([]);
  const [expandedTest, setExpandedTest] = useState<string | null>(null);
  const [testRuns, setTestRuns] = useState<TestRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTests();
  }, []);

  const loadTests = async () => {
    const { data, error } = await supabase
      .from('playwright_test_registry')
      .select('*')
      .order('test_name');

    if (error) {
      console.error('Error loading tests:', error);
    } else {
      setTests(data || []);
    }
    setLoading(false);
  };

  const loadTestRuns = async (testId: string) => {
    const { data, error } = await supabase
      .from('playwright_test_runs')
      .select('*')
      .eq('test_id', testId)
      .order('run_date', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error loading test runs:', error);
    } else {
      setTestRuns(data || []);
    }
  };

  const handleToggleExpand = (testId: string) => {
    if (expandedTest === testId) {
      setExpandedTest(null);
      setTestRuns([]);
    } else {
      setExpandedTest(testId);
      loadTestRuns(testId);
    }
  };

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'passed': return 'text-green-600 bg-green-50';
      case 'failed': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading tests...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <TestTube2 size={32} className="text-blue-600" />
          <h1 className="text-3xl font-bold">Playwright Tests</h1>
        </div>
        {onToggleAudioDiagnostics && (
          <button
            onClick={onToggleAudioDiagnostics}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all ${
              showAudioDiagnostics
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Activity className="w-5 h-5" />
            Audio Engine Diagnostics
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="divide-y">
          {tests.map((test) => (
            <div key={test.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-lg">{test.test_name}</h3>
                    {test.last_run_status && (
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(test.last_run_status)}`}>
                        {test.last_run_status}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{test.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    <span>File: {test.test_file}</span>
                    {test.last_run_date && (
                      <span>Last run: {new Date(test.last_run_date).toLocaleString()}</span>
                    )}
                    {test.total_runs > 0 && (
                      <>
                        <span>Runs: {test.total_runs}</span>
                        <span>Pass rate: {test.pass_rate}%</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleToggleExpand(test.id)}
                  className="ml-4 p-2 hover:bg-gray-100 rounded"
                >
                  {expandedTest === test.id ? (
                    <ChevronUp size={20} />
                  ) : (
                    <ChevronDown size={20} />
                  )}
                </button>
              </div>

              {expandedTest === test.id && (
                <div className="mt-4 pl-4 border-l-2 border-gray-200">
                  <h4 className="font-semibold text-sm mb-3">Recent Runs (Last 10)</h4>
                  {testRuns.length === 0 ? (
                    <p className="text-sm text-gray-500">No runs recorded yet</p>
                  ) : (
                    <div className="space-y-2">
                      {testRuns.map((run) => (
                        <div key={run.id} className="bg-gray-50 p-3 rounded text-sm">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(run.status)}`}>
                                {run.status}
                              </span>
                              <span className="text-gray-600">
                                {new Date(run.run_date).toLocaleString()}
                              </span>
                              <span className="text-gray-500">
                                {run.duration_ms}ms
                              </span>
                            </div>
                            <div className="text-xs text-gray-500">
                              {run.passed_count} passed, {run.failed_count} failed
                            </div>
                          </div>
                          {run.error_message && (
                            <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">
                              {run.error_message}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

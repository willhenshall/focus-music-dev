import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
} from '@playwright/test/reporter';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

class DatabaseReporter implements Reporter {
  private edgeFunctionUrl: string;
  private testRunId: string | null = null;
  private testRegistry: Map<string, string> = new Map();
  private testFile: string | null = null;
  private suiteName: string | null = null;
  private testCases: Array<{
    name: string;
    status: string;
    duration: number;
    error?: string;
  }> = [];

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    this.edgeFunctionUrl = `${supabaseUrl}/functions/v1/record-test-result`;
  }

  onBegin(config: FullConfig, suite: Suite) {
    console.log('\n📊 Database Reporter: Recording test run...\n');
  }

  onTestEnd(test: TestCase, result: TestResult) {
    // Store test data for batch processing at the end
    const testFile = path.relative(process.cwd(), test.location.file);
    const suiteName = test.parent.title;
    const testName = test.title;
    const status = result.status === 'passed' ? 'passed' :
                   result.status === 'skipped' ? 'skipped' : 'failed';

    // Store for later
    if (!this.testFile) {
      this.testFile = testFile;
      this.suiteName = suiteName;
    }

    this.testCases.push({
      name: testName,
      status,
      duration: result.duration,
      error: result.error?.message,
    });
  }

  async onEnd(result: FullResult) {
    console.log('\n📊 Database Reporter: Finalizing test run...');

    if (!this.testFile || this.testCases.length === 0) {
      console.log('⚠️  No test data collected, skipping database update');
      return;
    }

    try {
      // Calculate counts
      const passedCount = this.testCases.filter(c => c.status === 'passed').length;
      const failedCount = this.testCases.filter(c => c.status === 'failed').length;
      const skippedCount = this.testCases.filter(c => c.status === 'skipped').length;
      const totalDuration = this.testCases.reduce((sum, c) => sum + c.duration, 0);
      const finalStatus = failedCount > 0 ? 'failed' : passedCount > 0 ? 'passed' : 'skipped';

      // Prepare payload for edge function
      const payload = {
        testFile: this.testFile,
        testName: this.suiteName || 'Test Suite',
        suiteName: this.suiteName,
        status: finalStatus,
        durationMs: totalDuration,
        passedCount,
        failedCount,
        skippedCount,
        browser: 'chromium',
        viewport: '1280x720',
        testCases: this.testCases.map(tc => ({
          name: tc.name,
          status: tc.status as 'passed' | 'failed' | 'skipped',
          durationMs: tc.duration,
          errorMessage: tc.error,
          retryCount: 0,
        })),
      };

      // Call edge function to record results
      const response = await fetch(this.edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Edge function error: ${errorData.error || response.statusText}`);
      }

      const data = await response.json();
      console.log(`\n✅ Test results recorded to database (Run ID: ${data.runId})`);
      console.log(`   Status: ${finalStatus}, Passed: ${passedCount}, Failed: ${failedCount}, Skipped: ${skippedCount}\n`);

    } catch (error) {
      console.error('Failed to finalize test run:', error);
    }
  }
}

export default DatabaseReporter;

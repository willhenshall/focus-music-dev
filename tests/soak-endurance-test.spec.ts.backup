import { test, expect, Page } from '@playwright/test';
import { loginAsUser } from './helpers/auth';

const SOAK_TEST_DURATION = 5 * 60 * 1000; // 5 minutes demo
const MIN_PLAY_DURATION = 10 * 1000; // 10 seconds
const MAX_PLAY_DURATION = 30 * 1000; // 30 seconds
const MIN_PAUSE_DURATION = 3 * 1000; // 3 seconds
const MAX_PAUSE_DURATION = 10 * 1000; // 10 seconds
const ENERGY_LEVELS = ['low', 'medium', 'high'] as const;

type EnergyLevel = typeof ENERGY_LEVELS[number];

interface AudioErrorDetail {
  channel: string;
  energy: EnergyLevel;
  errorType: string;
  errorMessage: string;
  timestamp: number;
  audioState?: any;
}

interface ChannelErrorSummary {
  channel: string;
  errorCount: number;
  errors: AudioErrorDetail[];
}

interface SoakTestMetrics {
  startTime: number;
  endTime?: number;
  totalChannelsPlayed: number;
  totalEnergyChanges: number;
  totalPlayPauseCycles: number;
  totalTracksPlayed: number;
  audioErrors: number;
  channelLoadErrors: number;
  playbackInterruptions: number;
  successfulTransitions: number;
  audioErrorDetails: AudioErrorDetail[];
  channelLoadErrorDetails: Array<{channel: string; timestamp: number; error: string}>;
  events: Array<{
    timestamp: number;
    type: string;
    detail: string;
    success: boolean;
  }>;
}

class SoakTestRunner {
  private page: Page;
  private metrics: SoakTestMetrics;
  private startTime: number;
  private isRunning: boolean = false;
  private currentChannel: string | null = null;
  private currentEnergy: EnergyLevel = 'medium';
  private isPlaying: boolean = false;
  private availableChannels: string[] = [];

  constructor(page: Page) {
    this.page = page;
    this.startTime = Date.now();
    this.metrics = {
      startTime: this.startTime,
      totalChannelsPlayed: 0,
      totalEnergyChanges: 0,
      totalPlayPauseCycles: 0,
      totalTracksPlayed: 0,
      audioErrors: 0,
      channelLoadErrors: 0,
      playbackInterruptions: 0,
      successfulTransitions: 0,
      audioErrorDetails: [],
      channelLoadErrorDetails: [],
      events: [],
    };
  }

  private log(type: string, detail: string, success: boolean = true) {
    const elapsed = Date.now() - this.startTime;
    const timeStr = this.formatDuration(elapsed);
    const emoji = success ? '✅' : '❌';
    console.log(`[${timeStr}] ${emoji} ${type}: ${detail}`);

    this.metrics.events.push({
      timestamp: Date.now(),
      type,
      detail,
      success,
    });
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private randomChoice<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  private getElapsedTime(): number {
    return Date.now() - this.startTime;
  }

  private async waitRandom(min: number, max: number) {
    const duration = this.randomInt(min, max);
    this.log('WAIT', `Waiting for ${Math.round(duration / 1000)}s`);
    await this.page.waitForTimeout(duration);
  }

  async initialize() {
    this.log('INIT', 'Loading available channels');

    try {
      await this.page.waitForSelector('button:has-text("Channels")', { timeout: 10000 });
      await this.page.click('button:has-text("Channels")');
      await this.page.waitForTimeout(2000);

      const channelCards = await this.page.locator('[data-testid="channel-card"]').all();

      if (channelCards.length === 0) {
        const headings = await this.page.locator('h3').allTextContents();
        this.availableChannels = headings.filter(h =>
          h &&
          h.length > 0 &&
          !h.includes('Energy') &&
          !h.includes('Settings') &&
          h !== 'Channels'
        );
      } else {
        for (const card of channelCards) {
          const heading = await card.locator('h3').textContent();
          if (heading) {
            this.availableChannels.push(heading);
          }
        }
      }

      this.log('INIT', `Found ${this.availableChannels.length} channels: ${this.availableChannels.slice(0, 5).join(', ')}${this.availableChannels.length > 5 ? '...' : ''}`);

      if (this.availableChannels.length === 0) {
        throw new Error('No channels found');
      }

    } catch (error) {
      this.log('INIT', `Failed to load channels: ${error}`, false);
      throw error;
    }
  }

  async selectRandomChannel() {
    const channel = this.randomChoice(this.availableChannels);
    this.log('CHANNEL', `Selecting "${channel}"`);

    try {
      await this.page.click(`h3:has-text("${channel}")`);
      await this.page.waitForTimeout(2000);

      const nowPlaying = await this.page.locator('text=Now playing').isVisible({ timeout: 5000 }).catch(() => false);

      if (nowPlaying) {
        this.currentChannel = channel;
        this.metrics.totalChannelsPlayed++;
        this.log('CHANNEL', `Successfully loaded "${channel}"`);
        return true;
      } else {
        this.log('CHANNEL', `Failed to load "${channel}"`, false);
        this.metrics.channelLoadErrors++;
        this.metrics.channelLoadErrorDetails.push({
          channel,
          timestamp: Date.now(),
          error: 'Channel did not load - Now playing indicator not visible'
        });
        return false;
      }
    } catch (error) {
      const errorMsg = String(error);
      this.log('CHANNEL', `Error loading "${channel}": ${errorMsg}`, false);
      this.metrics.channelLoadErrors++;
      this.metrics.channelLoadErrorDetails.push({
        channel,
        timestamp: Date.now(),
        error: errorMsg
      });
      return false;
    }
  }

  async changeRandomEnergy() {
    const newEnergy = this.randomChoice(ENERGY_LEVELS);

    if (newEnergy === this.currentEnergy) {
      return;
    }

    this.log('ENERGY', `Changing from ${this.currentEnergy} to ${newEnergy}`);

    try {
      const energyButton = this.page.locator(`button`).filter({ hasText: new RegExp(`^${newEnergy}$`, 'i') }).first();
      const isVisible = await energyButton.isVisible({ timeout: 2000 }).catch(() => false);

      if (isVisible) {
        await energyButton.click();
        await this.page.waitForTimeout(1500);

        this.currentEnergy = newEnergy;
        this.metrics.totalEnergyChanges++;
        this.log('ENERGY', `Successfully changed to ${newEnergy}`);
        return true;
      } else {
        this.log('ENERGY', `Energy button not visible for ${newEnergy}`, false);
        return false;
      }
    } catch (error) {
      this.log('ENERGY', `Error changing energy: ${error}`, false);
      return false;
    }
  }

  async togglePlayback() {
    const action = this.isPlaying ? 'Pausing' : 'Playing';
    this.log('TRANSPORT', action);

    try {
      const playButton = this.page.locator('button[aria-label*="Play"], button[aria-label*="Pause"]').first();
      const isVisible = await playButton.isVisible({ timeout: 2000 }).catch(() => false);

      if (isVisible) {
        await playButton.click();
        await this.page.waitForTimeout(1000);

        this.isPlaying = !this.isPlaying;
        this.metrics.totalPlayPauseCycles++;
        this.log('TRANSPORT', `${action} successful`);
        return true;
      } else {
        this.log('TRANSPORT', 'Play/Pause button not visible', false);
        return false;
      }
    } catch (error) {
      this.log('TRANSPORT', `Error toggling playback: ${error}`, false);
      return false;
    }
  }

  async verifyAudioPlaying(): Promise<boolean> {
    try {
      const audioElement = await this.page.evaluate(() => {
        const audio = document.querySelector('audio');
        if (!audio) return null;

        return {
          paused: audio.paused,
          currentTime: audio.currentTime,
          duration: audio.duration,
          readyState: audio.readyState,
          networkState: audio.networkState,
          src: audio.src,
          error: audio.error ? {
            code: audio.error.code,
            message: audio.error.message
          } : null,
        };
      });

      if (!audioElement) {
        this.log('AUDIO', 'No audio element found', false);
        this.metrics.audioErrors++;
        this.metrics.audioErrorDetails.push({
          channel: this.currentChannel || 'Unknown',
          energy: this.currentEnergy,
          errorType: 'NO_AUDIO_ELEMENT',
          errorMessage: 'No audio element found in DOM',
          timestamp: Date.now(),
          audioState: null
        });
        return false;
      }

      if (audioElement.error) {
        this.log('AUDIO', `Audio error: ${audioElement.error.message} (code: ${audioElement.error.code})`, false);
        this.metrics.audioErrors++;
        this.metrics.audioErrorDetails.push({
          channel: this.currentChannel || 'Unknown',
          energy: this.currentEnergy,
          errorType: `MEDIA_ERROR_${audioElement.error.code}`,
          errorMessage: audioElement.error.message,
          timestamp: Date.now(),
          audioState: audioElement
        });
        return false;
      }

      if (this.isPlaying && audioElement.paused) {
        this.log('AUDIO', 'Expected playing but audio is paused', false);
        this.metrics.playbackInterruptions++;
        this.metrics.audioErrorDetails.push({
          channel: this.currentChannel || 'Unknown',
          energy: this.currentEnergy,
          errorType: 'PLAYBACK_INTERRUPTED',
          errorMessage: 'Audio element is paused when it should be playing',
          timestamp: Date.now(),
          audioState: audioElement
        });
        return false;
      }

      if (this.isPlaying && audioElement.currentTime > 0) {
        this.log('AUDIO', `Playing at ${audioElement.currentTime.toFixed(1)}s / ${audioElement.duration.toFixed(1)}s`);
        this.metrics.successfulTransitions++;
        return true;
      }

      return true;
    } catch (error) {
      const errorMsg = String(error);
      this.log('AUDIO', `Verification error: ${errorMsg}`, false);
      this.metrics.audioErrors++;
      this.metrics.audioErrorDetails.push({
        channel: this.currentChannel || 'Unknown',
        energy: this.currentEnergy,
        errorType: 'VERIFICATION_ERROR',
        errorMessage: errorMsg,
        timestamp: Date.now()
      });
      return false;
    }
  }

  async runSoakTest() {
    this.isRunning = true;
    this.log('START', `Starting ${SOAK_TEST_DURATION / 60000} minute soak test (demo)`);

    await this.initialize();
    await this.selectRandomChannel();
    await this.page.waitForTimeout(2000);
    await this.togglePlayback();
    this.isPlaying = true;

    let cycleCount = 0;

    while (this.getElapsedTime() < SOAK_TEST_DURATION && this.isRunning) {
      cycleCount++;
      const remainingTime = SOAK_TEST_DURATION - this.getElapsedTime();
      this.log('CYCLE', `Cycle ${cycleCount} (${this.formatDuration(remainingTime)} remaining)`);

      const action = this.randomInt(1, 100);

      if (action <= 30) {
        await this.selectRandomChannel();
        this.isPlaying = true;
      } else if (action <= 50) {
        await this.changeRandomEnergy();
      } else if (action <= 80) {
        if (this.isPlaying) {
          await this.togglePlayback();
          await this.waitRandom(MIN_PAUSE_DURATION, MAX_PAUSE_DURATION);
          await this.togglePlayback();
        }
      } else {
        await this.verifyAudioPlaying();
      }

      if (this.isPlaying) {
        await this.waitRandom(MIN_PLAY_DURATION, MAX_PLAY_DURATION);
      } else {
        await this.waitRandom(MIN_PAUSE_DURATION, MAX_PAUSE_DURATION);
      }

      if (cycleCount % 5 === 0) {
        await this.verifyAudioPlaying();
        this.printProgress();
      }
    }

    this.metrics.endTime = Date.now();
    this.log('END', 'Soak test completed');
    this.printFinalReport();
  }

  printProgress() {
    const elapsed = this.getElapsedTime();
    const percentage = ((elapsed / SOAK_TEST_DURATION) * 100).toFixed(1);

    console.log('\n' + '='.repeat(80));
    console.log(`📊 PROGRESS - ${percentage}% Complete (${this.formatDuration(elapsed)})`);
    console.log('='.repeat(80));
    console.log(`Channels: ${this.metrics.totalChannelsPlayed} | Energy Changes: ${this.metrics.totalEnergyChanges} | Play/Pause: ${this.metrics.totalPlayPauseCycles}`);
    console.log(`Successful: ${this.metrics.successfulTransitions} | Errors: ${this.metrics.audioErrors} | Interruptions: ${this.metrics.playbackInterruptions}`);
    console.log('='.repeat(80) + '\n');
  }

  printFinalReport() {
    const duration = this.metrics.endTime! - this.metrics.startTime;
    const totalEvents = this.metrics.events.length;
    const successfulEvents = this.metrics.events.filter(e => e.success).length;
    const successRate = ((successfulEvents / totalEvents) * 100).toFixed(2);

    console.log('\n' + '='.repeat(80));
    console.log('🎯 SOAK TEST FINAL REPORT');
    console.log('='.repeat(80));
    console.log(`Duration: ${this.formatDuration(duration)}`);
    console.log(`Channels Played: ${this.metrics.totalChannelsPlayed}`);
    console.log(`Energy Changes: ${this.metrics.totalEnergyChanges}`);
    console.log(`Play/Pause Cycles: ${this.metrics.totalPlayPauseCycles}`);
    console.log(`Successful Transitions: ${this.metrics.successfulTransitions}`);
    console.log(`Audio Errors: ${this.metrics.audioErrors}`);
    console.log(`Playback Interruptions: ${this.metrics.playbackInterruptions}`);
    console.log(`Success Rate: ${successRate}%`);
    console.log('='.repeat(80));

    if (this.metrics.audioErrorDetails.length > 0) {
      console.log('\n' + '='.repeat(80));
      console.log('📊 AUDIO ERROR DETAILS');
      console.log('='.repeat(80));

      const channelErrorMap = new Map<string, AudioErrorDetail[]>();
      this.metrics.audioErrorDetails.forEach(error => {
        if (!channelErrorMap.has(error.channel)) {
          channelErrorMap.set(error.channel, []);
        }
        channelErrorMap.get(error.channel)!.push(error);
      });

      const channelSummaries: ChannelErrorSummary[] = [];
      channelErrorMap.forEach((errors, channel) => {
        channelSummaries.push({
          channel,
          errorCount: errors.length,
          errors
        });
      });

      channelSummaries.sort((a, b) => b.errorCount - a.errorCount);

      console.log(`\nTotal Channels with Errors: ${channelSummaries.length}\n`);

      channelSummaries.forEach((summary, index) => {
        console.log(`${index + 1}. Channel: "${summary.channel}" - ${summary.errorCount} error(s)`);
        summary.errors.forEach((error, errIndex) => {
          const timeStr = this.formatDuration(error.timestamp - this.metrics.startTime);
          console.log(`   [${timeStr}] ${error.errorType}: ${error.errorMessage}`);
          if (error.audioState) {
            console.log(`      Energy: ${error.energy}`);
            console.log(`      Audio State: paused=${error.audioState.paused}, ` +
                       `currentTime=${error.audioState.currentTime?.toFixed(1) || 'N/A'}, ` +
                       `readyState=${error.audioState.readyState}`);
            if (error.audioState.src) {
              const srcPreview = error.audioState.src.length > 80
                ? error.audioState.src.substring(0, 80) + '...'
                : error.audioState.src;
              console.log(`      Source: ${srcPreview}`);
            }
          }
          if (errIndex < summary.errors.length - 1) console.log('');
        });
        console.log('');
      });

      const errorTypeCount = new Map<string, number>();
      this.metrics.audioErrorDetails.forEach(error => {
        errorTypeCount.set(error.errorType, (errorTypeCount.get(error.errorType) || 0) + 1);
      });

      console.log('Error Types Summary:');
      Array.from(errorTypeCount.entries())
        .sort((a, b) => b[1] - a[1])
        .forEach(([type, count]) => {
          console.log(`  ${type}: ${count}`);
        });

      console.log('='.repeat(80));
    }

    if (this.metrics.channelLoadErrorDetails.length > 0) {
      console.log('\n' + '='.repeat(80));
      console.log('📊 CHANNEL LOAD ERROR DETAILS');
      console.log('='.repeat(80));
      this.metrics.channelLoadErrorDetails.forEach((error, index) => {
        const timeStr = this.formatDuration(error.timestamp - this.metrics.startTime);
        console.log(`${index + 1}. [${timeStr}] "${error.channel}": ${error.error}`);
      });
      console.log('='.repeat(80));
    }

    console.log('');
  }

  getMetrics(): SoakTestMetrics {
    return this.metrics;
  }
}

test.describe('Soak Test - Demo (5 minutes)', () => {
  test('should demonstrate soak test functionality', async ({ page }) => {
    test.setTimeout(SOAK_TEST_DURATION + 2 * 60 * 1000);

    console.log('\n🚀 Starting 5-Minute Soak Test Demo\n');

    await loginAsUser(page);

    const runner = new SoakTestRunner(page);
    await runner.runSoakTest();

    const metrics = runner.getMetrics();

    expect(metrics.totalChannelsPlayed).toBeGreaterThan(0);
    expect(metrics.successfulTransitions).toBeGreaterThan(0);
  });
});

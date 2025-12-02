import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the build-time constants before importing buildInfo
vi.stubGlobal('__APP_VERSION__', '1.3.0');
vi.stubGlobal('__BUILD_TIME__', '2025-12-02T09:15:30.000Z');
vi.stubGlobal('__COMMIT_SHA__', 'abc1234def5678');

describe('buildInfo', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('basic fields', () => {
    it('exports version matching the stubbed __APP_VERSION__', async () => {
      const { buildInfo } = await import('../buildInfo');
      expect(buildInfo.version).toBe('1.3.0');
    });

    it('exports buildTime matching the stubbed __BUILD_TIME__', async () => {
      const { buildInfo } = await import('../buildInfo');
      expect(buildInfo.buildTime).toBe('2025-12-02T09:15:30.000Z');
    });

    it('exports env as a valid environment string', async () => {
      const { buildInfo } = await import('../buildInfo');
      expect(buildInfo.env).toBeDefined();
      expect(typeof buildInfo.env).toBe('string');
      // In test environment, mode is typically 'test'
      expect(['development', 'production', 'test']).toContain(buildInfo.env);
    });
  });

  describe('commit SHA fields', () => {
    it('exports commitSha matching the stubbed __COMMIT_SHA__', async () => {
      const { buildInfo } = await import('../buildInfo');
      expect(buildInfo.commitSha).toBe('abc1234def5678');
    });

    it('exports shortSha as first 7 characters of commitSha', async () => {
      const { buildInfo } = await import('../buildInfo');
      expect(buildInfo.shortSha).toBe('abc1234');
      expect(buildInfo.shortSha).toHaveLength(7);
    });

    it('shortSha remains "local" when commitSha is "local"', async () => {
      vi.stubGlobal('__COMMIT_SHA__', 'local');
      vi.resetModules();
      const { buildInfo } = await import('../buildInfo');
      expect(buildInfo.shortSha).toBe('local');
      // Restore for other tests
      vi.stubGlobal('__COMMIT_SHA__', 'abc1234def5678');
    });
  });

  describe('getEnvLabel', () => {
    it('returns "prod" for production', async () => {
      const { getEnvLabel } = await import('../buildInfo');
      expect(getEnvLabel('production')).toBe('prod');
    });

    it('returns "dev" for development', async () => {
      const { getEnvLabel } = await import('../buildInfo');
      expect(getEnvLabel('development')).toBe('dev');
    });

    it('returns the value as-is for other environments', async () => {
      const { getEnvLabel } = await import('../buildInfo');
      expect(getEnvLabel('test')).toBe('test');
      expect(getEnvLabel('staging')).toBe('staging');
    });
  });

  describe('formatBuildTime', () => {
    it('removes seconds and milliseconds from ISO string', async () => {
      const { formatBuildTime } = await import('../buildInfo');
      const formatted = formatBuildTime('2025-12-02T09:15:30.000Z');
      expect(formatted).toBe('2025-12-02T09:15Z');
    });

    it('returns correctly formatted string matching pattern', async () => {
      const { formatBuildTime } = await import('../buildInfo');
      const formatted = formatBuildTime();
      // Should match: YYYY-MM-DDTHH:MMZ
      expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/);
      expect(formatted).not.toMatch(/:\d{2}\.\d{3}Z$/);
    });
  });

  describe('formatBuildLabel', () => {
    it('produces correctly formatted build label', async () => {
      const { formatBuildLabel } = await import('../buildInfo');
      const label = formatBuildLabel('1.2.3', 'abc1234', 'prod', '2025-12-02T09:15Z');
      expect(label).toBe('v1.2.3 #abc1234 · prod · 2025-12-02T09:15Z');
    });

    it('handles dev environment label', async () => {
      const { formatBuildLabel } = await import('../buildInfo');
      const label = formatBuildLabel('2.0.0', 'def5678', 'dev', '2025-01-01T00:00Z');
      expect(label).toBe('v2.0.0 #def5678 · dev · 2025-01-01T00:00Z');
    });

    it('handles local builds', async () => {
      const { formatBuildLabel } = await import('../buildInfo');
      const label = formatBuildLabel('1.0.0', 'local', 'dev', '2025-06-15T12:30Z');
      expect(label).toBe('v1.0.0 #local · dev · 2025-06-15T12:30Z');
    });
  });

  describe('buildInfo.buildLabel', () => {
    it('has correct format structure', async () => {
      const { buildInfo } = await import('../buildInfo');
      
      // Should match pattern: v{version} #{sha} · {env} · {time}
      expect(buildInfo.buildLabel).toMatch(
        /^v\d+\.\d+\.\d+ #[a-z0-9]+ · (prod|dev|test|staging) · \d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/
      );
    });

    it('contains the version', async () => {
      const { buildInfo } = await import('../buildInfo');
      expect(buildInfo.buildLabel).toContain('v1.3.0');
    });

    it('contains the short SHA with # prefix', async () => {
      const { buildInfo } = await import('../buildInfo');
      expect(buildInfo.buildLabel).toContain('#abc1234');
    });

    it('contains the formatted build time', async () => {
      const { buildInfo } = await import('../buildInfo');
      expect(buildInfo.buildLabel).toContain('2025-12-02T09:15Z');
    });

    it('uses · as separator', async () => {
      const { buildInfo } = await import('../buildInfo');
      // Format: "v1.3.0 #abc1234 · prod · 2025-12-02T09:15Z"
      // Should have exactly 2 "·" separators (between sha/env and env/time)
      const separators = buildInfo.buildLabel.match(/·/g);
      expect(separators).toHaveLength(2);
    });
  });

  describe('buildInfo completeness', () => {
    it('exports all required fields', async () => {
      const { buildInfo } = await import('../buildInfo');
      
      expect(buildInfo).toHaveProperty('version');
      expect(buildInfo).toHaveProperty('buildTime');
      expect(buildInfo).toHaveProperty('env');
      expect(buildInfo).toHaveProperty('commitSha');
      expect(buildInfo).toHaveProperty('shortSha');
      expect(buildInfo).toHaveProperty('buildLabel');
    });

    it('all fields are strings', async () => {
      const { buildInfo } = await import('../buildInfo');
      
      expect(typeof buildInfo.version).toBe('string');
      expect(typeof buildInfo.buildTime).toBe('string');
      expect(typeof buildInfo.env).toBe('string');
      expect(typeof buildInfo.commitSha).toBe('string');
      expect(typeof buildInfo.shortSha).toBe('string');
      expect(typeof buildInfo.buildLabel).toBe('string');
    });
  });
});

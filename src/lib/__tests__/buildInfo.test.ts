import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the build-time constants before importing buildInfo
vi.stubGlobal('__APP_VERSION__', '1.3.0');
vi.stubGlobal('__BUILD_TIME__', '2025-11-30T18:02:30.000Z');

describe('buildInfo', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('exports version as a defined string', async () => {
    const { buildInfo } = await import('../buildInfo');
    expect(buildInfo.version).toBeDefined();
    expect(typeof buildInfo.version).toBe('string');
    expect(buildInfo.version.length).toBeGreaterThan(0);
  });

  it('exports buildTime as a defined ISO string', async () => {
    const { buildInfo } = await import('../buildInfo');
    expect(buildInfo.buildTime).toBeDefined();
    expect(typeof buildInfo.buildTime).toBe('string');
    // Should be a valid ISO date string
    expect(buildInfo.buildTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });

  it('exports env as a valid environment string', async () => {
    const { buildInfo } = await import('../buildInfo');
    expect(buildInfo.env).toBeDefined();
    expect(typeof buildInfo.env).toBe('string');
    // In test environment, mode is typically 'test'
    expect(['development', 'production', 'test']).toContain(buildInfo.env);
  });

  it('getEnvLabel returns "prod" for production', async () => {
    const { getEnvLabel, buildInfo } = await import('../buildInfo');
    // Mock production environment
    const originalEnv = buildInfo.env;
    (buildInfo as any).env = 'production';
    expect(getEnvLabel()).toBe('prod');
    (buildInfo as any).env = originalEnv;
  });

  it('getEnvLabel returns "dev" for development', async () => {
    const { getEnvLabel, buildInfo } = await import('../buildInfo');
    const originalEnv = buildInfo.env;
    (buildInfo as any).env = 'development';
    expect(getEnvLabel()).toBe('dev');
    (buildInfo as any).env = originalEnv;
  });

  it('formatBuildTime removes seconds from ISO string', async () => {
    const { formatBuildTime } = await import('../buildInfo');
    const formatted = formatBuildTime();
    // Should not contain seconds (format: 2025-11-30T18:02Z)
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/);
    expect(formatted).not.toMatch(/:\d{2}\.\d{3}Z$/);
  });
});

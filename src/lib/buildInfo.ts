/**
 * Build information for the Focus Music app.
 * Values are injected at build time by Vite.
 * 
 * This module provides a single source of truth for build identification,
 * including the formatted buildLabel that appears in the Admin navbar.
 */

export interface BuildInfo {
  /** Semantic version from package.json (e.g., "1.3.0") */
  version: string;
  /** ISO timestamp when the build was created */
  buildTime: string;
  /** Current environment: "development", "production", or "test" */
  env: string;
  /** Full commit SHA or "local" for local builds */
  commitSha: string;
  /** Short commit SHA (first 7 chars) for display */
  shortSha: string;
  /** 
   * Formatted build label for display in Admin navbar.
   * Format: "v1.3.0 #e3519ee · prod · 2025-12-01T23:48Z"
   */
  buildLabel: string;
}

/**
 * Returns a short environment label for display.
 * "production" -> "prod", "development" -> "dev", otherwise as-is.
 */
export function getEnvLabel(env?: string): string {
  const envValue = env ?? import.meta.env.MODE;
  switch (envValue) {
    case 'production':
      return 'prod';
    case 'development':
      return 'dev';
    default:
      return envValue;
  }
}

/**
 * Formats an ISO timestamp for compact display.
 * Returns format: "2025-11-30T18:02Z" (removes seconds and milliseconds)
 */
export function formatBuildTime(isoString?: string): string {
  const time = isoString ?? __BUILD_TIME__;
  // Remove seconds and milliseconds for compact display
  return time.replace(/:\d{2}\.\d{3}Z$/, 'Z');
}

/**
 * Generates the standardized build label string.
 * Format: "v1.3.0 #e3519ee · prod · 2025-12-01T23:48Z"
 */
export function formatBuildLabel(
  version: string,
  shortSha: string,
  envLabel: string,
  formattedTime: string
): string {
  return `v${version} #${shortSha} · ${envLabel} · ${formattedTime}`;
}

// Compute derived values
const commitSha = __COMMIT_SHA__;
const shortSha = commitSha === 'local' ? 'local' : commitSha.slice(0, 7);
const envLabel = getEnvLabel();
const formattedTime = formatBuildTime();

export const buildInfo: BuildInfo = {
  version: __APP_VERSION__,
  buildTime: __BUILD_TIME__,
  env: import.meta.env.MODE,
  commitSha,
  shortSha,
  buildLabel: formatBuildLabel(__APP_VERSION__, shortSha, envLabel, formattedTime),
};

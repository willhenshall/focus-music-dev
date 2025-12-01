/**
 * Build information for the Focus Music app.
 * Values are injected at build time by Vite.
 */

export interface BuildInfo {
  /** Semantic version from package.json (e.g., "1.3.0") */
  version: string;
  /** ISO timestamp when the build was created */
  buildTime: string;
  /** Current environment: "development", "production", or "test" */
  env: string;
}

export const buildInfo: BuildInfo = {
  version: __APP_VERSION__,
  buildTime: __BUILD_TIME__,
  env: import.meta.env.MODE,
};

/**
 * Returns a short environment label for display.
 * "production" -> "prod", "development" -> "dev", otherwise as-is.
 */
export function getEnvLabel(): string {
  switch (buildInfo.env) {
    case 'production':
      return 'prod';
    case 'development':
      return 'dev';
    default:
      return buildInfo.env;
  }
}

/**
 * Formats the build time for compact display.
 * Returns format: "2025-11-30T18:02Z"
 */
export function formatBuildTime(): string {
  // Remove seconds and milliseconds for compact display
  return buildInfo.buildTime.replace(/:\d{2}\.\d{3}Z$/, 'Z');
}

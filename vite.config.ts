import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import * as fs from 'fs';
import * as path from 'path';

// Read version from package.json
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

// Plugin to auto-increment build version (only on production builds)
function buildVersionPlugin() {
  let hasIncremented = false;

  return {
    name: 'build-version',
    buildStart() {
      // Only increment once per build, and only in production mode
      if (!hasIncremented && process.env.NODE_ENV === 'production') {
        const versionFile = path.resolve(__dirname, 'src/buildVersion.ts');
        const content = fs.readFileSync(versionFile, 'utf-8');
        const match = content.match(/BUILD_VERSION = (\d+)/);

        if (match) {
          const currentVersion = parseInt(match[1]);
          const newVersion = currentVersion + 1;
          const newContent = content.replace(
            /BUILD_VERSION = \d+/,
            `BUILD_VERSION = ${newVersion}`
          );
          fs.writeFileSync(versionFile, newContent);
          console.log(`Build version incremented: ${currentVersion} -> ${newVersion}`);
          hasIncremented = true;
        }
      }
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), buildVersionPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});

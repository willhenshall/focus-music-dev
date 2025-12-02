import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'music.focus.app',
  appName: 'Focus Music',
  webDir: 'dist',
  
  // Server configuration for dev
  server: {
    // Use localhost for development
    url: process.env.NODE_ENV === 'development' 
      ? 'http://localhost:5173' 
      : undefined,
    cleartext: true,
  },
  
  // iOS-specific configuration
  ios: {
    // Enable background audio
    backgroundColor: '#000000',
    contentInset: 'automatic',
    // Custom URL scheme for deep linking
    scheme: 'focusmusic',
  },
  
  // Android-specific configuration  
  android: {
    backgroundColor: '#000000',
    // Enable background audio
    allowMixedContent: true,
  },
  
  // Plugin configuration
  plugins: {
    // Native audio will be handled by custom plugin
    // Additional plugins can be configured here
  },
};

export default config;

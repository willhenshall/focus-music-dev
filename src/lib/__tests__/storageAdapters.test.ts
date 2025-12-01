import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Storage Adapters Unit Tests
 * 
 * Verifies that audio URL generation works correctly for both:
 * - Cloudflare R2 CDN (primary)
 * - Supabase Storage (fallback)
 */

// Mock the supabase module to avoid actual API calls
vi.mock('../supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        getPublicUrl: vi.fn((path: string) => ({
          data: {
            publicUrl: `https://xewajlyswijmjxuajhif.supabase.co/storage/v1/object/public/audio-files/${path}`
          }
        }))
      }))
    }
  }
}));

describe('Storage Adapters', () => {
  // Store original env
  const originalEnv = { ...import.meta.env };

  beforeEach(() => {
    // Reset modules to pick up new env values
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original env
    Object.assign(import.meta.env, originalEnv);
  });

  describe('CloudFrontStorageAdapter (R2 CDN)', () => {
    it('generates correct R2 CDN URL from track ID', async () => {
      // Import the adapter class directly for isolated testing
      const { CloudFrontStorageAdapter } = await import('../storageAdapters');
      
      const adapter = new CloudFrontStorageAdapter({
        cdnDomain: 'pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev'
      });

      const url = await adapter.getAudioUrl('10021.mp3');
      
      expect(url).toBe('https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev/audio/10021.mp3');
    });

    it('extracts track ID from full Supabase URL and generates R2 URL', async () => {
      const { CloudFrontStorageAdapter } = await import('../storageAdapters');
      
      const adapter = new CloudFrontStorageAdapter({
        cdnDomain: 'pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev'
      });

      const supabaseUrl = 'https://xewajlyswijmjxuajhif.supabase.co/storage/v1/object/public/audio-files/146644.mp3';
      const url = await adapter.getAudioUrl(supabaseUrl);
      
      expect(url).toBe('https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev/audio/146644.mp3');
    });

    it('handles paths with leading slash', async () => {
      const { CloudFrontStorageAdapter } = await import('../storageAdapters');
      
      const adapter = new CloudFrontStorageAdapter({
        cdnDomain: 'pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev'
      });

      const url = await adapter.getAudioUrl('/12345.mp3');
      
      expect(url).toBe('https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev/audio/12345.mp3');
    });

    it('validates R2 CDN URLs correctly', async () => {
      const { CloudFrontStorageAdapter } = await import('../storageAdapters');
      
      const adapter = new CloudFrontStorageAdapter({
        cdnDomain: 'pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev'
      });

      expect(adapter.validateUrl('https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev/audio/10021.mp3')).toBe(true);
      expect(adapter.validateUrl('https://xewajlyswijmjxuajhif.supabase.co/storage/v1/object/public/audio-files/10021.mp3')).toBe(false);
    });
  });

  describe('SupabaseStorageAdapter', () => {
    it('generates Supabase Storage URL from file path', async () => {
      const { SupabaseStorageAdapter } = await import('../storageAdapters');
      
      const adapter = new SupabaseStorageAdapter();
      const url = await adapter.getAudioUrl('10021.mp3');
      
      expect(url).toContain('supabase.co');
      expect(url).toContain('audio-files');
      expect(url).toContain('10021.mp3');
    });

    it('returns URL directly if already a full URL', async () => {
      const { SupabaseStorageAdapter } = await import('../storageAdapters');
      
      const adapter = new SupabaseStorageAdapter();
      const existingUrl = 'https://example.com/audio/10021.mp3';
      const url = await adapter.getAudioUrl(existingUrl);
      
      expect(url).toBe(existingUrl);
    });

    it('validates Supabase URLs correctly', async () => {
      const { SupabaseStorageAdapter } = await import('../storageAdapters');
      
      const adapter = new SupabaseStorageAdapter();

      expect(adapter.validateUrl('https://xewajlyswijmjxuajhif.supabase.co/storage/v1/object/public/audio-files/10021.mp3')).toBe(true);
      expect(adapter.validateUrl('https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev/audio/10021.mp3')).toBe(false);
    });
  });

  describe('URL Pattern Verification', () => {
    it('R2 URL follows expected pattern: https://{domain}/audio/{trackId}.mp3', async () => {
      const { CloudFrontStorageAdapter } = await import('../storageAdapters');
      
      const adapter = new CloudFrontStorageAdapter({
        cdnDomain: 'pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev'
      });

      const testCases = [
        { input: '10021.mp3', expectedId: '10021' },
        { input: '146644.mp3', expectedId: '146644' },
        { input: '/179117.mp3', expectedId: '179117' },
      ];

      for (const { input, expectedId } of testCases) {
        const url = await adapter.getAudioUrl(input);
        expect(url).toBe(`https://pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev/audio/${expectedId}.mp3`);
      }
    });

    it('R2 URL does NOT contain supabase.co', async () => {
      const { CloudFrontStorageAdapter } = await import('../storageAdapters');
      
      const adapter = new CloudFrontStorageAdapter({
        cdnDomain: 'pub-16f9274cf01948468de2d5af8a6fdb23.r2.dev'
      });

      const url = await adapter.getAudioUrl('10021.mp3');
      
      expect(url).not.toContain('supabase.co');
      expect(url).toContain('r2.dev');
    });
  });
});

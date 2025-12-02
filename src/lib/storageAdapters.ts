/**
 * Storage Adapters for CDN-Ready Audio Delivery
 *
 * Provides flexible backend switching between:
 * - Supabase Storage (development)
 * - CloudFront CDN (production)
 * - S3 Direct (fallback)
 * - HLS Streaming (for iOS and progressive streaming)
 *
 * Architecture allows hot-swapping storage providers without code changes
 */

import { supabase } from './supabase';
import type { StorageAdapter } from './enterpriseAudioEngine';

// ============================================================================
// HLS STORAGE ADAPTER INTERFACE
// ============================================================================

export interface HLSStorageAdapter extends StorageAdapter {
  /** Get the HLS manifest URL for a track */
  getHLSUrl(trackId: string, hlsPath: string): Promise<string>;
  /** Check if HLS is available for a track */
  hasHLSSupport(trackId: string): Promise<boolean>;
}

export class SupabaseStorageAdapter implements HLSStorageAdapter {
  name = 'Supabase Storage';
  private urlCache: Map<string, { url: string; expiresAt: number }> = new Map();
  private hlsCache: Map<string, boolean> = new Map();
  private cacheDuration = 3600000; // 1 hour

  async getAudioUrl(filePath: string): Promise<string> {
    // If filePath is already a full public URL, use it directly
    // The audio-files bucket is public, so we don't need signed URLs
    if (filePath.startsWith('http')) {
      return filePath;
    }

    // Check cache for non-URL paths
    const cached = this.urlCache.get(filePath);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.url;
    }

    // For relative paths, generate public URL
    const { data } = supabase.storage
      .from('audio-files')
      .getPublicUrl(filePath);

    if (!data?.publicUrl) {
      throw new Error(`Failed to get audio URL for ${filePath}`);
    }

    this.urlCache.set(filePath, {
      url: data.publicUrl,
      expiresAt: Date.now() + this.cacheDuration,
    });

    return data.publicUrl;
  }

  /**
   * Get HLS manifest URL for a track
   * Returns the master.m3u8 URL from the audio-hls bucket
   */
  async getHLSUrl(trackId: string, hlsPath: string): Promise<string> {
    const cacheKey = `hls:${trackId}`;
    const cached = this.urlCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.url;
    }

    const { data } = supabase.storage
      .from('audio-hls')
      .getPublicUrl(hlsPath);

    if (!data?.publicUrl) {
      throw new Error(`Failed to get HLS URL for ${trackId}`);
    }

    this.urlCache.set(cacheKey, {
      url: data.publicUrl,
      expiresAt: Date.now() + this.cacheDuration,
    });

    return data.publicUrl;
  }

  /**
   * Check if HLS is available for a track
   * Uses cached result when available
   */
  async hasHLSSupport(trackId: string): Promise<boolean> {
    if (this.hlsCache.has(trackId)) {
      return this.hlsCache.get(trackId)!;
    }

    try {
      // Check if master.m3u8 exists in HLS bucket
      const { data, error } = await supabase.storage
        .from('audio-hls')
        .list(trackId, { limit: 1 });

      const hasHLS = !error && data && data.length > 0;
      this.hlsCache.set(trackId, hasHLS);
      return hasHLS;
    } catch {
      this.hlsCache.set(trackId, false);
      return false;
    }
  }

  validateUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.includes('supabase');
    } catch {
      return false;
    }
  }

  clearCache(): void {
    this.urlCache.clear();
    this.hlsCache.clear();
  }
}

export class CloudFrontStorageAdapter implements HLSStorageAdapter {
  name = 'Cloudflare CDN';
  private cdnDomain: string;
  // Signing config for future signed URL support
  private _signingEnabled: boolean;
  private _signingKey?: string;
  private urlCache: Map<string, { url: string; expiresAt: number }> = new Map();
  private hlsCache: Map<string, boolean> = new Map();
  private cacheDuration = 3600000; // 1 hour

  constructor(config: {
    cdnDomain: string;
    signingEnabled?: boolean;
    signingKey?: string;
  }) {
    this.cdnDomain = config.cdnDomain;
    this._signingEnabled = config.signingEnabled || false;
    this._signingKey = config.signingKey;
  }

  async getAudioUrl(filePath: string): Promise<string> {
    console.log('[CDN ADAPTER] getAudioUrl called with filePath:', filePath);
    console.log('[CDN ADAPTER] cdnDomain:', this.cdnDomain);

    const cached = this.urlCache.get(filePath);
    if (cached && cached.expiresAt > Date.now()) {
      console.log('[CDN ADAPTER] Returning cached URL:', cached.url);
      return cached.url;
    }

    let trackId: string;

    // Handle different file_path formats:
    // 1. Full Supabase URL: https://xxx.supabase.co/storage/v1/object/public/audio-files/146644.mp3
    // 2. Relative path: 146644.mp3 or /146644.mp3
    if (filePath.startsWith('http')) {
      // Extract track ID from full URL
      const urlMatch = filePath.match(/\/([^\/]+)\.mp3$/);
      if (urlMatch) {
        trackId = urlMatch[1];
      } else {
        throw new Error(`Could not extract track ID from URL: ${filePath}`);
      }
    } else {
      // Handle relative path
      let cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
      trackId = cleanPath.replace(/\.mp3$/i, '');
    }

    console.log('[CDN ADAPTER] Extracted trackId:', trackId);

    // Construct CDN URL: https://media.focus.music/audio/{track_id}.mp3
    const cdnUrl = `https://${this.cdnDomain}/audio/${trackId}.mp3`;
    console.log('[CDN ADAPTER] Generated CDN URL:', cdnUrl);

    // Cache the URL for 1 hour
    this.urlCache.set(filePath, {
      url: cdnUrl,
      expiresAt: Date.now() + this.cacheDuration,
    });

    return cdnUrl;
  }

  /**
   * Get HLS manifest URL from CDN
   * Assumes HLS files are mirrored to CDN at /hls/{trackId}/master.m3u8
   * @param trackId - The track identifier
   * @param _hlsPath - The HLS path (unused, kept for interface compatibility)
   */
  async getHLSUrl(trackId: string, _hlsPath: string): Promise<string> {
    const cacheKey = `hls:${trackId}`;
    const cached = this.urlCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.url;
    }

    // CDN HLS URL pattern: https://media.focus.music/hls/{track_id}/master.m3u8
    const hlsUrl = `https://${this.cdnDomain}/hls/${trackId}/master.m3u8`;

    this.urlCache.set(cacheKey, {
      url: hlsUrl,
      expiresAt: Date.now() + this.cacheDuration,
    });

    return hlsUrl;
  }

  /**
   * Check if HLS is available via CDN
   * Does a HEAD request to verify the manifest exists
   */
  async hasHLSSupport(trackId: string): Promise<boolean> {
    if (this.hlsCache.has(trackId)) {
      return this.hlsCache.get(trackId)!;
    }

    try {
      const hlsUrl = `https://${this.cdnDomain}/hls/${trackId}/master.m3u8`;
      const response = await fetch(hlsUrl, { method: 'HEAD' });
      const hasHLS = response.ok;
      this.hlsCache.set(trackId, hasHLS);
      return hasHLS;
    } catch {
      this.hlsCache.set(trackId, false);
      return false;
    }
  }

  private async generateSignedUrl(url: string): Promise<string> {
    const expirationTime = Math.floor(Date.now() / 1000) + 3600;
    return `${url}?Expires=${expirationTime}&Signature=placeholder`;
  }

  validateUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname === this.cdnDomain;
    } catch {
      return false;
    }
  }

  getRegionalEndpoint(region: string): string {
    return `${this.cdnDomain}-${region}`;
  }

  clearCache(): void {
    this.urlCache.clear();
    this.hlsCache.clear();
  }
}

export class S3StorageAdapter implements StorageAdapter {
  name = 'Amazon S3';
  private bucketName: string;
  private region: string;
  private accessKeyId?: string;
  private secretAccessKey?: string;

  constructor(config: {
    bucketName: string;
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  }) {
    this.bucketName = config.bucketName;
    this.region = config.region;
    this.accessKeyId = config.accessKeyId;
    this.secretAccessKey = config.secretAccessKey;
  }

  async getAudioUrl(filePath: string): Promise<string> {
    const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;

    if (this.accessKeyId && this.secretAccessKey) {
      return this.generatePresignedUrl(cleanPath);
    }

    return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${cleanPath}`;
  }

  private async generatePresignedUrl(filePath: string): Promise<string> {
    const baseUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${filePath}`;
    return `${baseUrl}?X-Amz-Algorithm=AWS4-HMAC-SHA256`;
  }

  validateUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.includes('s3') || urlObj.hostname.includes(this.bucketName);
    } catch {
      return false;
    }
  }

  getRegionalEndpoint(region: string): string {
    return `${this.bucketName}.s3.${region}.amazonaws.com`;
  }
}

export class MultiCDNStorageAdapter implements StorageAdapter {
  name = 'Multi-CDN (Failover)';
  private primaryAdapter: StorageAdapter;
  private fallbackAdapters: StorageAdapter[];
  private failureThreshold = 3;
  private failureCounts: Map<string, number> = new Map();

  constructor(primary: StorageAdapter, fallbacks: StorageAdapter[]) {
    this.primaryAdapter = primary;
    this.fallbackAdapters = fallbacks;
  }

  async getAudioUrl(filePath: string): Promise<string> {
    const adapters = [this.primaryAdapter, ...this.fallbackAdapters];

    for (const adapter of adapters) {
      const failures = this.failureCounts.get(adapter.name) || 0;

      if (failures >= this.failureThreshold) {
        continue;
      }

      try {
        const url = await adapter.getAudioUrl(filePath);

        if (adapter.validateUrl(url)) {
          this.failureCounts.set(adapter.name, 0);
          return url;
        }
      } catch (error) {
        this.failureCounts.set(adapter.name, failures + 1);
        continue;
      }
    }

    throw new Error('All CDN adapters failed to provide valid URL');
  }

  validateUrl(url: string): boolean {
    return this.primaryAdapter.validateUrl(url) ||
           this.fallbackAdapters.some(adapter => adapter.validateUrl(url));
  }

  resetFailureCounts(): void {
    this.failureCounts.clear();
  }
}

export function createStorageAdapter(): StorageAdapter {
  const storageBackend = import.meta.env.VITE_STORAGE_BACKEND || 'supabase';
  const cdnDomain = import.meta.env.VITE_CDN_DOMAIN || import.meta.env.VITE_CLOUDFRONT_DOMAIN || '';

  console.log('[STORAGE ADAPTER] Creating adapter with config:', {
    backend: storageBackend,
    cdnDomain,
    allEnvVars: {
      VITE_STORAGE_BACKEND: import.meta.env.VITE_STORAGE_BACKEND,
      VITE_CDN_DOMAIN: import.meta.env.VITE_CDN_DOMAIN,
    }
  });

  switch (storageBackend.toLowerCase()) {
    case 'cloudfront':
      console.log('[STORAGE ADAPTER] Creating CloudFront adapter with domain:', cdnDomain);
      return new CloudFrontStorageAdapter({
        cdnDomain,
        signingEnabled: import.meta.env.VITE_CLOUDFRONT_SIGNING_ENABLED === 'true',
        signingKey: import.meta.env.VITE_CLOUDFRONT_SIGNING_KEY,
      });

    case 's3':
      return new S3StorageAdapter({
        bucketName: import.meta.env.VITE_S3_BUCKET || '',
        region: import.meta.env.VITE_S3_REGION || 'us-east-1',
        accessKeyId: import.meta.env.VITE_S3_ACCESS_KEY_ID,
        secretAccessKey: import.meta.env.VITE_S3_SECRET_ACCESS_KEY,
      });

    case 'multi-cdn':
      const primary = new CloudFrontStorageAdapter({
        cdnDomain: import.meta.env.VITE_CDN_DOMAIN || import.meta.env.VITE_CLOUDFRONT_DOMAIN || '',
      });
      const fallback = new SupabaseStorageAdapter();
      return new MultiCDNStorageAdapter(primary, [fallback]);

    case 'supabase':
    default:
      return new SupabaseStorageAdapter();
  }
}

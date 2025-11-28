/**
 * Image processing utilities for resizing and metadata extraction
 */

export interface ImageMetadata {
  originalFilename: string;
  creator?: string;
  copyright?: string;
  width: number;
  height: number;
}

/**
 * Resize image to target dimensions while maintaining aspect ratio
 */
export async function resizeImage(
  file: File,
  targetWidth: number = 1920,
  targetHeight: number = 1080
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    img.onload = () => {
      // Calculate dimensions to COVER target (crop to fill, no letterboxing)
      const sourceAspectRatio = img.width / img.height;
      const targetAspectRatio = targetWidth / targetHeight;

      let drawWidth, drawHeight, offsetX, offsetY;

      if (sourceAspectRatio > targetAspectRatio) {
        // Source is wider - fit to height and crop width
        drawHeight = targetHeight;
        drawWidth = img.width * (targetHeight / img.height);
        offsetX = (targetWidth - drawWidth) / 2;
        offsetY = 0;
      } else {
        // Source is taller - fit to width and crop height
        drawWidth = targetWidth;
        drawHeight = img.height * (targetWidth / img.width);
        offsetX = 0;
        offsetY = (targetHeight - drawHeight) / 2;
      }

      // Set canvas size to exact target dimensions
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      // Draw image scaled to cover entire canvas (crops if needed)
      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

      // Convert to blob with optimized quality for web display
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob'));
          }
        },
        'image/jpeg',
        0.85 // 85% quality - industry standard for optimized display
      );
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    img.src = URL.createObjectURL(file);
  });
}

/**
 * Extract EXIF metadata from image file
 * Note: This is a basic implementation. For production, consider using a library like exif-js
 */
export async function extractImageMetadata(file: File): Promise<ImageMetadata> {
  const metadata: ImageMetadata = {
    originalFilename: file.name,
    width: 0,
    height: 0,
  };

  return new Promise((resolve) => {
    const img = new Image();

    img.onload = () => {
      metadata.width = img.naturalWidth;
      metadata.height = img.naturalHeight;

      // Try to extract EXIF data if available
      // Note: Browser APIs don't provide direct EXIF access
      // For now, we'll parse filename for creator info as a fallback
      // In production, you'd use a proper EXIF library or server-side processing

      resolve(metadata);
    };

    img.onerror = () => {
      // Return basic metadata even if image load fails
      resolve(metadata);
    };

    img.src = URL.createObjectURL(file);
  });
}

/**
 * Process image for upload: resize and extract metadata
 */
export async function processImageForUpload(
  file: File
): Promise<{ blob: Blob; metadata: ImageMetadata }> {
  // Extract metadata from original
  const metadata = await extractImageMetadata(file);

  // Check if resize is needed
  if (metadata.width <= 1920 && metadata.height <= 1080) {
    // Image is already small enough, use original
    return { blob: file, metadata };
  }

  // Resize image
  const blob = await resizeImage(file, 1920, 1080);

  // Update metadata with new dimensions
  metadata.width = 1920;
  metadata.height = 1080;

  return { blob, metadata };
}

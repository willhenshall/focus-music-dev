/**
 * Generate favicon.ico without external dependencies
 * Creates a simple "fm" favicon matching the app's branding
 * 
 * Run with: npx tsx scripts/generate-favicon-simple.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple 16x16 bitmap for "fm" favicon
// This is a manually crafted pixel array representing "fm" text
// Background: #0f172a (dark slate), Text: white

function createBitmapData(size: 16 | 32): Uint8Array {
  // Create RGBA pixel data
  const pixels = new Uint8Array(size * size * 4);
  
  // Background color: #0f172a (slate-900)
  const bgR = 0x0f, bgG = 0x17, bgB = 0x2a;
  // Text color: white
  const fgR = 0xff, fgG = 0xff, fgB = 0xff;
  
  // Fill with background
  for (let i = 0; i < size * size; i++) {
    pixels[i * 4 + 0] = bgR;
    pixels[i * 4 + 1] = bgG;
    pixels[i * 4 + 2] = bgB;
    pixels[i * 4 + 3] = 255;
  }
  
  // Draw rounded corners (make corner pixels transparent-ish)
  const setPixel = (x: number, y: number, r: number, g: number, b: number, a: number = 255) => {
    if (x >= 0 && x < size && y >= 0 && y < size) {
      const idx = (y * size + x) * 4;
      pixels[idx + 0] = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
      pixels[idx + 3] = a;
    }
  };
  
  // Round corners slightly (2px radius for 16x16, 4px for 32x32)
  const cornerRadius = size === 16 ? 2 : 4;
  for (let i = 0; i < cornerRadius; i++) {
    for (let j = 0; j < cornerRadius - i; j++) {
      // Top-left
      setPixel(i, j, 0, 0, 0, 0);
      // Top-right
      setPixel(size - 1 - i, j, 0, 0, 0, 0);
      // Bottom-left
      setPixel(i, size - 1 - j, 0, 0, 0, 0);
      // Bottom-right
      setPixel(size - 1 - i, size - 1 - j, 0, 0, 0, 0);
    }
  }
  
  if (size === 16) {
    // 16x16 "fm" design - manually crafted pixel art
    // "f" is bolder (2px wide), "m" is lighter (1px wide stems)
    const fm16 = [
      // Row by row, which pixels are white (for text)
      // Format: [y, ...x coordinates]
      // "f" letter (columns 2-6), bold style
      [3, 4, 5],           // top of f
      [4, 3, 4],           // 
      [5, 3, 4],           // stem
      [6, 3, 4],           //
      [7, 2, 3, 4, 5],     // crossbar
      [8, 3, 4],           //
      [9, 3, 4],           // stem continues
      [10, 3, 4],          //
      [11, 3, 4],          //
      [12, 3, 4],          // bottom of f
      
      // "m" letter (columns 8-14), normal weight
      [6, 8, 9, 11, 12, 13], // top connections
      [7, 8, 10, 13],        // stems going down
      [8, 8, 10, 13],        //
      [9, 8, 10, 13],        //
      [10, 8, 10, 13],       //
      [11, 8, 10, 13],       //
      [12, 8, 10, 13],       // bottom of m
    ];
    
    for (const row of fm16) {
      const y = row[0];
      for (let i = 1; i < row.length; i++) {
        setPixel(row[i], y, fgR, fgG, fgB);
      }
    }
  } else {
    // 32x32 "fm" design - larger, clearer
    const fm32 = [
      // "f" letter (columns 5-13), bold
      [6, 9, 10, 11, 12],
      [7, 7, 8, 9, 10],
      [8, 6, 7, 8],
      [9, 6, 7, 8],
      [10, 6, 7, 8],
      [11, 6, 7, 8],
      [12, 6, 7, 8],
      [13, 6, 7, 8],
      [14, 4, 5, 6, 7, 8, 9, 10, 11], // crossbar
      [15, 4, 5, 6, 7, 8, 9, 10, 11], // crossbar
      [16, 6, 7, 8],
      [17, 6, 7, 8],
      [18, 6, 7, 8],
      [19, 6, 7, 8],
      [20, 6, 7, 8],
      [21, 6, 7, 8],
      [22, 6, 7, 8],
      [23, 6, 7, 8],
      [24, 6, 7, 8],
      [25, 6, 7, 8],
      
      // "m" letter (columns 15-28), regular weight
      [13, 15, 16, 18, 19, 20, 22, 23, 24, 25, 26],
      [14, 15, 16, 17, 18, 21, 22, 25, 26, 27],
      [15, 15, 16, 17, 21, 22, 26, 27],
      [16, 15, 16, 21, 22, 26, 27],
      [17, 15, 16, 21, 22, 26, 27],
      [18, 15, 16, 21, 22, 26, 27],
      [19, 15, 16, 21, 22, 26, 27],
      [20, 15, 16, 21, 22, 26, 27],
      [21, 15, 16, 21, 22, 26, 27],
      [22, 15, 16, 21, 22, 26, 27],
      [23, 15, 16, 21, 22, 26, 27],
      [24, 15, 16, 21, 22, 26, 27],
      [25, 15, 16, 21, 22, 26, 27],
    ];
    
    for (const row of fm32) {
      const y = row[0];
      for (let i = 1; i < row.length; i++) {
        setPixel(row[i], y, fgR, fgG, fgB);
      }
    }
  }
  
  return pixels;
}

function createBMPData(size: 16 | 32): Buffer {
  const width = size;
  const height = size;
  const pixels = createBitmapData(size);
  
  // BMP for ICO is stored bottom-up, BGRA format, with AND mask
  const rowSize = width * 4;
  const pixelDataSize = rowSize * height;
  const andMaskRowSize = Math.ceil(width / 8);
  const andMaskPaddedRowSize = Math.ceil(andMaskRowSize / 4) * 4;
  const andMaskSize = andMaskPaddedRowSize * height;
  
  // BITMAPINFOHEADER is 40 bytes
  const headerSize = 40;
  const totalSize = headerSize + pixelDataSize + andMaskSize;
  
  const buffer = Buffer.alloc(totalSize);
  let offset = 0;
  
  // BITMAPINFOHEADER
  buffer.writeUInt32LE(40, offset); offset += 4;           // biSize
  buffer.writeInt32LE(width, offset); offset += 4;         // biWidth
  buffer.writeInt32LE(height * 2, offset); offset += 4;    // biHeight (doubled for ICO)
  buffer.writeUInt16LE(1, offset); offset += 2;            // biPlanes
  buffer.writeUInt16LE(32, offset); offset += 2;           // biBitCount
  buffer.writeUInt32LE(0, offset); offset += 4;            // biCompression (BI_RGB)
  buffer.writeUInt32LE(pixelDataSize + andMaskSize, offset); offset += 4; // biSizeImage
  buffer.writeInt32LE(0, offset); offset += 4;             // biXPelsPerMeter
  buffer.writeInt32LE(0, offset); offset += 4;             // biYPelsPerMeter
  buffer.writeUInt32LE(0, offset); offset += 4;            // biClrUsed
  buffer.writeUInt32LE(0, offset); offset += 4;            // biClrImportant
  
  // Pixel data (bottom-up, BGRA)
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const r = pixels[srcIdx + 0];
      const g = pixels[srcIdx + 1];
      const b = pixels[srcIdx + 2];
      const a = pixels[srcIdx + 3];
      
      buffer[offset++] = b;  // Blue
      buffer[offset++] = g;  // Green
      buffer[offset++] = r;  // Red
      buffer[offset++] = a;  // Alpha
    }
  }
  
  // AND mask (1-bit mask, bottom-up)
  // For 32-bit images with alpha, AND mask should be all zeros
  for (let y = height - 1; y >= 0; y--) {
    for (let i = 0; i < andMaskPaddedRowSize; i++) {
      buffer[offset++] = 0;
    }
  }
  
  return buffer;
}

function createICO(sizes: (16 | 32)[]): Buffer {
  const images = sizes.map(size => ({
    size,
    data: createBMPData(size)
  }));
  
  // ICO header: 6 bytes
  const headerSize = 6;
  const dirEntrySize = 16;
  
  let dataOffset = headerSize + (dirEntrySize * images.length);
  
  // Calculate total size
  let totalSize = dataOffset;
  for (const img of images) {
    totalSize += img.data.length;
  }
  
  const buffer = Buffer.alloc(totalSize);
  let offset = 0;
  
  // ICO header
  buffer.writeUInt16LE(0, offset); offset += 2;              // Reserved
  buffer.writeUInt16LE(1, offset); offset += 2;              // Type: 1 = ICO
  buffer.writeUInt16LE(images.length, offset); offset += 2;  // Number of images
  
  // Directory entries
  let currentDataOffset = dataOffset;
  for (const img of images) {
    buffer.writeUInt8(img.size, offset); offset += 1;        // Width
    buffer.writeUInt8(img.size, offset); offset += 1;        // Height
    buffer.writeUInt8(0, offset); offset += 1;               // Color palette
    buffer.writeUInt8(0, offset); offset += 1;               // Reserved
    buffer.writeUInt16LE(1, offset); offset += 2;            // Color planes
    buffer.writeUInt16LE(32, offset); offset += 2;           // Bits per pixel
    buffer.writeUInt32LE(img.data.length, offset); offset += 4;  // Image size
    buffer.writeUInt32LE(currentDataOffset, offset); offset += 4; // Offset
    currentDataOffset += img.data.length;
  }
  
  // Image data
  for (const img of images) {
    img.data.copy(buffer, offset);
    offset += img.data.length;
  }
  
  return buffer;
}

async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const publicDir = path.join(projectRoot, 'public');
  
  // Ensure public directory exists
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  
  console.log('Generating favicon.ico...');
  
  // Create ICO with 16x16 and 32x32 images
  const icoBuffer = createICO([16, 32]);
  const icoPath = path.join(publicDir, 'favicon.ico');
  fs.writeFileSync(icoPath, icoBuffer);
  
  console.log(`✓ Created: ${icoPath}`);
  console.log('\nFavicon generation complete!');
  console.log('\nThe favicon shows "fm" with:');
  console.log('  - "f" in bold (matching "focus" in the logo)');
  console.log('  - "m" in regular weight (matching "music" in the logo)');
  console.log('  - Dark slate background (#0f172a)');
}

main().catch(console.error);

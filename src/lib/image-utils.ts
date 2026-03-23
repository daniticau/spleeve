/**
 * Resize an image file to a square JPEG suitable for album art embedding.
 * Center-crops if not already square, then scales to target size.
 */
export async function resizeToSquare(
  source: File | Blob | string,
  size: number = 600,
): Promise<ArrayBuffer> {
  const img = await loadImage(source);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');

  // Center crop to square
  const srcSize = Math.min(img.naturalWidth, img.naturalHeight);
  const srcX = (img.naturalWidth - srcSize) / 2;
  const srcY = (img.naturalHeight - srcSize) / 2;

  ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, size, size);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to encode image'))),
      'image/jpeg',
      0.92,
    );
  });

  return blob.arrayBuffer();
}

function loadImage(source: File | Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = typeof source !== 'string' ? URL.createObjectURL(source) : null;

    img.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };

    if (typeof source === 'string') {
      img.crossOrigin = 'anonymous';
      img.src = source;
    } else {
      img.src = objectUrl!;
    }
  });
}

/**
 * Convert an ArrayBuffer of image data to an object URL for display.
 */
export function arrayBufferToObjectUrl(
  buffer: ArrayBuffer,
  mime: string,
): string {
  const blob = new Blob([buffer], { type: mime });
  return URL.createObjectURL(blob);
}

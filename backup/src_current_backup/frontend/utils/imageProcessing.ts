/**
 * Utility functions for image processing using Canvas API
 */

/**
 * Convert an image file or blob to base64 with optional resizing
 */
export const fileToBase64 = async (file: File | Blob, maxSize = 800): Promise<string | null> => {
  try {
    // Create URL from file
    const url = URL.createObjectURL(file);

    // Create image element
    const img = new Image();
    img.crossOrigin = 'anonymous';

    // Wait for image to load
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });

    // Create canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Could not get canvas context');
    }

    // Calculate dimensions
    let width = img.width;
    let height = img.height;

    // Resize if needed
    if (width > height) {
      if (width > maxSize) {
        height = Math.round((height * maxSize) / width);
        width = maxSize;
      }
    } else {
      if (height > maxSize) {
        width = Math.round((width * maxSize) / height);
        height = maxSize;
      }
    }

    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    // Draw with black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    // Convert to base64
    const base64 = canvas.toDataURL('image/jpeg', 0.85);

    // Cleanup
    URL.revokeObjectURL(url);

    return base64;
  } catch (error) {
    console.error('Error converting file to base64:', error);
    return null;
  }
};

/**
 * Convert base64 string to optimized base64 image
 */
export const processBase64Image = async (base64Data: string, maxSize = 800): Promise<string | null> => {
  try {
    // Create image element
    const img = new Image();
    img.crossOrigin = 'anonymous';

    // Wait for image to load
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = base64Data.startsWith('data:') ? base64Data : `data:image/jpeg;base64,${base64Data}`;
    });

    // Create canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Could not get canvas context');
    }

    // Calculate dimensions
    let width = img.width;
    let height = img.height;

    // Resize if needed
    if (width > height) {
      if (width > maxSize) {
        height = Math.round((height * maxSize) / width);
        width = maxSize;
      }
    } else {
      if (height > maxSize) {
        width = Math.round((width * maxSize) / height);
        height = maxSize;
      }
    }

    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    // Draw with black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    // Convert to base64
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch (error) {
    console.error('Error processing base64 image:', error);
    return null;
  }
};

/**
 * Clean and validate base64 string
 */
export const cleanBase64 = (base64Data: string): string | null => {
  try {
    // If it's a data URL, extract the base64 part
    if (base64Data.startsWith('data:')) {
      const [, base64] = base64Data.split(',');
      if (!base64) return null;
      base64Data = base64;
    }

    // Clean the base64 data
    const cleanedBase64 = base64Data
      .replace(/[\r\n\t\f\v ]+/g, '') // Remove all whitespace
      .replace(/[^A-Za-z0-9+/=]/g, '') // Remove invalid characters
      .replace(/=+$/, ''); // Remove trailing equals

    // Re-add proper padding
    const padding = cleanedBase64.length % 4;
    const paddedBase64 = padding > 0 
      ? cleanedBase64 + '='.repeat(4 - padding)
      : cleanedBase64;

    // Verify the cleaned base64 data
    const decoded = atob(paddedBase64);
    if (decoded.length === 0) return null;

    return paddedBase64;
  } catch (error) {
    console.error('Error cleaning base64:', error);
    return null;
  }
}; 
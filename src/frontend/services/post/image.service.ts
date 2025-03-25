import { ImageData } from './types';

/**
 * Process an image file to get base64 and metadata
 */
export async function processImage(file: File): Promise<{ base64Data: string; metadata: ImageData['metadata'] }> {
    return new Promise((resolve, reject) => {
        // Get original format from file type
        const format = file.type.split('/')[1].toLowerCase();
        
        // List of supported web formats
        const supportedWebFormats = ['jpeg', 'jpg', 'png', 'gif', 'webp', 'bmp', 'svg+xml', 'tiff'];
        
        // Keep original format if it's web-supported, otherwise use PNG
        let outputFormat = supportedWebFormats.includes(format) ? format : 'png';
        
        // Normalize format names for consistency
        if (outputFormat === 'svg+xml') outputFormat = 'svg';
        if (outputFormat === 'jpg') outputFormat = 'jpeg';
        
        // Create URL from file
        const url = URL.createObjectURL(file);
        
        // Create image element
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        // Create canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
            URL.revokeObjectURL(url);
            reject(new Error('Could not get canvas context'));
            return;
        }
        
        // Wait for image to load
        img.onload = () => {
            try {
                // Calculate dimensions
                let width = img.width;
                let height = img.height;
                
                // Resize if needed (max 800px while maintaining aspect ratio)
                const maxSize = 800;
                if (width > maxSize || height > maxSize) {
                    if (width > height) {
                        height = Math.round((height * maxSize) / width);
                        width = maxSize;
                    } else {
                        width = Math.round((width * maxSize) / height);
                        height = maxSize;
                    }
                }
                
                // Set canvas size
                canvas.width = width;
                canvas.height = height;
                
                // Draw image
                ctx.drawImage(img, 0, 0, width, height);
                
                // Get base64 data
                const base64Data = canvas.toDataURL(`image/${outputFormat}`).split(',')[1];
                
                // Get file size
                const byteString = atob(base64Data);
                const size = byteString.length;
                
                // Cleanup
                URL.revokeObjectURL(url);
                
                resolve({
                    base64Data,
                    metadata: {
                        width,
                        height,
                        format: outputFormat,
                        size
                    }
                });
            } catch (error) {
                console.error('Error processing image:', error);
                URL.revokeObjectURL(url);
                reject(error);
            }
        };
        
        img.onerror = (error) => {
            console.error('Error loading image:', error);
            URL.revokeObjectURL(url);
            reject(error);
        };
        
        img.src = url;
    });
}

/**
 * Convert File to base64
 */
export function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Get image metadata
 */
export async function getImageMetadata(file: File): Promise<ImageData['metadata']> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            resolve({
                width: img.width,
                height: img.height,
                format: file.type.split('/')[1],
                size: file.size
            });
        };
        img.src = URL.createObjectURL(file);
    });
} 
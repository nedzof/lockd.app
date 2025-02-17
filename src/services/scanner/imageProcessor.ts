import { Buffer } from 'buffer';
import { Image, decode } from 'imagescript';

export interface ImageOutput {
    mimeType: string;
    rawData: string;
    dataURL: string;
}

export interface ImageMetadata {
    width: number;
    height: number;
    format: string;
    mimeType: string;
    size: number;
    originalName?: string;
}

export interface ProcessedImage {
    metadata: ImageMetadata;
    data: Buffer;
    dataUrl?: string;
}

const SUPPORTED_FORMATS = {
    JPEG: {
        mimeType: 'image/jpeg',
        signatures: [[0xFF, 0xD8, 0xFF]],
        extensions: ['.jpg', '.jpeg']
    },
    PNG: {
        mimeType: 'image/png',
        signatures: [[0x89, 0x50, 0x4E, 0x47]],
        extensions: ['.png']
    },
    GIF: {
        mimeType: 'image/gif',
        signatures: [[0x47, 0x49, 0x46, 0x38]],
        extensions: ['.gif']
    },
    WEBP: {
        mimeType: 'image/webp',
        signatures: [[0x52, 0x49, 0x46, 0x46]],
        extensions: ['.webp']
    }
};

export async function extractImageFromTransaction(tx: any): Promise<ImageOutput | null> {
    try {
        // Find the transaction data that contains the image
        const imageData = tx.transaction;
        if (!imageData) {
            console.log('No transaction data found');
            return null;
        }

        // Get the content type from the data array
        const contentTypeEntry = tx.data?.find((item: string) => item.includes('contenttype='));
        const mimeType = contentTypeEntry ? contentTypeEntry.split('=')[1] : 'image/png';

        // Convert the transaction data to a Buffer
        const buffer = Buffer.from(imageData, 'base64');

        // Find the JFIF marker in the buffer (FF D8 FF E0)
        const jfifMarker = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
        let startIndex = -1;
        
        for (let i = 0; i < buffer.length - jfifMarker.length; i++) {
            if (buffer[i] === jfifMarker[0] && 
                buffer[i + 1] === jfifMarker[1] && 
                buffer[i + 2] === jfifMarker[2] && 
                buffer[i + 3] === jfifMarker[3]) {
                startIndex = i;
                break;
            }
        }

        if (startIndex === -1) {
            // Try looking for PNG signature (89 50 4E 47)
            const pngMarker = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
            for (let i = 0; i < buffer.length - pngMarker.length; i++) {
                if (buffer[i] === pngMarker[0] && 
                    buffer[i + 1] === pngMarker[1] && 
                    buffer[i + 2] === pngMarker[2] && 
                    buffer[i + 3] === pngMarker[3]) {
                    startIndex = i;
                    break;
                }
            }
        }

        if (startIndex === -1) {
            console.log('No image markers found in transaction data');
            return null;
        }

        // Extract the image data from the buffer
        const imageBuffer = buffer.slice(startIndex);
        const base64Data = imageBuffer.toString('base64');
        
        console.log('Found image data of length:', base64Data.length);

        // Create data URL
        const dataURL = `data:${mimeType};base64,${base64Data}`;

        return {
            mimeType,
            rawData: base64Data,
            dataURL
        };

    } catch (error) {
        console.error('Error extracting image:', error);
        return null;
    }
}

export async function validateImageData(imageData: Buffer | string | null): Promise<boolean> {
    if (!imageData) return false;
    
    try {
        // Convert string to buffer if needed
        const buffer = typeof imageData === 'string' ? Buffer.from(imageData, 'binary') : imageData;
        
        // Check for minimum size
        if (buffer.length < 50) {
            console.log('Image data too small:', buffer.length, 'bytes');
            return false;
        }
        
        // Check for JPEG signature (FF D8 FF)
        if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
            // Scan for JPEG end marker (FF D9)
            let hasEndMarker = false;
            for (let i = buffer.length - 2; i >= 0; i--) {
                if (buffer[i] === 0xFF && buffer[i + 1] === 0xD9) {
                    hasEndMarker = true;
                    break;
                }
            }
            if (!hasEndMarker) {
                console.log('JPEG end marker not found, data may be truncated');
            }
            return true; // Still return true as some valid JPEGs might have truncated end markers
        }
        
        // Check for PNG signature (89 50 4E 47 0D 0A 1A 0A)
        if (buffer[0] === 0x89 && 
            buffer[1] === 0x50 && 
            buffer[2] === 0x4E && 
            buffer[3] === 0x47 && 
            buffer[4] === 0x0D && 
            buffer[5] === 0x0A && 
            buffer[6] === 0x1A && 
            buffer[7] === 0x0A) {
            return true;
        }
        
        // Check for WebP signature (52 49 46 46 XX XX XX XX 57 45 42 50)
        if (buffer.length >= 12 &&
            buffer[0] === 0x52 && // R
            buffer[1] === 0x49 && // I
            buffer[2] === 0x46 && // F
            buffer[3] === 0x46 && // F
            buffer[8] === 0x57 && // W
            buffer[9] === 0x45 && // E
            buffer[10] === 0x42 && // B
            buffer[11] === 0x50) { // P
            return true;
        }

        // Try to decode with ImageScript as a last resort
        try {
            await decode(buffer);
            return true;
        } catch (e) {
            console.log('ImageScript decode failed:', e.message);
            return false;
        }
    } catch (error) {
        console.error('Error validating image data:', error);
        return false;
    }
}

/**
 * Check if data contains a JPEG signature
 * @param data Buffer or base64 string to check
 * @returns true if data contains JPEG signature
 */
export function hasJpegSignature(data: Buffer | string): boolean {
    try {
        let buffer: Buffer;
        
        // Convert input to buffer if it's a base64 string
        if (typeof data === 'string') {
            try {
                // Remove data URL prefix if present
                const base64Data = data.includes('base64,') 
                    ? data.split('base64,')[1] 
                    : data;
                
                buffer = Buffer.from(base64Data, 'base64');
            } catch (e) {
                return false;
            }
        } else {
            buffer = data;
        }

        // Check for JPEG signature
        return buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xD8;
    } catch (error) {
        return false;
    }
}

export async function processImage(imageData: Buffer | string, metadata: Partial<ImageMetadata> = {}): Promise<ProcessedImage | null> {
    try {
        const buffer = Buffer.isBuffer(imageData) ? imageData : Buffer.from(imageData, 'base64');
        
        // Detect format and validate image
        const detectedFormat = await detectImageFormat(buffer);
        if (!detectedFormat) {
            console.error('Invalid or unsupported image format');
            return null;
        }

        // Decode image using ImageScript
        const image = await decode(buffer);
        if (!image) {
            console.error('Failed to decode image');
            return null;
        }

        const processedMetadata: ImageMetadata = {
            width: image.width,
            height: image.height,
            format: detectedFormat.format,
            mimeType: detectedFormat.mimeType,
            size: buffer.length,
            ...metadata
        };

        return {
            metadata: processedMetadata,
            data: buffer,
            dataUrl: `data:${processedMetadata.mimeType};base64,${buffer.toString('base64')}`
        };
    } catch (error) {
        console.error('Error processing image:', error);
        return null;
    }
}

export async function detectImageFormat(buffer: Buffer): Promise<{ format: string; mimeType: string } | null> {
    for (const [format, info] of Object.entries(SUPPORTED_FORMATS)) {
        for (const signature of info.signatures) {
            let matches = true;
            for (let i = 0; i < signature.length; i++) {
                if (buffer[i] !== signature[i]) {
                    matches = false;
                    break;
                }
            }
            if (matches) {
                return { format, mimeType: info.mimeType };
            }
        }
    }
    return null;
}

/**
 * Check if a buffer contains valid image data
 * @param buffer Buffer or base64 string to check
 * @returns true if buffer contains valid image data
 */
export async function isValidImage(data: Buffer | string, contentType?: string): Promise<boolean> {
    try {
        let buffer: Buffer;
        
        // Convert input to buffer if it's a base64 string
        if (typeof data === 'string') {
            try {
                // Remove data URL prefix if present
                const base64Data = data.includes('base64,') 
                    ? data.split('base64,')[1] 
                    : data;
                
                buffer = Buffer.from(base64Data, 'base64');
            } catch (e) {
                console.error('Error decoding base64:', e);
                return false;
            }
        } else {
            buffer = data;
        }

        // Basic size check
        if (buffer.length < 50) {
            console.log('Buffer too small to be a valid image');
            return false;
        }

        // For JPEG images
        if (contentType === 'image/jpeg' || !contentType) {
            // Check for JPEG start marker (FF D8)
            const startMarker = buffer.indexOf(Buffer.from([0xFF, 0xD8]));
            if (startMarker !== -1) {
                // Look for JPEG end marker (FF D9)
                const endMarker = buffer.indexOf(Buffer.from([0xFF, 0xD9]), startMarker);
                if (endMarker !== -1) {
                    // Extract the actual JPEG data
                    const jpegData = buffer.slice(startMarker, endMarker + 2);
                    
                    // Try to decode with ImageScript
                    try {
                        const image = await decode(jpegData);
                        if (image) {
                            console.log('Valid JPEG structure detected');
                            return true;
                        }
                    } catch (error) {
                        console.log('Failed to decode JPEG with ImageScript');
                    }
                }
            }
            
            if (contentType === 'image/jpeg') {
                console.log('No valid JPEG structure');
                return false;
            }
        }

        // For PNG images
        if (contentType === 'image/png' || !contentType) {
            const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
            if (buffer.length >= 8 && buffer.slice(0, 8).equals(pngSignature)) {
                try {
                    const image = await decode(buffer);
                    if (image) {
                        console.log('Valid PNG structure detected');
                        return true;
                    }
                } catch (error) {
                    console.log('Failed to decode PNG with ImageScript');
                }
            }
            
            if (contentType === 'image/png') {
                console.log('No valid PNG structure');
                return false;
            }
        }

        // If no content type specified, try decoding with ImageScript as last resort
        if (!contentType) {
            try {
                const image = await decode(buffer);
                return !!image;
            } catch (error) {
                console.log('Failed to decode image with ImageScript');
                return false;
            }
        }

        return false;
    } catch (error) {
        console.error('Error validating image:', error);
        return false;
    }
}

/**
 * Get image dimensions
 * @param buffer Image data as Buffer or base64 string
 * @returns Image dimensions or null if invalid
 */
export async function getImageDimensions(data: Buffer | string, contentType?: string): Promise<{ width: number; height: number } | null> {
    try {
        let buffer: Buffer;
        
        // Convert input to buffer if it's a base64 string
        if (typeof data === 'string') {
            try {
                // Remove data URL prefix if present
                const base64Data = data.includes('base64,') 
                    ? data.split('base64,')[1] 
                    : data;
                
                buffer = Buffer.from(base64Data, 'base64');
            } catch (e) {
                console.error('Error decoding base64:', e);
                return null;
            }
        } else {
            buffer = data;
        }

        // Check for JPEG signature if content type is JPEG
        if (contentType === 'image/jpeg' && !hasJpegSignature(buffer)) {
            return null;
        }

        const image = await decode(buffer);
        if (!image) return null;
        
        return {
            width: image.width,
            height: image.height
        };
    } catch (error) {
        return null;
    }
}

/**
 * Resize an image while maintaining aspect ratio
 * @param data Original image data as Buffer or base64 string
 * @param maxWidth Maximum width
 * @param maxHeight Maximum height
 * @returns Resized image data or null if failed
 */
export async function resizeImage(data: Buffer | string, maxWidth: number, maxHeight: number, contentType?: string): Promise<Buffer | null> {
    try {
        let buffer: Buffer;
        
        // Convert input to buffer if it's a base64 string
        if (typeof data === 'string') {
            try {
                // Remove data URL prefix if present
                const base64Data = data.includes('base64,') 
                    ? data.split('base64,')[1] 
                    : data;
                
                buffer = Buffer.from(base64Data, 'base64');
            } catch (e) {
                console.error('Error decoding base64:', e);
                return null;
            }
        } else {
            buffer = data;
        }

        // Check for JPEG signature if content type is JPEG
        if (contentType === 'image/jpeg' && !hasJpegSignature(buffer)) {
            return null;
        }

        const image = await decode(buffer);
        if (!image) return null;

        // Calculate new dimensions
        const aspectRatio = image.width / image.height;
        let newWidth = maxWidth;
        let newHeight = maxHeight;

        if (maxWidth / maxHeight > aspectRatio) {
            newWidth = Math.round(maxHeight * aspectRatio);
        } else {
            newHeight = Math.round(maxWidth / aspectRatio);
        }

        // Resize the image
        image.resize(newWidth, newHeight);

        // Encode and return
        const resizedData = await image.encode();
        return Buffer.from(resizedData);
    } catch (error) {
        console.error('Error resizing image:', error);
        return null;
    }
}

/**
 * Convert image to a specific format
 * @param data Original image data as Buffer or base64 string
 * @param format Target format (e.g. 'JPEG', 'PNG')
 * @returns Converted image data or null if failed
 */
export async function convertImage(data: Buffer | string, format: string, contentType?: string): Promise<Buffer | null> {
    try {
        let buffer: Buffer;
        
        // Convert input to buffer if it's a base64 string
        if (typeof data === 'string') {
            try {
                // Remove data URL prefix if present
                const base64Data = data.includes('base64,') 
                    ? data.split('base64,')[1] 
                    : data;
                
                buffer = Buffer.from(base64Data, 'base64');
            } catch (e) {
                console.error('Error decoding base64:', e);
                return null;
            }
        } else {
            buffer = data;
        }

        // Check for JPEG signature if content type is JPEG
        if (contentType === 'image/jpeg' && !hasJpegSignature(buffer)) {
            return null;
        }

        const image = await decode(buffer);
        if (!image) return null;

        // Encode to the target format
        const convertedData = await image.encode(format);
        return Buffer.from(convertedData);
    } catch (error) {
        console.error('Error converting image:', error);
        return null;
    }
}
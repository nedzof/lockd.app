import { Buffer } from 'buffer';
import { Image, decode } from 'imagescript';

export interface ImageOutput {
    mimeType: string;
    rawData: string;
    dataURL: string;
}

export interface ProcessedImage {
    width: number;
    height: number;
    format: string;
    data: Buffer;
}

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

export function validateImageData(imageData: ImageOutput | null): boolean {
    if (!imageData) return false;
    
    try {
        // Check if the base64 data is valid
        const buffer = Buffer.from(imageData.rawData, 'base64');
        
        // Check for minimum size (at least 100 bytes)
        if (buffer.length < 100) {
            console.log('Image data too small:', buffer.length);
            return false;
        }
        
        // Check for valid MIME type
        if (!imageData.mimeType.startsWith('image/')) {
            console.log('Invalid MIME type:', imageData.mimeType);
            return false;
        }
        
        // Check for common image headers
        const firstBytes = buffer.slice(0, 4);
        const isJPEG = firstBytes[0] === 0xFF && firstBytes[1] === 0xD8;
        const isPNG = firstBytes[0] === 0x89 && firstBytes[1] === 0x50 && firstBytes[2] === 0x4E && firstBytes[3] === 0x47;
        
        if (!isJPEG && !isPNG) {
            console.log('No valid image headers found');
            return false;
        }
        
        return true;
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

/**
 * Process image data using ImageScript
 * @param imageData Raw image data as Buffer or base64 string
 * @param contentType Content type of the image (e.g. 'image/jpeg')
 * @returns Processed image data with metadata
 */
export async function processImage(imageData: Buffer | string, contentType: string): Promise<ProcessedImage | null> {
    try {
        let buffer: Buffer;
        
        // Convert input to buffer if it's a base64 string
        if (typeof imageData === 'string') {
            try {
                // Remove data URL prefix if present
                const base64Data = imageData.includes('base64,') 
                    ? imageData.split('base64,')[1] 
                    : imageData;
                
                buffer = Buffer.from(base64Data, 'base64');
            } catch (e) {
                console.error('Error decoding base64:', e);
                return null;
            }
        } else {
            buffer = imageData;
        }

        // Check for JPEG signature
        if (contentType === 'image/jpeg' && !hasJpegSignature(buffer)) {
            console.error('Invalid JPEG signature');
            return null;
        }

        // Decode the image using ImageScript
        const image = await decode(buffer);
        
        if (!image) {
            console.error('Failed to decode image');
            return null;
        }

        // Get image format from content type
        const format = contentType.split('/')[1]?.toUpperCase() || 'UNKNOWN';

        // Get image metadata
        const width = image.width;
        const height = image.height;

        // Encode the image back to buffer
        const processedData = await image.encode();

        return {
            width,
            height,
            format,
            data: Buffer.from(processedData)
        };
    } catch (error) {
        console.error('Error processing image:', error);
        return null;
    }
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

        // Check for JPEG signature if content type is JPEG
        if (contentType === 'image/jpeg' && !hasJpegSignature(buffer)) {
            return false;
        }

        const image = await decode(buffer);
        return !!image;
    } catch (error) {
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
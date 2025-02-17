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

    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error('Error extracting image:', error.message);
        } else {
            console.error('Error extracting image with unknown error');
        }
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
        } catch (e: unknown) {
            if (e instanceof Error) {
                console.log('ImageScript decode failed:', e.message);
            } else {
                console.log('ImageScript decode failed with unknown error');
            }
            return false;
        }
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error('Error validating image data:', error.message);
        } else {
            console.error('Error validating image data with unknown error');
        }
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
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error('Error checking JPEG signature:', error.message);
        } else {
            console.error('Error checking JPEG signature with unknown error');
        }
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
    } catch (error: unknown) {
        if (error instanceof Error) {
            throw new ImageProcessingError(`Image processing failed: ${error.message}`);
        } else {
            throw new ImageProcessingError('Image processing failed with unknown error');
        }
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
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'base64');
        await decode(buffer);
        return true;
    } catch (e: unknown) {
        if (e instanceof Error) {
            console.log('ImageScript decode failed:', e.message);
        } else {
            console.log('ImageScript decode failed with unknown error');
        }
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
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'base64');
        
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
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error('Error getting image dimensions:', error.message);
        } else {
            console.error('Error getting image dimensions with unknown error');
        }
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
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'base64');
        
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
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error('Error resizing image:', error.message);
        } else {
            console.error('Error resizing image with unknown error');
        }
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
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'base64');
        const image = await decode(buffer);
        
        // Convert format string to number for encode
        const formatNum = format.toUpperCase() === 'JPEG' ? 1 : 0; // 0 for PNG, 1 for JPEG
        const convertedData = await image.encode(formatNum);
        return Buffer.from(convertedData);
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error('Failed to convert image:', error.message);
        } else {
            console.error('Failed to convert image with unknown error');
        }
        return null;
    }
}

export class ImageProcessingError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ImageProcessingError';
    }
}

export class ImageProcessor {
    private static instance: ImageProcessor;

    private constructor() {}

    static getInstance(): ImageProcessor {
        if (!ImageProcessor.instance) {
            ImageProcessor.instance = new ImageProcessor();
        }
        return ImageProcessor.instance;
    }

    async processImage(data: Buffer | string, metadata: Partial<ImageMetadata> = {}): Promise<ProcessedImage> {
        try {
            const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'base64');
            const result = await decode(buffer);
            
            // Check if result is Image type (not GIF)
            if ('type' in result) {
                return {
                    data: buffer,
                    metadata: {
                        width: result.width,
                        height: result.height,
                        format: result.type === 1 ? 'JPEG' : 'PNG',
                        mimeType: result.type === 1 ? 'image/jpeg' : 'image/png',
                        size: buffer.length,
                        ...metadata
                    },
                    dataUrl: `data:${result.type === 1 ? 'image/jpeg' : 'image/png'};base64,${buffer.toString('base64')}`
                };
            } else {
                // Handle GIF type
                return {
                    data: buffer,
                    metadata: {
                        width: result.width,
                        height: result.height,
                        format: 'GIF',
                        mimeType: 'image/gif',
                        size: buffer.length,
                        ...metadata
                    },
                    dataUrl: `data:image/gif;base64,${buffer.toString('base64')}`
                };
            }
        } catch (error: unknown) {
            if (error instanceof Error) {
                throw new ImageProcessingError(`Image processing failed: ${error.message}`);
            } else {
                throw new ImageProcessingError('Image processing failed with unknown error');
            }
        }
    }
}

export const imageProcessor = ImageProcessor.getInstance();

export const cachedImageProcessing = async (data: Buffer | string, metadata: Partial<ImageMetadata> = {}): Promise<ProcessedImage> => {
    return imageProcessor.processImage(data, metadata);
};
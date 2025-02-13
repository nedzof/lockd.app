import { Buffer } from 'buffer';

export interface ImageOutput {
    mimeType: string;
    rawData: string;
    dataURL: string;
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
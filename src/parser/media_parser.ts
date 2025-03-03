/**
 * MediaParser: Responsible for processing media content from transactions
 */
import { BaseParser } from './base_parser.js';
import { logger } from '../utils/logger.js';
import { db_client } from '../db/index.js';

export class MediaParser extends BaseParser {
    /**
     * Process image data and save to database
     * @param image_data The image buffer data to process
     * @param metadata Metadata for the image
     * @param tx_id Transaction ID associated with the image
     * @returns void
     */
    public async process_image(
        image_data: Buffer, 
        metadata: { 
            content_type?: string;
            filename?: string;
            width?: number;
            height?: number;
        }, 
        tx_id: string
    ): Promise<void> {
        try {
            this.logDebug('Starting image processing', {
                tx_id,
                has_image_data: !!image_data,
                metadata_keys: metadata ? Object.keys(metadata) : [],
                content_type: metadata?.content_type
            });

            if (!image_data || !metadata.content_type) {
                throw new Error('Invalid image data or content type');
            }

            // Save image data using DbClient
            await db_client.save_image({
                tx_id,
                image_data: image_data,
                content_type: metadata.content_type,
                filename: metadata.filename || 'image.jpg',
                width: metadata.width,
                height: metadata.height,
                size: image_data.length
            });

            this.logInfo('Successfully processed and saved image', {
                tx_id,
                content_type: metadata.content_type,
                size: image_data.length
            });
        } catch (error) {
            this.logError('Failed to process image', {
                error: error instanceof Error ? error.message : 'Unknown error',
                tx_id
            });
            throw error;
        }
    }

    /**
     * Extract image data from a buffer
     * @param buffer The buffer containing the image data
     * @returns Object containing the extracted image and format information
     */
    public extract_image_data(buffer: Buffer): { 
        image: Buffer | null; 
        format: string | null;
        content_type: string | null;
    } {
        const result = {
            image: null as Buffer | null,
            format: null as string | null,
            content_type: null as string | null
        };

        try {
            if (!buffer || buffer.length === 0) {
                this.logWarn('Empty buffer provided to extract_image_data');
                return result;
            }

            // Check for image headers
            if (buffer.length >= 2) {
                // JPEG
                if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
                    result.format = 'jpeg';
                    result.content_type = 'image/jpeg';
                    result.image = buffer;
                    return result;
                }
                
                // PNG
                if (buffer.length >= 8 && 
                    buffer[0] === 0x89 && buffer[1] === 0x50 && 
                    buffer[2] === 0x4E && buffer[3] === 0x47 && 
                    buffer[4] === 0x0D && buffer[5] === 0x0A && 
                    buffer[6] === 0x1A && buffer[7] === 0x0A) {
                    result.format = 'png';
                    result.content_type = 'image/png';
                    result.image = buffer;
                    return result;
                }
                
                // GIF
                if (buffer.length >= 6 && 
                    buffer[0] === 0x47 && buffer[1] === 0x49 && 
                    buffer[2] === 0x46 && buffer[3] === 0x38 && 
                    (buffer[4] === 0x37 || buffer[4] === 0x39) && 
                    buffer[5] === 0x61) {
                    result.format = 'gif';
                    result.content_type = 'image/gif';
                    result.image = buffer;
                    return result;
                }
                
                // BMP
                if (buffer.length >= 2 && 
                    buffer[0] === 0x42 && buffer[1] === 0x4D) {
                    result.format = 'bmp';
                    result.content_type = 'image/bmp';
                    result.image = buffer;
                    return result;
                }
                
                // WebP
                if (buffer.length >= 12 && 
                    buffer[0] === 0x52 && buffer[1] === 0x49 && 
                    buffer[2] === 0x46 && buffer[3] === 0x46 && 
                    buffer[8] === 0x57 && buffer[9] === 0x45 && 
                    buffer[10] === 0x42 && buffer[11] === 0x50) {
                    result.format = 'webp';
                    result.content_type = 'image/webp';
                    result.image = buffer;
                    return result;
                }
                
                // TIFF
                if (buffer.length >= 4 && 
                    ((buffer[0] === 0x49 && buffer[1] === 0x49 && 
                      buffer[2] === 0x2A && buffer[3] === 0x00) || 
                     (buffer[0] === 0x4D && buffer[1] === 0x4D && 
                      buffer[2] === 0x00 && buffer[3] === 0x2A))) {
                    result.format = 'tiff';
                    result.content_type = 'image/tiff';
                    result.image = buffer;
                    return result;
                }
            }

            // No recognized image format
            this.logWarn('Unrecognized image format', {
                buffer_length: buffer.length,
                first_bytes: buffer.length >= 4 ? 
                    `${buffer[0].toString(16)}-${buffer[1].toString(16)}-${buffer[2].toString(16)}-${buffer[3].toString(16)}` : 
                    'too short'
            });

            // Return buffer as unknown format
            result.format = 'unknown';
            result.content_type = 'application/octet-stream';
            result.image = buffer;
            return result;
        } catch (error) {
            this.logError('Error extracting image data', {
                error: error instanceof Error ? error.message : String(error),
                buffer_length: buffer ? buffer.length : 0
            });
            return result;
        }
    }
}

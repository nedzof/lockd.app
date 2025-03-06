/**
 * MediaParser: Responsible for processing media content from transactions
 * 
 * This class handles the identification, extraction, and processing of media content
 * (primarily images) from transaction data. Its responsibilities include:
 * 
 * 1. Detecting binary media data in transactions
 * 2. Identifying specific media formats based on file signatures
 * 3. Extracting and processing image data
 * 4. Saving media content to database
 * 
 * MediaParser is part of the transaction processing pipeline and works in
 * conjunction with TransactionDataParser and LockProtocolParser.
 */
import { BaseParser } from './base_parser.js';
import { db_client } from '../db/index.js';
import { is_binary_data } from './utils/helpers.js';

export class MediaParser extends BaseParser {
    /**
     * Process image data and save to database
     * 
     * Takes binary image data, extracts metadata if available, and persists
     * the image to the database with appropriate content type and sizing information.
     * 
     * @param image_data The image buffer data to process
     * @param metadata Metadata for the image (content type, dimensions, etc.)
     * @param tx_id Transaction ID associated with the image for reference
     * @returns Promise that resolves when the image is saved
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
     * 
     * Analyzes a buffer to determine if it contains image data, and if so:
     * 1. Identifies the specific image format based on file signatures
     * 2. Determines the appropriate content type
     * 3. Returns the image data with format information
     * 
     * Supports detection of JPEG, PNG, GIF, BMP, WebP, and TIFF formats.
     * For unrecognized binary data, returns with an 'unknown' format.
     * 
     * @param buffer The buffer containing potential image data
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

            // First check if it's binary data using the helper function
            // This leverages the robust binary detection from TransactionDataParser improvements
            if (!is_binary_data(buffer)) {
                this.logDebug('Buffer does not appear to be binary data');
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

            // No recognized image format, but it's still binary data
            // We still return it as binary data for proper handling in the transaction pipeline
            this.logDebug('Unrecognized image format but confirmed binary data', {
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
    
    /**
     * Extract image data from a transaction object
     * 
     * This method analyzes a transaction to find and extract image data:
     * 1. Examines transaction outputs for binary data
     * 2. Identifies image content using file signatures
     * 3. Extracts metadata like alt text and dimensions when available
     * 
     * @param tx Transaction object from JungleBus or other source
     * @returns Image data object with format, content type and metadata (or null if no image)
     */
    public extract_image_data_from_transaction(tx: any): {
        image: Buffer | null;
        format: string | null;
        content_type: string | null;
        alt_text?: string;
        width?: number;
        height?: number;
    } | null {
        try {
            if (!tx) {
                return null;
            }
            
            // Check for binary data in outputs
            if (tx.outputs && Array.isArray(tx.outputs)) {
                for (const output of tx.outputs) {
                    if (output && output.script && Buffer.isBuffer(output.script)) {
                        const imageData = this.extract_image_data(output.script);
                        if (imageData.image) {
                            this.logInfo('Found image data in transaction output', {
                                tx_id: tx.id || 'unknown',
                                format: imageData.format,
                                content_type: imageData.content_type,
                                size: imageData.image.length
                            });
                            
                            // Check for metadata in tx.data array
                            const alt_text = this.extract_alt_text_from_transaction(tx);
                            const dimensions = this.extract_dimensions_from_transaction(tx);
                            
                            return {
                                ...imageData,
                                alt_text,
                                width: dimensions?.width,
                                height: dimensions?.height
                            };
                        }
                    }
                }
            }
            
            // Check raw transaction data if available
            if (tx.transaction && typeof tx.transaction === 'string') {
                try {
                    const buffer = Buffer.from(tx.transaction, 'base64');
                    const imageData = this.extract_image_data(buffer);
                    
                    if (imageData.image) {
                        this.logInfo('Found image data in raw transaction', {
                            tx_id: tx.id || 'unknown',
                            format: imageData.format,
                            content_type: imageData.content_type,
                            size: imageData.image.length
                        });
                        
                        // Check for metadata in tx.data array
                        const alt_text = this.extract_alt_text_from_transaction(tx);
                        const dimensions = this.extract_dimensions_from_transaction(tx);
                        
                        return {
                            ...imageData,
                            alt_text,
                            width: dimensions?.width,
                            height: dimensions?.height
                        };
                    }
                } catch (bufferError) {
                    this.logWarn('Error processing raw transaction data for image', {
                        error: bufferError instanceof Error ? bufferError.message : String(bufferError),
                        tx_id: tx.id || 'unknown'
                    });
                }
            }
            
            return null;
        } catch (error) {
            this.logError('Error extracting image from transaction', {
                error: error instanceof Error ? error.message : String(error),
                tx_id: tx?.id || 'unknown'
            });
            return null;
        }
    }
    
    /**
     * Extract alt text from transaction data
     * @param tx Transaction object
     * @returns Alt text if found, undefined otherwise
     */
    private extract_alt_text_from_transaction(tx: any): string | undefined {
        try {
            if (tx.data && Array.isArray(tx.data)) {
                // Look for alt_text in data array
                const altTextItem = tx.data.find((item: string) => 
                    item && typeof item === 'string' && item.startsWith('alt_text='));
                
                if (altTextItem) {
                    return altTextItem.replace('alt_text=', '');
                }
                
                // Also check for alt= format
                const altItem = tx.data.find((item: string) => 
                    item && typeof item === 'string' && item.startsWith('alt='));
                
                if (altItem) {
                    return altItem.replace('alt=', '');
                }
            }
            
            return undefined;
        } catch (error) {
            this.logWarn('Error extracting alt text', {
                error: error instanceof Error ? error.message : String(error),
                tx_id: tx?.id || 'unknown'
            });
            return undefined;
        }
    }
    
    /**
     * Extract image dimensions from transaction data
     * @param tx Transaction object
     * @returns Object with width and height if found
     */
    private extract_dimensions_from_transaction(tx: any): { width?: number, height?: number } | undefined {
        try {
            const dimensions: { width?: number, height?: number } = {};
            
            if (tx.data && Array.isArray(tx.data)) {
                // Look for width and height in data array
                tx.data.forEach((item: string) => {
                    if (item && typeof item === 'string') {
                        if (item.startsWith('width=')) {
                            const width = parseInt(item.replace('width=', ''), 10);
                            if (!isNaN(width)) {
                                dimensions.width = width;
                            }
                        } else if (item.startsWith('height=')) {
                            const height = parseInt(item.replace('height=', ''), 10);
                            if (!isNaN(height)) {
                                dimensions.height = height;
                            }
                        }
                    }
                });
                
                if (dimensions.width || dimensions.height) {
                    return dimensions;
                }
            }
            
            return undefined;
        } catch (error) {
            this.logWarn('Error extracting image dimensions', {
                error: error instanceof Error ? error.message : String(error),
                tx_id: tx?.id || 'unknown'
            });
            return undefined;
        }
    }
}

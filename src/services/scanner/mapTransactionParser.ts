import type { JungleBusTransaction, JungleBusOutput } from './types.js';
import type { ParsedPost, ParsedComponent, MAP_TYPES } from './types.js';
import { isValidImage, processImage, hasJpegSignature } from './imageProcessor.js';

interface VoteOption {
    text: string;
    lockAmount: number;
    lockDuration: number;
    optionIndex: number;
    sequence: number;
}

interface VoteQuestion {
    text: string;
    totalOptions: number;
    optionsHash: string;
    sequence: number;
    options?: VoteOption[];
}

interface ParsedMapData {
    type: string;
    content: string;
    app: string;
    timestamp: string;
    sequence: number;
    parentSequence?: number;
    postId: string;
    vote?: {
        question?: VoteQuestion;
        option?: VoteOption;
    };
    image?: {
        contentType: string;
        fileSize: number;
        filename?: string;
        encoding: string;
        data?: Buffer;
    };
    tags?: string[];
    version: string;
    is_vote?: boolean;
}

// Function to parse MAP fields from a script
async function parseMapFields(scriptData: string): Promise<ParsedMapData> {
    try {
        const parts = scriptData.split(' ');
        const fields: Record<string, any> = {};
        let content = '';
        
        for (let i = 0; i < parts.length; i++) {
            if (parts[i] === 'OP_RETURN' || parts[i] === 'OP_FALSE') {
                i++;
                continue;
            }
            
            const hex = parts[i];
            if (!hex) continue;
            
            try {
                const text = Buffer.from(hex, 'hex').toString('utf8');
                
                if (text.startsWith('MAP')) {
                    const [key, value] = text.substring(4).split('=');
                    const keyLower = key.toLowerCase();
                    
                    switch (keyLower) {
                        case 'content':
                        case 'text':
                            content = value.trim();
                            break;
                        case 'type':
                            fields.type = value.trim();
                            // Set is_vote flag based on type
                            fields.is_vote = value.trim().toLowerCase() === 'vote';
                            break;
                        case 'app':
                            fields.app = value.trim();
                            break;
                        case 'sequence':
                            fields.sequence = parseInt(value.trim(), 10);
                            break;
                        case 'parentsequence':
                            fields.parentSequence = parseInt(value.trim(), 10);
                            break;
                        case 'postid':
                            fields.postId = value.trim();
                            break;
                        case 'totaloptions':
                            if (!fields.vote) fields.vote = {};
                            if (!fields.vote.question) fields.vote.question = {};
                            fields.vote.question.totalOptions = parseInt(value.trim(), 10);
                            fields.is_vote = true; // Set is_vote flag when vote metadata is present
                            break;
                        case 'optionindex':
                            if (!fields.vote) fields.vote = {};
                            if (!fields.vote.option) fields.vote.option = {};
                            fields.vote.option.optionIndex = parseInt(value.trim(), 10);
                            fields.is_vote = true; // Set is_vote flag when vote metadata is present
                            break;
                        case 'lockamount':
                            if (!fields.vote) fields.vote = {};
                            if (!fields.vote.option) fields.vote.option = {};
                            fields.vote.option.lockAmount = parseInt(value.trim(), 10);
                            break;
                        case 'lockduration':
                            if (!fields.vote) fields.vote = {};
                            if (!fields.vote.option) fields.vote.option = {};
                            fields.vote.option.lockDuration = parseInt(value.trim(), 10);
                            break;
                        case 'contenttype':
                            if (!fields.image) fields.image = {};
                            fields.image.contentType = value.trim();
                            break;
                        case 'filesize':
                            if (!fields.image) fields.image = {};
                            fields.image.fileSize = parseInt(value.trim(), 10);
                            break;
                        case 'filename':
                            if (!fields.image) fields.image = {};
                            fields.image.filename = value.trim();
                            break;
                        case 'encoding':
                            if (!fields.image) fields.image = {};
                            fields.image.encoding = value.trim();
                            break;
                        case 'tags':
                            try {
                                fields.tags = JSON.parse(value.trim());
                            } catch {
                                fields.tags = [];
                            }
                            break;
                        default:
                            fields[keyLower] = value.trim();
                    }
                }
            } catch (error) {
                console.error('Error parsing MAP field:', error);
            }
        }
        
        return {
            type: fields.type || 'unknown',
            content,
            app: fields.app || 'lockd.app',
            timestamp: fields.timestamp || new Date().toISOString(),
            sequence: fields.sequence || 0,
            parentSequence: fields.parentSequence,
            postId: fields.postId,
            vote: fields.vote,
            image: fields.image,
            tags: fields.tags || [],
            version: fields.version || '1.0.0',
            is_vote: fields.is_vote || false // Include is_vote flag in returned data
        };
    } catch (error) {
        console.error('Error parsing MAP fields:', error);
        throw error;
    }
}

// Helper function to normalize base64 data
function normalizeBase64(base64: string): string {
    // Remove whitespace and newlines
    base64 = base64.replace(/\s/g, '');
    
    // Convert URL-safe base64 to standard base64
    base64 = base64.replace(/-/g, '+').replace(/_/g, '/');
    
    // Add padding if needed
    while (base64.length % 4) {
        base64 += '=';
    }
    
    return base64;
}

// Function to extract image data from a transaction
async function extractImageFromTransaction(tx: JungleBusTransaction): Promise<Buffer | null> {
    try {
        if (!tx.outputs || tx.outputs.length === 0) {
            console.log('No outputs in transaction');
            return null;
        }

        // Try to find JPEG data in outputs
        for (const output of tx.outputs) {
            if (!output.script) continue;

            try {
                // Convert hex to string
                const scriptBuffer = Buffer.from(output.script, 'hex');
                const text = scriptBuffer.toString('utf8');

                // Check for base64 encoded JPEG data
                if (text.includes('/9j/')) {
                    const base64Start = text.indexOf('/9j/');
                    let base64End = text.indexOf('"', base64Start);
                    if (base64End === -1) base64End = text.length;
                    
                    const base64Data = text.substring(base64Start, base64End);
                    
                    try {
                        const imageBuffer = Buffer.from(base64Data, 'base64');
                        
                        // Verify it's a valid JPEG
                        if (imageBuffer.length > 4 && 
                            imageBuffer[0] === 0xFF && 
                            imageBuffer[1] === 0xD8 && 
                            imageBuffer[2] === 0xFF) {
                            console.log('Found base64 JPEG of size:', imageBuffer.length);
                            return imageBuffer;
                        }
                    } catch (e) {
                        console.log('Error decoding base64:', e);
                    }
                }

                // Check for direct JPEG data
                if (scriptBuffer.length > 4 && 
                    scriptBuffer[0] === 0xFF && 
                    scriptBuffer[1] === 0xD8 && 
                    scriptBuffer[2] === 0xFF) {
                    console.log('Found direct JPEG data of size:', scriptBuffer.length);
                    return scriptBuffer;
                }
            } catch (error) {
                console.log('Error processing output:', error);
            }
        }

        // If no image found in outputs, try the raw transaction
        if (tx.transaction) {
            try {
                const txBuffer = Buffer.from(tx.transaction, 'base64');
                
                // Look for JPEG signature (FF D8 FF)
                let startIndex = -1;
                for (let i = 0; i < txBuffer.length - 3; i++) {
                    if (txBuffer[i] === 0xFF && 
                        txBuffer[i + 1] === 0xD8 && 
                        txBuffer[i + 2] === 0xFF) {
                        startIndex = i;
                        break;
                    }
                }

                if (startIndex !== -1) {
                    // Look for JPEG end marker (FF D9)
                    let endIndex = -1;
                    for (let i = startIndex; i < txBuffer.length - 1; i++) {
                        if (txBuffer[i] === 0xFF && txBuffer[i + 1] === 0xD9) {
                            endIndex = i + 2; // Include the end marker
                            break;
                        }
                    }

                    if (endIndex === -1) endIndex = txBuffer.length;
                    
                    const imageBuffer = txBuffer.slice(startIndex, endIndex);
                    if (imageBuffer.length > 4 && 
                        imageBuffer[0] === 0xFF && 
                        imageBuffer[1] === 0xD8 && 
                        imageBuffer[2] === 0xFF) {
                        console.log('Found JPEG in raw transaction of size:', imageBuffer.length);
                        return imageBuffer;
                    }
                }
            } catch (error) {
                console.log('Error processing raw transaction:', error);
            }
        }

        console.log('No JPEG data found in transaction');
        return null;

    } catch (error) {
        console.error('Error extracting image:', error);
        return null;
    }
}

// Helper function to check if a buffer is an image
async function isImageBuffer(buffer: Buffer): Promise<boolean> {
    return await isValidImage(buffer);
}

// Helper function to get content type from image buffer
function getImageContentType(buffer: Buffer): string {
    // Check for JPEG signature
    if (buffer.length > 3 && 
        buffer[0] === 0xFF && 
        buffer[1] === 0xD8 && 
        buffer[2] === 0xFF) {
        return 'image/jpeg';
    }
    
    // Check for PNG signature
    if (buffer.length > 8 &&
        buffer[0] === 0x89 && 
        buffer[1] === 0x50 && 
        buffer[2] === 0x4E && 
        buffer[3] === 0x47) {
        return 'image/png';
    }

    // Default to JPEG since that's what we mostly handle
    return 'image/jpeg';
}

// Main function to parse a MAP transaction
export async function parseMapTransaction(tx: JungleBusTransaction): Promise<ParsedPost | null> {
    try {
        if (!tx.outputs || tx.outputs.length === 0) {
            console.log('No outputs in transaction');
            return null;
        }

        let mapData: ParsedMapData | null = null;
        let imageData: Buffer | null = null;

        // First pass: Look for MAP data
        for (const output of tx.outputs) {
            if (!output.script?.asm) continue;

            try {
                mapData = await parseMapFields(output.script.asm);
                if (mapData) break;
            } catch (error) {
                console.error('Error parsing MAP data:', error);
            }
        }

        if (!mapData) {
            console.log('No valid MAP data found in transaction');
            return null;
        }

        // Second pass: Look for image data if needed
        if (mapData.image) {
            imageData = await extractImageFromTransaction(tx);
        }

        const author = getAuthorFromTransaction(tx);
        if (!author) {
            console.error('Could not determine author from transaction');
            return null;
        }

        // Construct the parsed post
        const post: ParsedPost = {
            txid: tx.txid,
            content: mapData.content,
            author_address: author,
            block_height: tx.blockHeight || 0,
            timestamp: new Date(mapData.timestamp),
            tags: mapData.tags || [],
            metadata: {
                app: mapData.app,
                type: mapData.type,
                version: mapData.version,
                sequence: mapData.sequence,
                parentSequence: mapData.parentSequence
            },
            is_vote: mapData.is_vote || false // Include vote flag from MAP data
        };

        // Handle vote metadata
        if (mapData.vote) {
            if (mapData.vote.question) {
                post.vote_question = {
                    text: mapData.content,
                    totalOptions: mapData.vote.question.totalOptions,
                    optionsHash: mapData.vote.question.optionsHash,
                    sequence: mapData.vote.question.sequence
                };
            } else if (mapData.vote.option) {
                post.vote_option = {
                    text: mapData.content,
                    lockAmount: mapData.vote.option.lockAmount,
                    lockDuration: mapData.vote.option.lockDuration,
                    optionIndex: mapData.vote.option.optionIndex,
                    sequence: mapData.vote.option.sequence
                };
            }
        }

        // Handle image data if present
        if (imageData && mapData.image) {
            post.media_type = mapData.image.contentType;
            post.raw_image_data = imageData.toString('base64');
            post.image_format = mapData.image.contentType.split('/')[1];
        }

        return post;
    } catch (error) {
        console.error('Error parsing MAP transaction:', error);
        return null;
    }
}

/**
 * Get addresses from a transaction
 * @param tx Transaction to get addresses from
 * @returns Array of addresses
 */
export function getAddressesFromTransaction(tx: JungleBusTransaction): string[] {
    return tx.addresses || [];
}

/**
 * Get author from a transaction
 * @param tx Transaction to get author from
 * @returns Author address or null
 */
export function getAuthorFromTransaction(tx: JungleBusTransaction): string | null {
    return tx.addresses?.[0] || null;
}

// Extract image data from transaction outputs
function extractImageDataV2(tx: JungleBusTransaction): Buffer | null {
    try {
        // Look for outputs with image/jpeg content type
        for (const output of tx.outputs) {
            if (output.contentType === 'image/jpeg' && output.script) {
                // Convert the script (which contains raw JPEG data) to a buffer
                const buffer = Buffer.from(output.script, 'binary');
                
                // Verify it starts with JPEG magic bytes
                if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
                    console.log('Found valid JPEG data of size:', buffer.length, 'bytes');
                    return buffer;
                }
            }
        }
        
        return null;
    } catch (error) {
        console.error('Error extracting image data:', error);
        return null;
    }
}

/**
 * Parse transaction data into key-value pairs
 * @param transaction MAP transaction
 * @returns Array of data strings
 */
function parseTransactionDataV2(transaction: JungleBusTransaction): string[] {
    const data: string[] = [];

    // Extract data from transaction inputs
    transaction.inputs?.forEach(input => {
        if (input.script) {
            try {
                const scriptStr = input.script.toString('utf8');
                data.push(...scriptStr.split(','));
            } catch (error) {
                console.error('Error parsing input script:', error);
            }
        }
    });

    // Extract data from transaction outputs
    transaction.outputs?.forEach(output => {
        if (output.script) {
            try {
                const scriptStr = output.script.toString('utf8');
                data.push(...scriptStr.split(','));
            } catch (error) {
                console.error('Error parsing output script:', error);
            }
        }
    });

    return data;
}

/**
 * Extract image from MAP transaction
 * @param transaction MAP transaction to extract image from
 * @returns Image data and metadata if found
 */
async function extractImageFromTransactionV2(transaction: JungleBusTransaction): Promise<{ data: Buffer; metadata: ImageMetadata } | null> {
    try {
        // Get transaction data
        const data = parseTransactionDataV2(transaction);
        console.log('Transaction data:', data);

        // Log outputs for debugging
        console.log('Transaction outputs:', transaction.outputs.map(output => ({
            value: output.value,
            scriptLength: output.script?.length,
            scriptPreview: output.script?.toString('utf8').substring(0, 64),
            script: output.script?.toString('utf8')
        })));

        // Extract metadata from transaction data
        const metadata: ImageMetadata = {
            contentType: data.find(item => item.startsWith('contenttype='))?.split('=')[1] || 'image/jpeg',
            encoding: data.find(item => item.startsWith('encoding='))?.split('=')[1] || 'base64',
            filename: data.find(item => item.startsWith('filename='))?.split('=')[1] || 'image.jpg',
            filesize: parseInt(data.find(item => item.startsWith('filesize='))?.split('=')[1] || '0')
        };

        // Find outputs containing image data
        const imageOutputs = await Promise.all(transaction.outputs.map(async output => {
            const result = await extractImageFromOutputV2(output);
            if (result) {
                console.log(' Found JPEG data part:', {
                    length: result.data.length,
                    preview: result.data.toString('base64').substring(0, 48)
                });
            }
            return result;
        }));

        // Filter out null results
        const validImageOutputs = imageOutputs.filter(output => output !== null) as { data: Buffer; metadata: ImageMetadata }[];

        if (validImageOutputs.length === 0) {
            console.log('No valid image data found');
            return null;
        }

        // Log found parts
        console.log(' Found JPEG parts:', {
            parts: validImageOutputs.length,
            totalLength: validImageOutputs.reduce((sum, output) => sum + output.data.length, 0),
            preview: validImageOutputs[0].data.toString('base64').substring(0, 48),
            partLengths: validImageOutputs.map(output => output.data.length)
        });

        // Combine image data if fragmented
        const combinedData = Buffer.concat(validImageOutputs.map(output => output.data));

        // Validate combined image data
        if (!await isValidImage(combinedData, metadata.contentType)) {
            console.log('Invalid image data');
            return null;
        }

        return {
            data: combinedData,
            metadata
        };

    } catch (error) {
        console.error('Error extracting image from transaction:', error);
        return null;
    }
}

// Parse raw transaction hex into outputs
function parseRawTransactionV2(rawTx: string): JungleBusTransaction {
    try {
        // First decode the base64 transaction data
        const txBuffer = Buffer.from(rawTx, 'base64');
        console.log('Transaction data length:', txBuffer.length, 'bytes');
        
        // Convert to hex for easier parsing
        const txHex = txBuffer.toString('hex').toLowerCase();
        
        // Split on OP_RETURN (0x6a)
        const parts = txHex.split('6a');
        let outputs: JungleBusOutput[] = [];
        
        console.log('Found', parts.length - 1, 'potential OP_RETURN outputs');
        
        for (let i = 1; i < parts.length; i++) {
            const part = parts[i];
            if (!part || part.length < 4) continue;
            
            try {
                // Convert hex to buffer
                const scriptBuffer = Buffer.from(part, 'hex');
                const output: JungleBusOutput = {
                    script: part,
                    value: 0
                };
                
                // Check for JPEG signature
                if (scriptBuffer.length > 4 && 
                    scriptBuffer[0] === 0xFF && 
                    scriptBuffer[1] === 0xD8 && 
                    scriptBuffer[2] === 0xFF) {
                    console.log('Found JPEG signature in part', i);
                    output.contentType = 'image/jpeg';
                    outputs.push(output);
                    continue;
                }
                
                // Try to decode as text
                const text = scriptBuffer.toString('utf8');
                
                // Check for content type markers
                if (text.includes('image/jpeg')) {
                    console.log('Found image/jpeg content type');
                    output.contentType = 'image/jpeg';
                } else if (text.includes('text/plain')) {
                    console.log('Found text/plain content type');
                    output.contentType = 'text/plain';
                }
                
                outputs.push(output);
                
            } catch (error) {
                console.log('Error processing part', i, ':', error);
            }
        }
        
        return {
            id: '',
            outputs,
            transaction: rawTx
        };
        
    } catch (error) {
        console.error('Error parsing raw transaction:', error);
        throw error;
    }
}

/**
 * Extract image data from a transaction output
 * @param output Transaction output to extract image from
 * @returns Image data and metadata if found
 */
async function extractImageFromOutputV2(output: JungleBusOutput): Promise<{ data: Buffer; metadata: ImageMetadata } | null> {
    try {
        const script = output.script;
        if (!script) {
            console.log('No script data in output');
            return null;
        }

        // Try different methods to extract image data
        let imageBuffer: Buffer | null = null;
        let metadata: ImageMetadata = { format: 'unknown', contentType: 'unknown' };

        // Method 1: Check for base64 encoded image data
        const base64Matches = script.match(/data:image\/([a-z]+);base64,([^"'\s]+)/i);
        if (base64Matches) {
            const [_, format, base64Data] = base64Matches;
            imageBuffer = Buffer.from(base64Data, 'base64');
            metadata.format = format;
            metadata.contentType = `image/${format}`;
            console.log('Found base64 encoded image:', { format, size: imageBuffer.length });
        }

        // Method 2: Check for hex encoded image data
        if (!imageBuffer) {
            const hexData = script.split(' ').find(part => {
                try {
                    const buf = Buffer.from(part, 'hex');
                    return buf.length > 100 && isValidImage(buf);
                } catch {
                    return false;
                }
            });

            if (hexData) {
                imageBuffer = Buffer.from(hexData, 'hex');
                metadata = await detectImageFormat(imageBuffer);
                console.log('Found hex encoded image:', metadata);
            }
        }

        // Method 3: Look for image data in script chunks
        if (!imageBuffer) {
            const chunks = script.split(' ').filter(chunk => chunk.length > 100);
            for (const chunk of chunks) {
                try {
                    const buf = Buffer.from(chunk, 'hex');
                    if (await isValidImage(buf)) {
                        imageBuffer = buf;
                        metadata = await detectImageFormat(buf);
                        console.log('Found image in script chunk:', metadata);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
        }

        if (!imageBuffer) {
            console.log('No valid image data found in output');
            return null;
        }

        // Validate and process the image
        if (!await validateImageData(imageBuffer)) {
            console.log('Image validation failed');
            return null;
        }

        const processed = await processImage(imageBuffer, metadata.contentType);
        if (!processed) {
            console.log('Image processing failed');
            return null;
        }

        metadata.width = processed.width;
        metadata.height = processed.height;
        metadata.format = processed.format;

        return {
            data: imageBuffer,
            metadata
        };

    } catch (error) {
        console.error('Error extracting image from output:', error);
        return null;
    }
}

async function detectImageFormat(buffer: Buffer): Promise<ImageMetadata> {
    const metadata: ImageMetadata = {
        format: 'unknown',
        contentType: 'application/octet-stream'
    };

    // Check JPEG
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        metadata.format = 'jpeg';
        metadata.contentType = 'image/jpeg';
    }
    // Check PNG
    else if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        metadata.format = 'png';
        metadata.contentType = 'image/png';
    }
    // Check WebP
    else if (buffer.length >= 12 && 
             buffer.slice(0, 4).toString() === 'RIFF' && 
             buffer.slice(8, 12).toString() === 'WEBP') {
        metadata.format = 'webp';
        metadata.contentType = 'image/webp';
    }

    return metadata;
}

export {
    extractImageFromTransactionV2 as extractImageFromTransaction,
    extractImageDataV2 as extractImageData,
    parseRawTransactionV2 as parseRawTransaction,
    parseMapFields
};
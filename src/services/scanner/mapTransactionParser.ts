import type { JungleBusTransaction, JungleBusOutput } from './types';
import type { ParsedPost, ParsedComponent, MAP_TYPES } from './types';

// Function to parse MAP fields from a script
function parseMapFields(scriptData: string): Record<string, any> {
    try {
        const parts = scriptData.split(' ');
        const fields: Record<string, any> = {};
        let plainTextContent = '';
        
        for (let i = 0; i < parts.length; i++) {
            if (parts[i] === 'OP_RETURN' || parts[i] === 'OP_FALSE') {
                i++;
                continue;
            }
            
            const hex = parts[i];
            if (!hex) continue;
            
            try {
                const text = Buffer.from(hex, 'hex').toString('utf8');
                
                // Log the raw decoded text for debugging
                console.log(' Raw decoded text:', {
                    hex: hex.substring(0, 50),
                    text: text.substring(0, 100),
                    length: text.length
                });
                
                // Try to parse MAP fields
                if (text.startsWith('MAP_')) {
                    const mapMatch = text.match(/MAP_([A-Z_]+)=(.+)/i);
                    if (mapMatch) {
                        const [_, key, value] = mapMatch;
                        const keyLower = key.toLowerCase();
                        if (keyLower === 'content' || keyLower === 'text') {
                            plainTextContent = value.trim();
                        } else {
                            fields[keyLower] = value.trim();
                        }
                        console.log(' Found MAP field:', { key: keyLower, value: value.trim() });
                    }
                } else if (text.startsWith('1Map')) {
                    // Handle 1Map format
                    const mapData = text.substring(4);
                    try {
                        const jsonData = JSON.parse(mapData);
                        if (jsonData.content || jsonData.text) {
                            plainTextContent = jsonData.content || jsonData.text;
                            delete jsonData.content;
                            delete jsonData.text;
                        }
                        Object.assign(fields, jsonData);
                        console.log(' Found 1Map data:', jsonData);
                    } catch (e) {
                        // Not valid JSON, treat as content
                        plainTextContent = mapData;
                    }
                } else if (text.includes('=')) {
                    const [key, value] = text.split('=');
                    const keyLower = key.trim().toLowerCase();
                    if (keyLower === 'content' || keyLower === 'text') {
                        plainTextContent = value.trim();
                    } else {
                        fields[keyLower] = value.trim();
                    }
                    console.log(' Found field:', { key: keyLower, value: value.trim() });
                } else if (text.startsWith('{') && text.endsWith('}')) {
                    try {
                        const jsonData = JSON.parse(text);
                        if (jsonData.content || jsonData.text) {
                            plainTextContent = jsonData.content || jsonData.text;
                            delete jsonData.content;
                            delete jsonData.text;
                        }
                        Object.assign(fields, jsonData);
                        console.log(' Found JSON data:', jsonData);
                    } catch (e) {
                        // Not valid JSON, treat as content
                        plainTextContent = text;
                    }
                } else if (text.startsWith('data:image/')) {
                    fields.image_data = text;
                    fields.media_type = text.split(';')[0].split(':')[1];
                    console.log(' Found inline image:', {
                        mediaType: fields.media_type,
                        dataLength: text.length
                    });
                } else if (text.length > 0) {
                    // Try to detect if it's base64 encoded
                    try {
                        const decoded = Buffer.from(text, 'base64');
                        if (decoded.length > 100 && isImageBuffer(decoded)) {
                            fields.image_data = decoded;
                            fields.media_type = getImageContentType(decoded);
                            console.log(' Found base64 image:', {
                                size: decoded.length,
                                mediaType: fields.media_type
                            });
                        } else {
                            // Not an image, treat as content
                            plainTextContent = text;
                        }
                    } catch (e) {
                        // Not base64, treat as content
                        plainTextContent = text;
                    }
                }
            } catch (e) {
                console.warn(' Failed to decode hex:', hex.substring(0, 50));
                continue;
            }
        }

        // Set the content field with any plain text we found
        if (plainTextContent.trim()) {
            fields.content = plainTextContent.trim();
            console.log(' Using plain text as content:', {
                length: plainTextContent.length,
                preview: plainTextContent.substring(0, 100)
            });
        }
        
        return fields;
    } catch (error) {
        console.error(' Error parsing MAP fields:', error);
        return {};
    }
}

// Function to extract image data from a transaction
async function extractImageFromTransaction(tx: JungleBusTransaction): Promise<{ data: Buffer | null; contentType: string | null }> {
    try {
        // First check outputs for B or B64 data
        for (const output of tx.outputs || []) {
            if (!output.script?.asm) continue;

            const parts = output.script.asm.split(' ');
            for (let i = 0; i < parts.length; i++) {
                try {
                    const hex = parts[i];
                    if (!hex) continue;

                    // Try to decode as text first
                    const text = Buffer.from(hex, 'hex').toString('utf8');
                    
                    // Log what we're examining
                    console.log(' Examining potential image data:', {
                        hexPrefix: hex.substring(0, 50),
                        textPrefix: text.substring(0, 50),
                        length: text.length
                    });
                    
                    // Check for data URL format
                    if (text.startsWith('data:image/')) {
                        const [header, base64Data] = text.split(',');
                        const contentType = header.split(';')[0].split(':')[1];
                        
                        if (base64Data) {
                            const buffer = Buffer.from(base64Data, 'base64');
                            if (buffer.length > 100) {
                                console.log(' Found base64 image:', {
                                    size: buffer.length,
                                    contentType
                                });
                                return { data: buffer, contentType };
                            }
                        }
                    }
                    
                    // Try direct base64 decode
                    try {
                        const buffer = Buffer.from(text, 'base64');
                        if (buffer.length > 100 && isImageBuffer(buffer)) {
                            console.log(' Found base64 image data:', {
                                size: buffer.length,
                                contentType: getImageContentType(buffer)
                            });
                            return { 
                                data: buffer, 
                                contentType: getImageContentType(buffer) 
                            };
                        }
                    } catch (e) {
                        // Not valid base64
                    }

                    // Try direct hex decode
                    const buffer = Buffer.from(hex, 'hex');
                    if (buffer.length > 100 && isImageBuffer(buffer)) {
                        console.log(' Found hex image data:', {
                            size: buffer.length,
                            contentType: getImageContentType(buffer)
                        });
                        return { 
                            data: buffer, 
                            contentType: getImageContentType(buffer) 
                        };
                    }
                } catch (e) {
                    // Skip invalid data
                    continue;
                }
            }
        }

        // Check MAP data if available
        if (tx.MAP) {
            for (const map of tx.MAP) {
                if (map.type === 'image' && map.data) {
                    try {
                        const buffer = Buffer.from(map.data, 'base64');
                        if (buffer.length > 100 && isImageBuffer(buffer)) {
                            console.log(' Found MAP image data:', {
                                size: buffer.length,
                                contentType: getImageContentType(buffer)
                            });
                            return { 
                                data: buffer, 
                                contentType: getImageContentType(buffer) 
                            };
                        }
                    } catch (e) {
                        console.error(' Error decoding MAP image data:', e);
                    }
                }
            }
        }

        return { data: null, contentType: null };
    } catch (error) {
        console.error(' Error extracting image:', error);
        return { data: null, contentType: null };
    }
}

// Helper function to check if a buffer is an image
function isImageBuffer(buffer: Buffer): boolean {
    if (buffer.length < 100) return false;

    // Check for JPEG or PNG magic numbers
    const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8;
    const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50;

    return isJPEG || isPNG;
}

// Helper function to get content type from image buffer
function getImageContentType(buffer: Buffer): string {
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
        return 'image/jpeg';
    } else if (buffer[0] === 0x89 && buffer[1] === 0x50) {
        return 'image/png';
    }
    return 'application/octet-stream';
}

// Main function to parse a MAP transaction
export async function parseMapTransaction(tx: JungleBusTransaction): Promise<ParsedPost | null> {
    try {
        console.log('\n🔍 Parsing MAP transaction:', tx.txid);
        
        // Initialize post data
        console.log('🏷️ Transaction addresses:', tx.addresses);

        const post: ParsedPost = {
            txid: tx.txid,
            blockHeight: tx.blockHeight,
            timestamp: tx.timestamp,
            content: { text: '' },
            images: [],
            author: tx.addresses?.[0] || '',
            metadata: {}
        };

        console.log('👤 Author address:', post.author);
        
        // Handle data array from JungleBus API
        if (tx.data?.length) {
            for (const item of tx.data) {
                const [key, value] = item.split('=');
                if (!key || !value) continue;

                const keyLower = key.toLowerCase();
                
                switch (keyLower) {
                    case 'content':
                    case 'text':
                        post.content.text = value;
                        console.log('📝 Found content in data:', {
                            length: value.length,
                            preview: value.substring(0, 100)
                        });
                        break;
                    case 'type':
                        post.metadata.type = value;
                        break;
                    case 'app':
                        post.metadata.app = value;
                        break;
                    case 'postid':
                        post.metadata.postId = value;
                        break;
                    case 'timestamp':
                        post.metadata.timestamp = value;
                        break;
                    case 'sequence':
                        post.metadata.sequence = parseInt(value);
                        break;
                    case 'tags':
                        try {
                            post.tags = JSON.parse(value);
                        } catch (e) {
                            post.tags = value.split(',').map(t => t.trim());
                        }
                        break;
                    case 'cmd':
                    case 'command':
                        post.metadata.command = value;
                        break;
                    case 'contenttype':
                        if (value.startsWith('image/')) {
                            post.metadata.contentType = value;
                        }
                        break;
                }
            }
        }

        // Parse outputs for additional data and images
        for (const output of tx.outputs || []) {
            if (!output) continue;

            // Try to decode the script
            try {
                const scriptData = output;
                if (!scriptData) continue;

                // Parse hex data
                try {
                    const text = Buffer.from(scriptData, 'hex').toString('utf8');
                    console.log('🔍 Decoded output:', {
                        hex: scriptData.substring(0, 50),
                        text: text.substring(0, 100)
                    });

                    // Check for image data
                    if (text.startsWith('data:image/')) {
                        const [header, base64Data] = text.split(',');
                        if (base64Data) {
                            const contentType = header.split(';')[0].split(':')[1];
                            const data = Buffer.from(base64Data, 'base64');
                            post.images?.push({
                                data,
                                contentType,
                                dataURL: text
                            });
                        }
                    } else if (!post.content.text) {
                        // Try to parse content from the output if we don't have it yet
                        const fields = parseMapFields(scriptData);
                        if (fields.content) {
                            post.content.text = fields.content;
                            console.log('📝 Found content in output:', {
                                length: fields.content.length,
                                preview: fields.content.substring(0, 100)
                            });
                        }
                    }
                } catch (error) {
                    // Not valid UTF-8, might be binary data
                    if (isImageBuffer(Buffer.from(scriptData, 'hex'))) {
                        const data = Buffer.from(scriptData, 'hex');
                        const contentType = getImageContentType(data);
                        post.images?.push({
                            data,
                            contentType,
                            dataURL: `data:${contentType};base64,${data.toString('base64')}`
                        });
                    }
                }
            } catch (error) {
                console.warn('⚠️ Error parsing output:', error);
                continue;
            }
        }

        // Validate required fields
        if (!post.content?.text && (!post.images || post.images.length === 0)) {
            console.log('❌ No content or images found in transaction');
            return null;
        }

        console.log('✅ Successfully parsed MAP transaction:', {
            txid: post.txid,
            content: post.content?.text,
            contentLength: post.content?.text?.length || 0,
            author: post.author,
            metadata: post.metadata,
            imageCount: post.images?.length
        });

        return post;
    } catch (error) {
        console.error('❌ Error parsing MAP transaction:', error);
        return null;
    }
}
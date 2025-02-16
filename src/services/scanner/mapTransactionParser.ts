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

// Helper function to check if a buffer is an image
function isImageBuffer(buffer: Buffer): boolean {
    if (buffer.length < 12) return false;  // Need at least 12 bytes for reliable detection

    // JPEG: FF D8 FF
    const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    const isPNG = buffer[0] === 0x89 && 
                 buffer[1] === 0x50 && 
                 buffer[2] === 0x4E && 
                 buffer[3] === 0x47 && 
                 buffer[4] === 0x0D && 
                 buffer[5] === 0x0A && 
                 buffer[6] === 0x1A && 
                 buffer[7] === 0x0A;

    // GIF: 47 49 46 38 (followed by either 37a or 39a)
    const isGIF = buffer[0] === 0x47 && 
                 buffer[1] === 0x49 && 
                 buffer[2] === 0x46 && 
                 buffer[3] === 0x38 && 
                 (buffer[4] === 0x37 || buffer[4] === 0x39) && 
                 buffer[5] === 0x61;

    // WebP: 52 49 46 46 xx xx xx xx 57 45 42 50
    const isWebP = buffer[0] === 0x52 && 
                  buffer[1] === 0x49 && 
                  buffer[2] === 0x46 && 
                  buffer[3] === 0x46 && 
                  buffer[8] === 0x57 && 
                  buffer[9] === 0x45 && 
                  buffer[10] === 0x42 && 
                  buffer[11] === 0x50;

    // BMP: 42 4D
    const isBMP = buffer[0] === 0x42 && buffer[1] === 0x4D;

    return isJPEG || isPNG || isGIF || isWebP || isBMP;
}

// Helper function to get content type from image buffer
function getImageContentType(buffer: Buffer): string {
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return 'image/jpeg';
    } else if (buffer[0] === 0x89 && buffer[1] === 0x50) {
        return 'image/png';
    } else if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
        return 'image/gif';
    } else if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
        return 'image/webp';
    } else if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
        return 'image/bmp';
    }
    return 'application/octet-stream';
}

// Helper function to normalize base64 data
function normalizeBase64(data: string): string {
    // Remove any whitespace
    data = data.replace(/\s/g, '');
    
    // Handle URL-safe base64
    data = data.replace(/-/g, '+').replace(/_/g, '/');
    
    // Add padding if needed
    while (data.length % 4) {
        data += '=';
    }
    
    return data;
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
                            try {
                                const normalizedBase64 = normalizeBase64(base64Data);
                                const buffer = Buffer.from(normalizedBase64, 'base64');
                                if (buffer.length > 12 && isImageBuffer(buffer)) {
                                    console.log(' Found data URL image:', {
                                        size: buffer.length,
                                        contentType
                                    });
                                    return { data: buffer, contentType };
                                }
                            } catch (e) {
                                console.error(' Error decoding data URL:', e);
                            }
                        }
                    }
                    
                    // Try direct base64 decode
                    try {
                        const normalizedText = normalizeBase64(text);
                        const buffer = Buffer.from(normalizedText, 'base64');
                        if (buffer.length > 12 && isImageBuffer(buffer)) {
                            const contentType = getImageContentType(buffer);
                            console.log(' Found base64 image data:', {
                                size: buffer.length,
                                contentType
                            });
                            return { data: buffer, contentType };
                        }
                    } catch (e) {
                        // Not valid base64
                    }

                    // Try direct hex decode
                    const buffer = Buffer.from(hex, 'hex');
                    if (buffer.length > 12 && isImageBuffer(buffer)) {
                        const contentType = getImageContentType(buffer);
                        console.log(' Found hex image data:', {
                            size: buffer.length,
                            contentType
                        });
                        return { data: buffer, contentType };
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
                        const normalizedData = normalizeBase64(map.data);
                        const buffer = Buffer.from(normalizedData, 'base64');
                        if (buffer.length > 12 && isImageBuffer(buffer)) {
                            const contentType = getImageContentType(buffer);
                            console.log(' Found MAP image data:', {
                                size: buffer.length,
                                contentType
                            });
                            return { data: buffer, contentType };
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
                        // Skip content validation for vote options and vote questions
                        if (value === 'vote_option') {
                            post.metadata.isVoteOption = true;
                        } else if (value === 'vote_question') {
                            post.metadata.isVoteQuestion = true;
                        }
                        break;
                    case 'options':
                    case 'voteoptions':
                    case 'vote_options':
                        try {
                            // Parse vote options if they're included in the post
                            let optionsArray;
                            if (typeof value === 'string') {
                                // Try to parse as JSON first
                                try {
                                    const parsed = JSON.parse(value);
                                    optionsArray = Array.isArray(parsed) ? parsed : [parsed];
                                } catch (e) {
                                    // If not JSON, try various string splitting methods
                                    // First try comma or semicolon
                                    let splitOptions = value.split(/[,;]/).map(s => s.trim());
                                    
                                    // If we only got one option, try splitting by whitespace
                                    if (splitOptions.length === 1 && value.includes(' ')) {
                                        splitOptions = value.split(/\s+/).map(s => s.trim());
                                    }
                                    
                                    // Filter out empty options
                                    optionsArray = splitOptions.filter(opt => opt.length > 0);
                                }
                            } else if (Array.isArray(value)) {
                                optionsArray = value;
                            } else if (typeof value === 'object' && value !== null) {
                                optionsArray = [value];
                            }

                            if (Array.isArray(optionsArray) && optionsArray.length > 0) {
                                post.metadata.voteOptions = optionsArray.map((option, index) => {
                                    // Handle both string and object options
                                    const optionObj = typeof option === 'string' ? { text: option } : option;
                                    
                                    // Ensure text is always a string
                                    const text = String(optionObj.text || optionObj.content || optionObj.label || '').trim();
                                    
                                    // Parse numeric values safely
                                    const safeParseInt = (val: any) => {
                                        if (typeof val === 'number') return Math.floor(val);
                                        if (typeof val === 'string') {
                                            const parsed = parseInt(val);
                                            return isNaN(parsed) ? 0 : parsed;
                                        }
                                        return 0;
                                    };

                                    const voteOption = {
                                        text,
                                        description: optionObj.description || '',
                                        lockAmount: safeParseInt(optionObj.lockAmount),
                                        lockDuration: safeParseInt(optionObj.lockDuration),
                                        lockPercentage: safeParseInt(optionObj.lockPercentage),
                                        optionIndex: safeParseInt(optionObj.optionIndex) || index
                                    };

                                    // Log warning if required text is missing
                                    if (!text) {
                                        console.warn(`⚠️ Vote option ${index} is missing required text:`, optionObj);
                                    }

                                    return voteOption;
                                }).filter(opt => opt.text.length > 0); // Filter out options with no text

                                if (post.metadata.voteOptions.length > 0) {
                                    console.log('📊 Found vote options:', post.metadata.voteOptions);
                                } else {
                                    console.warn('⚠️ No valid vote options found after parsing');
                                }
                            }
                        } catch (e) {
                            console.warn('⚠️ Error parsing vote options:', {
                                error: e.message,
                                rawValue: value,
                                valueType: typeof value
                            });
                        }
                        break;
                    case 'app':
                        post.metadata.app = value;
                        break;
                    case 'postid':
                        post.metadata.postId = value;
                        break;
                    case 'parenttxid':
                        post.metadata.parentTxid = value;
                        break;
                    case 'lockamount':
                        post.metadata.lockAmount = parseInt(value);
                        break;
                    case 'lockduration':
                        post.metadata.lockDuration = parseInt(value);
                        break;
                    case 'optionindex':
                        post.metadata.optionIndex = parseInt(value);
                        break;
                    case 'lockpercentage':
                        post.metadata.lockPercentage = parseInt(value);
                        break;
                    case 'timestamp':
                        post.metadata.timestamp = value;
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
                    case 'tags':
                        try {
                            post.tags = JSON.parse(value);
                        } catch (e) {
                            post.tags = value.split(',').map(t => t.trim());
                        }
                        break;
                }
            }
        }

        // Parse outputs for additional data and images
        for (const output of tx.outputs) {
            try {
                const script = output.outputScript;
                if (!script) continue;

                // Convert script to Buffer if it's not already
                const scriptBuffer = Buffer.isBuffer(script) ? script : Buffer.from(script);
                
                // Convert to hex string for parsing
                const scriptHex = scriptBuffer.toString('hex');

                // Check for OP_FALSE OP_RETURN
                if (!scriptHex.startsWith('006a')) {
                    continue;
                }

                // Extract MAP prefix
                const mapPrefix = scriptHex.slice(4, 8);
                if (mapPrefix !== '6d01') {
                    continue;
                }

                // Extract and parse JSON data
                const jsonHex = scriptHex.slice(8);
                const jsonData = Buffer.from(jsonHex, 'hex').toString('utf8');

                try {
                    const data = JSON.parse(jsonData);
                    console.log('📦 Parsed MAP data:', data);

                    // Process each key-value pair
                    for (const [key, value] of Object.entries(data)) {
                        switch (key.toLowerCase()) {
                            case 'content':
                            case 'text':
                                post.content.text = value;
                                console.log('📝 Found content in output:', {
                                    length: value.length,
                                    preview: value.substring(0, 100)
                                });
                                break;
                            case 'type':
                                post.metadata.type = value;
                                // Skip content validation for vote options and vote questions
                                if (value === 'vote_option') {
                                    post.metadata.isVoteOption = true;
                                } else if (value === 'vote_question') {
                                    post.metadata.isVoteQuestion = true;
                                }
                                break;
                            case 'options':
                            case 'voteoptions':
                            case 'vote_options':
                                try {
                                    // Parse vote options if they're included in the post
                                    let optionsArray;
                                    if (typeof value === 'string') {
                                        // Try to parse as JSON first
                                        try {
                                            const parsed = JSON.parse(value);
                                            optionsArray = Array.isArray(parsed) ? parsed : [parsed];
                                        } catch (e) {
                                            // If not JSON, try various string splitting methods
                                            // First try comma or semicolon
                                            let splitOptions = value.split(/[,;]/).map(s => s.trim());
                                            
                                            // If we only got one option, try splitting by whitespace
                                            if (splitOptions.length === 1 && value.includes(' ')) {
                                                splitOptions = value.split(/\s+/).map(s => s.trim());
                                            }
                                            
                                            // Filter out empty options
                                            optionsArray = splitOptions.filter(opt => opt.length > 0);
                                        }
                                    } else if (Array.isArray(value)) {
                                        optionsArray = value;
                                    } else if (typeof value === 'object' && value !== null) {
                                        optionsArray = [value];
                                    }

                                    if (Array.isArray(optionsArray) && optionsArray.length > 0) {
                                        post.metadata.voteOptions = optionsArray.map((option, index) => {
                                            // Handle both string and object options
                                            const optionObj = typeof option === 'string' ? { text: option } : option;
                                            
                                            // Ensure text is always a string
                                            const text = String(optionObj.text || optionObj.content || optionObj.label || '').trim();
                                            
                                            // Parse numeric values safely
                                            const safeParseInt = (val: any) => {
                                                if (typeof val === 'number') return Math.floor(val);
                                                if (typeof val === 'string') {
                                                    const parsed = parseInt(val);
                                                    return isNaN(parsed) ? 0 : parsed;
                                                }
                                                return 0;
                                            };

                                            const voteOption = {
                                                text,
                                                description: optionObj.description || '',
                                                lockAmount: safeParseInt(optionObj.lockAmount),
                                                lockDuration: safeParseInt(optionObj.lockDuration),
                                                lockPercentage: safeParseInt(optionObj.lockPercentage),
                                                optionIndex: safeParseInt(optionObj.optionIndex) || index
                                            };

                                            // Log warning if required text is missing
                                            if (!text) {
                                                console.warn(`⚠️ Vote option ${index} is missing required text:`, optionObj);
                                            }

                                            return voteOption;
                                        }).filter(opt => opt.text.length > 0); // Filter out options with no text

                                        if (post.metadata.voteOptions.length > 0) {
                                            console.log('📊 Found vote options:', post.metadata.voteOptions);
                                        } else {
                                            console.warn('⚠️ No valid vote options found after parsing');
                                        }
                                    }
                                } catch (e) {
                                    console.warn('⚠️ Error parsing vote options:', {
                                        error: e.message,
                                        rawValue: value,
                                        valueType: typeof value
                                    });
                                }
                                break;
                            case 'app':
                                post.metadata.app = value;
                                break;
                            case 'postid':
                                post.metadata.postId = value;
                                break;
                            case 'parenttxid':
                                post.metadata.parentTxid = value;
                                break;
                            case 'lockamount':
                                post.metadata.lockAmount = parseInt(value);
                                break;
                            case 'lockduration':
                                post.metadata.lockDuration = parseInt(value);
                                break;
                            case 'optionindex':
                                post.metadata.optionIndex = parseInt(value);
                                break;
                            case 'lockpercentage':
                                post.metadata.lockPercentage = parseInt(value);
                                break;
                            case 'timestamp':
                                post.metadata.timestamp = value;
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
                            case 'tags':
                                try {
                                    post.tags = JSON.parse(value);
                                } catch (e) {
                                    post.tags = value.split(',').map(t => t.trim());
                                }
                                break;
                        }
                    }
                } catch (e) {
                    console.error(' Error parsing JSON data:', e);
                }
            }
        }

        // Validate required fields - skip validation for vote options and vote questions
        if (!post.metadata.isVoteOption && !post.metadata.isVoteQuestion && !post.content?.text && (!post.images || post.images.length === 0)) {
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
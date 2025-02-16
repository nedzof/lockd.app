import type { JungleBusTransaction, JungleBusOutput } from './types';
import type { ParsedPost, ParsedComponent, MAP_TYPES } from './types';
import { isValidImage, processImage, hasJpegSignature } from './imageProcessor';

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
async function extractImageFromTransaction(tx: JungleBusTransaction): Promise<{ data: Buffer | null; contentType: string | null; metadata?: any }> {
    try {
        // Check if we have image metadata in tx.data
        let contentType = null;
        let encoding = null;
        let imageData = null;
        let expectedSize = null;

        if (tx.data) {
            for (const item of tx.data) {
                const [key, value] = item.split('=');
                if (!key || !value) continue;

                switch (key.toLowerCase()) {
                    case 'contenttype':
                        contentType = value;
                        break;
                    case 'encoding':
                        encoding = value;
                        break;
                    case 'filesize':
                        expectedSize = parseInt(value, 10);
                        break;
                }
            }
        }

        // First check outputs for B or B64 data
        let jpegBase64Parts: string[] = [];
        let foundJpeg = false;

        for (const output of tx.outputs || []) {
            if (!output.script?.asm) continue;

            // Clean up ASM content
            const cleanAsm = output.script.asm.replace(/\s+/g, '');

            // Check for JPEG signature
            if (cleanAsm.includes('/9j/')) {
                foundJpeg = true;
                try {
                    // Extract all base64 data after JPEG signature
                    const jpegStart = cleanAsm.indexOf('/9j/');
                    if (jpegStart !== -1) {
                        // Take everything after the JPEG signature that looks like base64
                        const base64Data = cleanAsm.slice(jpegStart);
                        console.log(' Found JPEG data part:', {
                            length: base64Data.length,
                            preview: base64Data.substring(0, 50)
                        });
                        jpegBase64Parts.push(base64Data);
                    }
                } catch (e) {
                    console.error(' Error extracting JPEG data:', e);
                }
                continue;
            } else if (foundJpeg) {
                // If we've found a JPEG start, look for continuation data
                try {
                    // Look for base64 data
                    const base64Match = cleanAsm.match(/^[A-Za-z0-9+/=]+/);
                    if (base64Match) {
                        const base64Data = base64Match[0];
                        console.log(' Found continuation data:', {
                            length: base64Data.length,
                            preview: base64Data.substring(0, 50)
                        });
                        jpegBase64Parts.push(base64Data);
                    }
                } catch (e) {
                    console.error(' Error extracting continuation data:', e);
                }
                continue;
            }

            // Try to find the longest hex string that might be our image
            const hexStrings = cleanAsm.match(/[0-9a-fA-F]{100,}/g) || [];
            
            // Sort by length, longest first
            hexStrings.sort((a, b) => b.length - a.length);
            
            for (const hex of hexStrings) {
                try {
                    // Try to decode as text first
                    const text = Buffer.from(hex, 'hex').toString('utf8');
                    
                    // Log what we're examining
                    console.log(' Examining potential image data:', {
                        hexLength: hex.length,
                        textLength: text.length,
                        contentType,
                        encoding,
                        textPreview: text.substring(0, 50)
                    });
                    
                    // Check for data URL format
                    if (text.startsWith('data:image/')) {
                        const [header, base64Data] = text.split(',');
                        contentType = header.split(';')[0].split(':')[1];
                        
                        if (base64Data) {
                            try {
                                const normalizedBase64 = normalizeBase64(base64Data);
                                const buffer = Buffer.from(normalizedBase64, 'base64');
                                if (await isValidImage(buffer)) {
                                    const processed = await processImage(buffer, contentType);
                                    if (processed) {
                                        console.log(' Found data URL image:', {
                                            size: processed.data.length,
                                            width: processed.width,
                                            height: processed.height,
                                            format: processed.format,
                                            expectedSize
                                        });
                                        return { 
                                            data: processed.data, 
                                            contentType,
                                            metadata: {
                                                width: processed.width,
                                                height: processed.height,
                                                format: processed.format
                                            }
                                        };
                                    }
                                }
                            } catch (e) {
                                console.error(' Error decoding data URL:', e);
                            }
                        }
                    }
                    
                    // If we know it's base64 encoded, try decoding
                    if (encoding === 'base64') {
                        try {
                            const normalizedText = normalizeBase64(text);
                            const buffer = Buffer.from(normalizedText, 'base64');
                            if (await isValidImage(buffer)) {
                                const processed = await processImage(buffer, contentType || 'image/jpeg');
                                if (processed) {
                                    console.log(' Found base64 image data:', {
                                        size: processed.data.length,
                                        width: processed.width,
                                        height: processed.height,
                                        format: processed.format,
                                        expectedSize
                                    });
                                    return { 
                                        data: processed.data, 
                                        contentType: contentType || `image/${processed.format.toLowerCase()}`,
                                        metadata: {
                                            width: processed.width,
                                            height: processed.height,
                                            format: processed.format
                                        }
                                    };
                                }
                            }
                        } catch (e) {
                            // Not valid base64
                        }
                    }

                    // Try direct hex decode
                    const buffer = Buffer.from(hex, 'hex');
                    if (await isValidImage(buffer)) {
                        const processed = await processImage(buffer, contentType || 'image/jpeg');
                        if (processed) {
                            console.log(' Found hex image data:', {
                                size: processed.data.length,
                                width: processed.width,
                                height: processed.height,
                                format: processed.format,
                                expectedSize
                            });
                            return { 
                                data: processed.data, 
                                contentType: contentType || `image/${processed.format.toLowerCase()}`,
                                metadata: {
                                    width: processed.width,
                                    height: processed.height,
                                    format: processed.format
                                }
                            };
                        }
                    }

                    // If we have content type but no image yet, try base64 decode
                    if (contentType && contentType.startsWith('image/')) {
                        try {
                            const normalizedText = normalizeBase64(text);
                            const buffer = Buffer.from(normalizedText, 'base64');
                            if (await isValidImage(buffer)) {
                                const processed = await processImage(buffer, contentType);
                                if (processed) {
                                    console.log(' Found image data with known content type:', {
                                        size: processed.data.length,
                                        width: processed.width,
                                        height: processed.height,
                                        format: processed.format,
                                        expectedSize
                                    });
                                    return { 
                                        data: processed.data, 
                                        contentType,
                                        metadata: {
                                            width: processed.width,
                                            height: processed.height,
                                            format: processed.format
                                        }
                                    };
                                }
                            }
                        } catch (e) {
                            // Not valid base64
                        }
                    }
                } catch (e) {
                    // Skip invalid data
                    continue;
                }
            }
        }

        // If we found JPEG parts, try to combine them
        if (jpegBase64Parts.length > 0) {
            try {
                const combinedBase64 = jpegBase64Parts.join('');
                console.log(' Found JPEG parts:', {
                    parts: jpegBase64Parts.length,
                    totalLength: combinedBase64.length,
                    preview: combinedBase64.substring(0, 50),
                    partLengths: jpegBase64Parts.map(p => p.length)
                });

                const buffer = Buffer.from(combinedBase64, 'base64');
                if (await isValidImage(buffer)) {
                    const processed = await processImage(buffer, 'image/jpeg');
                    if (processed) {
                        console.log(' Successfully combined JPEG data:', {
                            size: processed.data.length,
                            width: processed.width,
                            height: processed.height,
                            format: processed.format,
                            expectedSize
                        });
                        return { 
                            data: processed.data, 
                            contentType: 'image/jpeg',
                            metadata: {
                                width: processed.width,
                                height: processed.height,
                                format: processed.format
                            }
                        };
                    }
                }
            } catch (e) {
                console.error(' Error combining JPEG parts:', e);
            }
        }

        // Check MAP data if available
        if (tx.MAP) {
            for (const map of tx.MAP) {
                if (map.type === 'image' && map.data) {
                    try {
                        const normalizedData = normalizeBase64(map.data);
                        const buffer = Buffer.from(normalizedData, 'base64');
                        if (await isValidImage(buffer)) {
                            const processed = await processImage(buffer, contentType || 'image/jpeg');
                            if (processed) {
                                console.log(' Found MAP image data:', {
                                    size: processed.data.length,
                                    width: processed.width,
                                    height: processed.height,
                                    format: processed.format,
                                    expectedSize
                                });
                                return { 
                                    data: processed.data, 
                                    contentType: contentType || `image/${processed.format.toLowerCase()}`,
                                    metadata: {
                                        width: processed.width,
                                        height: processed.height,
                                        format: processed.format
                                    }
                                };
                            }
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
    if (buffer.length < 12) return false;

    // Check for common image magic numbers
    const signatures = {
        // JPEG
        jpeg: [[0xFF, 0xD8, 0xFF]],
        // PNG
        png: [[0x89, 0x50, 0x4E, 0x47]],
        // GIF
        gif: [
            [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], // GIF87a
            [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]  // GIF89a
        ],
        // WebP
        webp: [[0x52, 0x49, 0x46, 0x46]], // RIFF....WEBP
        // BMP
        bmp: [[0x42, 0x4D]], // BM
    };

    // Helper to check if buffer starts with signature
    const startsWith = (sig: number[]): boolean => {
        return sig.every((byte, i) => buffer[i] === byte);
    };

    // Check JPEG
    if (signatures.jpeg.some(startsWith)) return true;

    // Check PNG
    if (signatures.png.some(startsWith)) return true;

    // Check GIF
    if (signatures.gif.some(startsWith)) return true;

    // Check WebP (needs additional WEBP check at offset 8)
    if (signatures.webp.some(startsWith) && 
        buffer.length > 12 && 
        buffer.toString('ascii', 8, 12) === 'WEBP') {
        return true;
    }

    // Check BMP
    if (signatures.bmp.some(startsWith)) return true;

    return false;
}

// Helper function to get content type from image buffer
function getImageContentType(buffer: Buffer): string {
    if (!buffer || buffer.length < 12) return 'application/octet-stream';

    // JPEG
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
        return 'image/jpeg';
    }
    
    // PNG
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
        return 'image/png';
    }
    
    // GIF
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
        return 'image/gif';
    }
    
    // WebP
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer.toString('ascii', 8, 12) === 'WEBP') {
        return 'image/webp';
    }
    
    // BMP
    if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
        return 'image/bmp';
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

        // Try to extract image first
        const imageResult = await extractImageFromTransaction(tx);
        if (imageResult.data && imageResult.contentType) {
            post.images.push({
                data: imageResult.data,
                contentType: imageResult.contentType,
                metadata: imageResult.metadata
            });
            console.log('🖼️ Found image:', {
                contentType: imageResult.contentType,
                size: imageResult.data.length,
                width: imageResult.metadata?.width,
                height: imageResult.metadata?.height,
                format: imageResult.metadata?.format
            });
        }

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
            } catch (error) {
                console.warn('⚠️ Error parsing output:', error);
                continue;
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

// Types
interface ImageMetadata {
    contentType: string;
    encoding: string;
    filename: string;
    filesize: number;
}

/**
 * Extract image data from a transaction output
 * @param output Transaction output to extract image from
 * @returns Image data and metadata if found
 */
async function extractImageFromOutputV2(output: JungleBusOutput): Promise<{ data: Buffer; metadata: ImageMetadata } | null> {
    try {
        // Check if output contains image data
        if (!output.script) {
            return null;
        }

        // Convert script to string for checking
        const scriptStr = output.script.toString('utf8');

        // Check for JPEG signature
        if (scriptStr.includes('/9j/')) {
            // Extract metadata from script
            const metadata: ImageMetadata = {
                contentType: 'image/jpeg',
                encoding: 'base64',
                filename: 'image.jpg',
                filesize: output.script.length
            };

            // Convert script to buffer
            const buffer = Buffer.from(output.script);
            
            return {
                data: buffer,
                metadata
            };
        }

        return null;
    } catch (error) {
        console.error('Error extracting image from output:', error);
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
        console.log('📦 Transaction data:', data);

        // Log outputs for debugging
        console.log('📄 Transaction outputs:', transaction.outputs.map(output => ({
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
            console.log('❌ No valid image data found');
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
            console.log('❌ Invalid image data');
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

// Export functions
export {
    extractImageFromTransactionV2 as extractImageFromTransaction,
    parseMapFields,
    isImageBuffer,
    getImageContentType,
    ImageMetadata
};
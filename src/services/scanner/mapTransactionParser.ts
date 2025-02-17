import { JungleBusTransaction, JungleBusOutput, ParsedPost, MAP_TYPES, TransactionOutput } from './types';
import { processImage, ProcessedImage } from './imageProcessor';
import { LRUCache } from 'lru-cache';
import { AsyncQueue } from 'async-queue';
import { ImageProcessor, ImageProcessingError, cachedImageProcessing, imageProcessor } from './imageProcessor';

// Constants
const MAP_PROTOCOL_MARKERS = {
    MAP_PREFIX: '1PuQa7K62MiKCtssSLKy1kh56WWU7MtUR5',
    APP: 'lockd.app',
    TYPE: 'post'
} as const;

// Protocol Handlers
interface ProtocolHandler {
    name: string;
    version: string;
    detect: (script: string) => boolean;
    parse: (tx: JungleBusTransaction) => Promise<ParsedPost>;
}

// Protocol Parsers
async function parseMAPv1(tx: JungleBusTransaction): Promise<ParsedPost> {
    if (!tx.transaction) {
        throw new Error('No transaction data found');
    }

    // Parse the raw transaction data
    const txData = Buffer.from(tx.transaction, 'hex');
    const outputs = parseTransactionOutputs(txData);

    const mapOutput = outputs.find(o => o.script && o.script.includes(MAP_PROTOCOL_MARKERS.MAP_PREFIX));
    if (!mapOutput || !mapOutput.script) {
        throw new Error('No valid MAP output found');
    }

    const data = parseMapData(mapOutput.script);
    const timestamp = Math.floor(new Date(data.timestamp || Date.now()).getTime() / 1000);
    
    return {
        txid: tx.id,
        postId: data.postId || tx.id,
        author: data.author || '',
        blockHeight: 0, // Will be filled in by the scanner
        blockTime: timestamp,
        timestamp,
        content: {
            text: data.content || '',
            title: data.title,
            description: data.description
        },
        metadata: {
            app: data.app || MAP_PROTOCOL_MARKERS.APP,
            version: data.version || '1.0',
            type: data.type || MAP_TYPES.CONTENT,
            postId: data.postId || tx.id,
            sequence: data.sequence || 0,
            timestamp: new Date(timestamp * 1000).toISOString(),
            voteOptions: data.voteOptions || [],
            optionsHash: data.optionsHash,
            lockAmount: data.lockAmount,
            lockDuration: data.lockDuration,
            optionIndex: data.optionIndex,
            parentSequence: data.parentSequence
        },
        images: [],
        tags: data.tags || []
    };
}

async function parseMAPv2(tx: JungleBusTransaction): Promise<ParsedPost> {
    const basePost = await parseMAPv1(tx);
    
    // Add v2 specific parsing
    const imageOutputs = tx.outputs?.filter(o => 
        o && o.script && (
            o.script.includes('image:') ||
            o.script.includes('data:image/')
        )
    ) || [];

    if (imageOutputs.length > 0) {
        try {
            const processedImages = await Promise.all(imageOutputs.map(async (output) => {
                if (!output || !output.script) return {
                    data: null,
                    contentType: '',
                    dataURL: null
                };
                
                try {
                    const processed = await imageProcessor.processImage(Buffer.from(output.script, 'hex'));
                    return {
                        data: processed.data,
                        contentType: processed.metadata.mimeType,
                        dataURL: processed.dataUrl || null
                    };
                } catch (error) {
                    console.error('Failed to process image:', error);
                    return {
                        data: null,
                        contentType: '',
                        dataURL: null
                    };
                }
            }));
            
            basePost.images = processedImages;
        } catch (error) {
            console.error('Error processing images:', error);
            basePost.images = [];
        }
    }

    return basePost;
}

async function parseBitcom(tx: JungleBusTransaction): Promise<ParsedPost> {
    // Implement Bitcom protocol parsing
    throw new Error('Bitcom protocol parsing not implemented');
}

function parseTransactionOutputs(txData: Buffer): TransactionOutput[] {
    // Skip version (4 bytes), input count (1-9 bytes), inputs
    let offset = 4;
    const outputs: TransactionOutput[] = [];

    // Parse outputs
    const outputCount = txData.readUInt8(offset++);
    for (let i = 0; i < outputCount; i++) {
        // Read value (8 bytes)
        const value = txData.readBigUInt64LE(offset);
        offset += 8;

        // Read script length (1-9 bytes)
        const scriptLength = txData.readUInt8(offset++);

        // Read script
        const script = txData.slice(offset, offset + scriptLength).toString('utf8');
        offset += scriptLength;

        outputs.push({
            value: Number(value),
            script
        });
    }

    return outputs;
}

// Protocol Registry
const PROTOCOL_REGISTRY: ProtocolHandler[] = [
    {
        name: 'MAP',
        version: '1.0',
        detect: (script: string) => script.includes(MAP_PROTOCOL_MARKERS.MAP_PREFIX),
        parse: parseMAPv1
    },
    {
        name: 'MAP',
        version: '2.0',
        detect: (script: string) => script.includes(MAP_PROTOCOL_MARKERS.MAP_PREFIX),
        parse: parseMAPv2
    },
    {
        name: 'Bitcom',
        version: '1.0',
        detect: (script: string) => script.includes('1BitcoinOrg'),
        parse: parseBitcom
    }
];

// Helper Functions
function parseMapData(script: string): any {
    try {
        // Parse the script into parts
        const parts = script.split(' ');
        const mapPrefix = parts.find(p => p === MAP_PROTOCOL_MARKERS.MAP_PREFIX);
        if (!mapPrefix) {
            throw new Error('Invalid MAP prefix');
        }

        // Extract the data parts
        const dataParts = parts.slice(parts.indexOf(mapPrefix) + 1);
        const data: any = {};

        // Parse each part
        for (let i = 0; i < dataParts.length; i++) {
            const part = dataParts[i];
            
            if (part === 'SET') {
                // Next part should be the key
                const key = dataParts[++i];
                if (!key) continue;

                // Next part should be the value
                const value = dataParts[++i];
                if (!value) continue;

                // Parse the value based on the key
                switch (key) {
                    case 'app':
                        data.app = value;
                        break;
                    case 'type':
                        data.type = value;
                        break;
                    case 'content':
                        data.content = value;
                        break;
                    case 'postId':
                        data.postId = value;
                        break;
                    case 'sequence':
                        data.sequence = parseInt(value, 10);
                        break;
                    case 'timestamp':
                        data.timestamp = value;
                        break;
                    case 'tags':
                        try {
                            data.tags = JSON.parse(value);
                        } catch {
                            data.tags = [];
                        }
                        break;
                    case 'optionsHash':
                        data.optionsHash = value;
                        break;
                    case 'lockAmount':
                        data.lockAmount = parseInt(value, 10);
                        break;
                    case 'lockDuration':
                        data.lockDuration = parseInt(value, 10);
                        break;
                    case 'optionIndex':
                        data.optionIndex = parseInt(value, 10);
                        break;
                    case 'parentSequence':
                        data.parentSequence = parseInt(value, 10);
                        break;
                    default:
                        data[key] = value;
                }
            }
        }

        return data;
    } catch (error) {
        console.error('Error parsing MAP data:', error);
        return {};
    }
}

// Main Parser
async function parseMapTransaction(tx: JungleBusTransaction): Promise<ParsedPost | null> {
    try {
        // Parse the raw transaction data
        const outputs = tx.outputs || [];

        console.log('Total outputs:', outputs.length);
        console.log('Outputs:', outputs);

        // Find MAP outputs
        const mapOutputs = outputs.filter(o => {
            if (!o || !o.script) return false;
            try {
                const script = o.script;
                let decodedScript = script;

                // First try to decode as hex
                try {
                    const hexBuffer = Buffer.from(script, 'hex');
                    const hexStr = hexBuffer.toString();
                    
                    // Check if it contains the ord protocol markers
                    if (hexStr.includes('ord') && hexStr.includes('text/plain')) {
                        return true;
                    }
                } catch (e) {
                    // If hex decode fails, try base64
                    try {
                        const base64Buffer = Buffer.from(script, 'base64');
                        const base64Str = base64Buffer.toString();
                        if (base64Str.includes('ord') && base64Str.includes('text/plain')) {
                            return true;
                        }
                    } catch (error) {
                        // If both decodings fail, return false
                        return false;
                    }
                }
                return false;
            } catch (error) {
                console.error('Error processing script:', error);
                return false;
            }
        });

        if (mapOutputs.length === 0) {
            console.log('No MAP outputs found');
            return null;
        }

        // Parse each MAP output
        const postData: any = {};
        for (const output of mapOutputs) {
            try {
                let decodedScript = output.script!;
                let data;

                // First try to decode as hex
                try {
                    const hexBuffer = Buffer.from(decodedScript, 'hex');
                    data = hexBuffer.toString();
                } catch (e) {
                    // If hex decode fails, try base64
                    try {
                        const base64Buffer = Buffer.from(decodedScript, 'base64');
                        data = base64Buffer.toString();
                    } catch (error) {
                        console.error('Failed to decode script:', error);
                        continue;
                    }
                }

                // Extract the content after text/plain
                const textPlainIndex = data.indexOf('text/plain');
                if (textPlainIndex !== -1) {
                    // Skip past text/plain and any null bytes
                    let contentStart = textPlainIndex + 10;
                    while (contentStart < data.length && data.charCodeAt(contentStart) === 0) {
                        contentStart++;
                    }
                    data = data.substring(contentStart);
                }

                // Parse the SET data
                const setIndex = data.indexOf('SET');
                if (setIndex === -1) continue;

                // Extract key-value pairs
                const parts = data.split(' ');
                const setPartIndex = parts.indexOf('SET');
                if (setPartIndex === -1) continue;

                // Parse SET key-value pairs
                for (let i = setPartIndex + 1; i < parts.length - 1; i += 2) {
                    const key = parts[i];
                    const value = parts[i + 1];
                    if (!key || !value) continue;

                    // Parse the value based on the key
                    switch (key) {
                        case 'app':
                            postData.app = value;
                            break;
                        case 'type':
                            postData.type = value;
                            break;
                        case 'content':
                            postData.content = value;
                            break;
                        case 'postId':
                            postData.postId = value;
                            break;
                        case 'sequence':
                            postData.sequence = parseInt(value, 10);
                            break;
                        case 'timestamp':
                            postData.timestamp = value;
                            break;
                        case 'tags':
                            try {
                                postData.tags = JSON.parse(value);
                            } catch {
                                postData.tags = [];
                            }
                            break;
                        case 'optionsHash':
                            postData.optionsHash = value;
                            break;
                        case 'lockAmount':
                            postData.lockAmount = parseInt(value, 10);
                            break;
                        case 'lockDuration':
                            postData.lockDuration = parseInt(value, 10);
                            break;
                        case 'optionIndex':
                            postData.optionIndex = parseInt(value, 10);
                            break;
                        case 'parentSequence':
                            postData.parentSequence = parseInt(value, 10);
                            break;
                        case 'totalOptions':
                            postData.totalOptions = parseInt(value, 10);
                            break;
                        default:
                            postData[key] = value;
                    }
                }
            } catch (error) {
                console.error('Error parsing output:', error);
            }
        }

        // Process vote options if present
        if (postData.type === 'vote_question') {
            const voteOptionOutputs = outputs.filter(o => {
                if (!o || !o.script) return false;
                try {
                    const script = o.script;
                    let data;

                    // First try to decode as hex
                    try {
                        const hexBuffer = Buffer.from(script, 'hex');
                        data = hexBuffer.toString();
                    } catch (e) {
                        // If hex decode fails, try base64
                        try {
                            const base64Buffer = Buffer.from(script, 'base64');
                            data = base64Buffer.toString();
                        } catch (error) {
                            return false;
                        }
                    }

                    // Extract the content after text/plain
                    const textPlainIndex = data.indexOf('text/plain');
                    if (textPlainIndex !== -1) {
                        // Skip past text/plain and any null bytes
                        let contentStart = textPlainIndex + 10;
                        while (contentStart < data.length && data.charCodeAt(contentStart) === 0) {
                            contentStart++;
                        }
                        data = data.substring(contentStart);
                    }

                    return data.includes('SET') && data.includes('type') && data.includes('vote_option');
                } catch (error) {
                    console.error('Error processing vote option script:', error);
                    return false;
                }
            });

            // Sort vote options by optionIndex
            const voteOptions = voteOptionOutputs
                .map(o => {
                    try {
                        const script = o.script!;
                        let data;

                        // First try to decode as hex
                        try {
                            const hexBuffer = Buffer.from(script, 'hex');
                            data = hexBuffer.toString();
                        } catch (e) {
                            // If hex decode fails, try base64
                            try {
                                const base64Buffer = Buffer.from(script, 'base64');
                                data = base64Buffer.toString();
                            } catch (error) {
                                console.error('Failed to decode script:', error);
                                return null;
                            }
                        }

                        // Extract the content after text/plain
                        const textPlainIndex = data.indexOf('text/plain');
                        if (textPlainIndex !== -1) {
                            // Skip past text/plain and any null bytes
                            let contentStart = textPlainIndex + 10;
                            while (contentStart < data.length && data.charCodeAt(contentStart) === 0) {
                                contentStart++;
                            }
                            data = data.substring(contentStart);
                        }

                        const parts = data.split(' ');
                        const setIndex = parts.indexOf('SET');
                        if (setIndex === -1) return null;

                        const option: any = {};
                        for (let i = setIndex + 1; i < parts.length - 1; i += 2) {
                            const key = parts[i];
                            const value = parts[i + 1];
                            if (!key || !value) continue;

                            switch (key) {
                                case 'content':
                                    option.text = value;
                                    break;
                                case 'optionIndex':
                                    option.index = parseInt(value, 10);
                                    break;
                                case 'lockAmount':
                                    option.lockAmount = parseInt(value, 10);
                                    break;
                                case 'lockDuration':
                                    option.lockDuration = parseInt(value, 10);
                                    break;
                            }
                        }
                        return option;
                    } catch (error) {
                        console.error('Error parsing vote option:', error);
                        return null;
                    }
                })
                .filter(o => o !== null)
                .sort((a, b) => a!.index - b!.index);

            postData.voteOptions = voteOptions;
        }

        // Create parsed post
        const timestamp = Math.floor(new Date(postData.timestamp || Date.now()).getTime() / 1000);
        const parsedPost: ParsedPost = {
            txid: tx.id,
            postId: postData.postId || tx.id,
            author: postData.author || '',
            blockHeight: 0,
            blockTime: timestamp,
            timestamp,
            content: {
                text: postData.content || '',
                title: postData.title,
                description: postData.description
            },
            metadata: {
                app: postData.app || MAP_PROTOCOL_MARKERS.APP,
                version: postData.version || '1.0',
                type: postData.type || MAP_TYPES.CONTENT,
                postId: postData.postId || tx.id,
                sequence: postData.sequence || 0,
                timestamp: new Date(timestamp * 1000).toISOString(),
                voteOptions: postData.voteOptions || [],
                optionsHash: postData.optionsHash,
                lockAmount: postData.lockAmount,
                lockDuration: postData.lockDuration,
                optionIndex: postData.optionIndex,
                parentSequence: postData.parentSequence,
                totalOptions: postData.totalOptions
            },
            images: [],
            tags: postData.tags || []
        };

        // Process images if present
        const imageOutputs = outputs.filter(o => {
            if (!o || !o.script) return false;
            const script = Buffer.from(o.script, 'hex').toString('utf8');
            return script.includes('image:') || script.includes('data:image/');
        });

        if (imageOutputs.length > 0) {
            const processedImages = await Promise.all(imageOutputs.map(async (img) => {
                if (!img || !img.script) return {
                    data: null,
                    contentType: '',
                    dataURL: null
                };

                try {
                    const script = Buffer.from(img.script, 'hex').toString('utf8');
                    const processed = await imageProcessor.processImage(Buffer.from(script, 'hex'));
                    return {
                        data: processed.data,
                        contentType: processed.metadata.mimeType,
                        dataURL: processed.dataUrl || null
                    };
                } catch (error) {
                    console.error('Failed to process image:', error);
                    return {
                        data: null,
                        contentType: '',
                        dataURL: null
                    };
                }
            }));

            parsedPost.images = processedImages;
        }

        return parsedPost;
    } catch (error) {
        console.error('Error parsing MAP transaction:', error);
        return null;
    }
}

// Export helpers for testing
export const _test = {
    parseMapData,
    parseMAPv1,
    parseMAPv2,
    parseBitcom
};

export { parseMapTransaction };
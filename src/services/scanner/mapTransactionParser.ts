import type { JungleBusTransaction, JungleBusOutput, ParsedPost, MAP_TYPES } from './types';
import { isValidImage, processImage } from './imageProcessor';
import { LRUCache } from 'lru-cache';
import { AsyncQueue } from 'async-queue';

// Constants and Types
const MAP_PROTOCOL_MARKERS = {
    V1: '6d01',
    V2: '6d02',
    B: '621a'
} as const;

type MapProtocolVersion = 'v1' | 'v2' | 'b';
type MapFieldHandlers = Record<string, (value: string, post: ParsedPost) => void>;

interface ImageExtractionResult {
    data: Buffer | null;
    contentType: string | null;
    metadata?: Record<string, unknown>;
}

// Cache Configuration
const IMAGE_CACHE = new LRUCache<string, ImageExtractionResult>({
    max: 100,
    ttl: 60_000 // 1 minute TTL
});

// Custom Error Class
class ParserError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly context?: Record<string, unknown>,
        public readonly recoverable: boolean = true
    ) {
        super(message);
        this.name = 'ParserError';
    }
}

// Protocol Version Detection
function detectProtocolVersion(scriptHex: string): MapProtocolVersion {
    if (!scriptHex) {
        throw new ParserError('INVALID_SCRIPT', 'Script hex is empty or undefined', { scriptHex });
    }
    
    const version = Object.entries(MAP_PROTOCOL_MARKERS).find(([_, marker]) => 
        scriptHex.startsWith(marker)
    );
    
    if (!version) {
        throw new ParserError('UNKNOWN_PROTOCOL', 'Unknown MAP protocol version', 
            { scriptHex: scriptHex.substring(0, 10) },
            false
        );
    }
    
    return version[0].toLowerCase() as MapProtocolVersion;
}

// Field Processing
const CONTENT_KEYS = new Set(['content', 'text', 'body', 'description']);
const NUMERIC_KEYS = new Set(['lockamount', 'lockduration', 'optionindex', 'totaloptions']);

const createFieldProcessor = (): MapFieldHandlers => ({
    content: (value, post) => {
        if (typeof value !== 'string') {
            throw new ParserError('INVALID_CONTENT', 'Content must be a string', { value });
        }
        post.content.text = sanitizeContent(value);
    },
    text: (value, post) => {
        if (typeof value !== 'string') {
            throw new ParserError('INVALID_CONTENT', 'Content must be a string', { value });
        }
        post.content.text = sanitizeContent(value);
    },
    type: (value, post) => {
        const validTypes = new Set(['vote_option', 'vote_question', 'standard']);
        if (!validTypes.has(value)) {
            throw new ParserError('INVALID_TYPE', 'Invalid post type', { value });
        }
        post.metadata.type = value;
        post.metadata.isVoteOption = value === 'vote_option';
        post.metadata.isVoteQuestion = value === 'vote_question';
    },
    options: (value, post) => {
        try {
            post.metadata.voteOptions = parseVoteOptions(value);
        } catch (error) {
            throw new ParserError('INVALID_OPTIONS', 'Failed to parse vote options', 
                { value, error: error instanceof Error ? error.message : String(error) }
            );
        }
    },
    app: (value, post) => post.metadata.app = value,
    postid: (value, post) => post.metadata.postId = value,
    parenttxid: (value, post) => post.metadata.parentTxid = value,
    tags: (value, post) => {
        post.tags = tryParseJSON(value) ?? value.split(',').map(t => t.trim());
    }
});

// Content Processing
function sanitizeContent(content: string): string {
    if (content.length > 5000) {
        console.warn('Content exceeds maximum length, truncating', { length: content.length });
    }
    
    return content
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/[^\x20-\x7E\n\r\t]/g, '') // Remove non-printable characters
        .substring(0, 5000)
        .trim();
}

// Image Processing
async function extractImageData(tx: JungleBusTransaction): Promise<ImageExtractionResult> {
    const cacheKey = tx.txid + '_images';
    const cached = IMAGE_CACHE.get(cacheKey);
    if (cached) {
        console.debug('Image cache hit', { txid: tx.txid });
        return cached;
    }

    const startTime = Date.now();
    try {
        const extractionMethods = [
            extractInlineImages,
            extractHexEncodedImages,
            extractBase64Images,
            extractFragmentedImages,
            extractProtocolImages
        ];

        for (const method of extractionMethods) {
            const result = await method(tx);
            if (result.data) {
                if (!isValidImage(result.data)) {
                    throw new ParserError('INVALID_IMAGE', 'Invalid image data detected', 
                        { contentType: result.contentType }
                    );
                }
                
                IMAGE_CACHE.set(cacheKey, result);
                console.debug('Image extracted successfully', {
                    txid: tx.txid,
                    method: method.name,
                    duration: Date.now() - startTime
                });
                return result;
            }
        }
    } catch (error) {
        console.error('Image extraction failed', {
            txid: tx.txid,
            error: error instanceof Error ? error.message : String(error)
        });
    }

    return { data: null, contentType: null };
}

// Vote Option Processing
function parseVoteOptions(input: unknown): any[] {
    const options = Array.isArray(input) ? input : [input];
    return options.map(opt => {
        const option = typeof opt === 'string' ? { text: opt } : opt;
        return {
            text: String(option.text || '').trim(),
            index: safeParseInt(option.index),
            lockAmount: safeParseInt(option.lockAmount),
            lockDuration: safeParseInt(option.lockDuration),
            unlockHeight: safeParseInt(option.unlockHeight),
            lockPercentage: safeParseInt(option.lockPercentage)
        };
    }).filter(opt => opt.text.length > 0);
}

// Validation
function validateParsedPost(post: ParsedPost): string[] {
    const errors: string[] = [];
    
    if (!post.txid || !/^[a-f0-9]{64}$/i.test(post.txid)) {
        errors.push('Invalid TXID format');
    }

    if (!post.metadata.isVoteOption && !post.metadata.isVoteQuestion) {
        if (!post.content?.text && !post.images?.length) {
            errors.push('Missing content or images');
        }
    }

    if (post.metadata.voteOptions) {
        const indexes = new Set<number>();
        post.metadata.voteOptions.forEach(opt => {
            if (indexes.has(opt.index)) {
                errors.push(`Duplicate option index: ${opt.index}`);
            }
            indexes.add(opt.index);
        });
    }

    return errors;
}

// Helper Functions
const safeParseInt = (value: unknown): number => 
    Math.abs(Number.parseInt(String(value || 0), 10)) || 0;

const tryParseJSON = (str: string): unknown => {
    try {
        return JSON.parse(str);
    } catch {
        return null;
    }
};

// Main Parser
export async function parseMapTransaction(tx: JungleBusTransaction): Promise<ParsedPost | null> {
    const post: ParsedPost = {
        txid: tx.txid,
        blockHeight: tx.blockHeight,
        timestamp: tx.timestamp,
        content: { text: '' },
        author: tx.addresses?.[0] || '',
        metadata: {},
        tags: [],
        images: []
    };

    try {
        await processTransactionContent(tx, post);
        
        const errors = validateParsedPost(post);
        if (errors.length > 0) {
            console.error('Validation failed:', errors);
            return null;
        }

        return post;
    } catch (error) {
        if (error instanceof ParserError) {
            console.error(`Parser Error [${error.code}]:`, error.message, error.context);
        } else {
            console.error('Unexpected processing error:', error);
        }
        return null;
    }
}

// Transaction Processing
async function processTransactionContent(tx: JungleBusTransaction, post: ParsedPost): Promise<void> {
    const contentSources = [
        tx.data?.flatMap(parseKeyValuePairs),
        tx.outputs?.flatMap(o => parseProtocolOutput(o.script))
    ];

    const fieldProcessor = createFieldProcessor();

    for (const items of contentSources) {
        if (!items) continue;
        for (const [key, value] of items) {
            const handler = fieldProcessor[key.toLowerCase()];
            if (handler) {
                handler(value, post);
            }
        }
    }

    // Image processing
    const imageResult = await extractImageData(tx);
    if (imageResult.data) {
        post.images.push({
            data: imageResult.data,
            contentType: imageResult.contentType || 'image/jpeg',
            metadata: imageResult.metadata
        });
    }
}

// Stream Processing
export class TransactionStreamProcessor {
    private queue: AsyncQueue<JungleBusTransaction>;
    private workers: Worker[];

    constructor(concurrency = 4) {
        this.queue = new AsyncQueue();
        this.workers = Array.from({ length: concurrency }, () => 
            new Worker('./unifiedDbWorker.ts')
        );
    }

    async process(transactions: AsyncIterable<JungleBusTransaction>) {
        for await (const tx of transactions) {
            await this.queue.enqueue(tx);
        }
    }
}

// Helper functions for image processing
async function validateAndProcessImage(buffer: Buffer, contentType: string): Promise<ImageExtractionResult> {
    if (!isValidImage(buffer)) {
        return { data: null, contentType: null };
    }

    const processedImage = await processImage(buffer);
    return {
        data: processedImage,
        contentType,
        metadata: {
            size: buffer.length,
            processedSize: processedImage.length
        }
    };
}

function parseKeyValuePairs(data: string): [string, string][] {
    const pairs: [string, string][] = [];
    const parts = data.split('=');
    
    if (parts.length === 2) {
        pairs.push([parts[0].toLowerCase(), parts[1]]);
    }
    
    return pairs;
}

async function parseProtocolOutput(script?: { asm?: string; hex?: string }): Promise<[string, string][]> {
    if (!script?.hex) return [];

    const version = detectProtocolVersion(script.hex);
    const pairs: [string, string][] = [];

    try {
        const text = Buffer.from(script.hex, 'hex').toString('utf8');
        
        if (text.startsWith('MAP_')) {
            const match = text.match(/MAP_([A-Z_]+)=(.+)/i);
            if (match) {
                pairs.push([match[1].toLowerCase(), match[2]]);
            }
        } else if (text.startsWith('1Map')) {
            const data = tryParseJSON(text.substring(4));
            if (data && typeof data === 'object') {
                Object.entries(data).forEach(([key, value]) => {
                    if (typeof value === 'string') {
                        pairs.push([key.toLowerCase(), value]);
                    }
                });
            }
        }
    } catch (error) {
        console.warn('Failed to parse protocol output:', error);
    }

    return pairs;
}

// Export additional utilities
export {
    validateParsedPost,
    extractImageData,
    ParserError
};
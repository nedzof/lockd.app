import { BMAP, TransformTx } from 'bmapjs';
import { Tx } from 'scrypt-ts';
import { Transaction, ParsedTransaction } from './types';
import { logger } from '../utils/logger.js';
import { Script } from 'bsv';

interface ScryptTx extends Tx {
    fromHex(hex: string): void;
    outputs: Array<{
        script: string;
        satoshis: number;
    }>;
}

export class TransactionParser {
    private bmap: BMAP;
    private readonly LOCK_PROTOCOL = 'LOCK';
    private readonly UNLOCK_PROTOCOL = 'UNLOCK';

    constructor() {
        this.bmap = new BMAP();
        const bmapExports = Object.keys(BMAP);
        logger.info('TransactionParser initialized', {
            bmapAvailable: !!this.bmap,
            bmapExports,
            bmapVersion: (this.bmap as any).version || 'unknown'
        });
    }

    private validateRawTransaction(rawTx: any): { isValid: boolean; error?: string } {
        try {
            if (!rawTx) {
                return { isValid: false, error: 'Raw transaction is null or undefined' };
            }

            // Extract raw transaction hex
            const rawTxHex = rawTx.transaction?.hex || rawTx.tx?.raw;
            if (!rawTxHex) {
                return { isValid: false, error: 'Raw transaction hex not found' };
            }

            // Attempt to parse and validate using sCrypt SDK
            const tx = new Tx() as ScryptTx;
            tx.fromHex(rawTxHex);

            // Validate outputs exist
            if (!tx.outputs || tx.outputs.length === 0) {
                return { isValid: false, error: 'Transaction has no outputs' };
            }

            // Basic validation of each output
            for (let i = 0; i < tx.outputs.length; i++) {
                const output = tx.outputs[i];
                if (!output) {
                    return { isValid: false, error: `Invalid output at index ${i}` };
                }
            }

            logger.debug('Transaction validated successfully', {
                txid: rawTx.transaction?.hash || rawTx.tx?.h,
                outputCount: tx.outputs.length
            });

            return { isValid: true };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to validate raw transaction', {
                error: errorMessage,
                stack: error instanceof Error ? error.stack : undefined
            });
            return { isValid: false, error: errorMessage };
        }
    }

    private extractSenderAddress(tx: any): string | undefined {
        try {
            // Extract sender address from input script
            const firstInput = tx.transaction?.inputs?.[0] || tx.in?.[0];
            if (firstInput?.address) {
                return firstInput.address;
            }
            return undefined;
        } catch (error) {
            logger.debug('Failed to extract sender address', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return undefined;
        }
    }

    private async processLockTransaction(tx: any, output: any, outputIndex: number): Promise<ParsedTransaction | null> {
        try {
            // First validate the raw transaction
            const validation = this.validateRawTransaction(tx);
            if (!validation.isValid) {
                logger.error('Invalid raw transaction', {
                    txid: tx.transaction?.hash || tx.tx?.h,
                    error: validation.error
                });
                throw new Error(`Transaction validation failed: ${validation.error}`);
            }

            const script = output.outputScript || output.s;
            const parts = script.split(' ');
            
            // Enhanced LOCK protocol detection with validation
            if (parts.length < 3 || !this.isValidLockProtocol(parts)) {
                return null;
            }

            logger.info('LOCK protocol detected', {
                txid: tx.transaction?.hash || tx.tx?.h,
                outputIndex,
                outputValue: output.value || output.e?.v,
                scriptPreview: script.substring(0, 50) + '...'
            });

            // Extract metadata with improved error handling
            const metadata = await this.extractLockMetadata(tx, outputIndex, parts);

            // Enhanced validation of extracted metadata
            if (!this.isValidLockMetadata(metadata)) {
                logger.warn('Invalid LOCK metadata detected', {
                    txid: tx.transaction?.hash || tx.tx?.h,
                    metadata
                });
                return null;
            }

            const result: ParsedTransaction = {
                txid: tx.transaction?.hash || tx.tx?.h,
                type: 'lock',
                protocol: 'LOCK',
                blockHeight: tx.block?.height || tx.blk?.i,
                blockTime: tx.block?.timestamp || tx.blk?.t || Date.now(),
                senderAddress: this.extractSenderAddress(tx),
                metadata
            };

            logger.info('Transaction successfully parsed', {
                txid: result.txid,
                type: result.type,
                protocol: result.protocol,
                processingTime: Date.now() - (tx.startTime || Date.now())
            });

            return result;
        } catch (error) {
            logger.error('Failed to process LOCK transaction', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                txid: tx.transaction?.hash || tx.tx?.h
            });
            return null;
        }
    }

    private parseOpReturnScript(script: string): string {
        try {
            // Remove OP_RETURN prefix if present
            script = script.replace(/^6a/i, '');
            
            // Split into chunks and decode each chunk
            const chunks = script.split('20'); // 0x20 is a common separator
            return chunks
                .map(chunk => this.hexToAscii(chunk))
                .filter(text => text.length > 0)
                .join(' ');
        } catch (error) {
            logger.error('Failed to parse OP_RETURN script', {
                error: error instanceof Error ? error.message : 'Unknown error',
                script: script.substring(0, 50)
            });
            return script;
        }
    }

    private hexToAscii(hex: string): string {
        try {
            // Remove any 0x prefix if present
            hex = hex.replace(/^0x/, '');
            
            // Handle both space-separated and concatenated hex
            hex = hex.replace(/\s+/g, '');
            
            // Check if this is a script hash (P2PKH/P2SH)
            if (hex.match(/^(76a914|a914).{40}(88ac|87)$/)) {
                return hex; // Return as is for script hashes
            }

            // Special handling for OP_RETURN scripts
            if (hex.startsWith('6a')) {
                return this.parseOpReturnScript(hex);
            }

            let str = '';
            for (let i = 0; i < hex.length; i += 2) {
                if (i + 2 > hex.length) break;
                
                const charHex = hex.substr(i, 2);
                if (!/^[0-9a-fA-F]{2}$/.test(charHex)) {
                    continue; // Skip invalid hex pairs
                }
                
                const charCode = parseInt(charHex, 16);
                // Accept all printable ASCII plus common whitespace
                if ((charCode >= 32 && charCode <= 126) || [9, 10, 13].includes(charCode)) {
                    str += String.fromCharCode(charCode);
                }
            }
            return str.trim();
        } catch (error) {
            logger.error('Failed to decode hex string', {
                error: error instanceof Error ? error.message : 'Unknown error',
                preview: hex?.substring(0, 50)
            });
            return hex; // Return original on error
        }
    }

    private isValidLockProtocol(parts: string[]): boolean {
        try {
            // Check each part for LOCK protocol marker
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                
                // Skip empty parts
                if (!part || part.length === 0) continue;
                
                // Try direct match
                if (part === this.LOCK_PROTOCOL) {
                    return parts.length >= i + 2; // Need at least 2 more parts
                }
                
                // Try hex decode if needed
                const decoded = this.hexToAscii(part);
                if (decoded === this.LOCK_PROTOCOL) {
                    return parts.length >= i + 2; // Need at least 2 more parts
                }
                
                // Check if part contains protocol
                if (decoded.includes(this.LOCK_PROTOCOL)) {
                    return true;
                }
            }
            
            return false;
        } catch (error) {
            logger.error('Error validating LOCK protocol', {
                error: error instanceof Error ? error.message : 'Unknown error',
                parts: parts.slice(0, 3)
            });
            return false;
        }
    }

    private async extractLockMetadata(tx: any, outputIndex: number, parts: string[]): Promise<any> {
        const metadata: any = {
            postId: '',
            content: '',
            lockAmount: 0,
            lockDuration: 0,
            timestamp: Date.now()
        };

        try {
            // First try to extract from the script parts
            for (let i = 0; i < parts.length; i++) {
                const part = this.hexToAscii(parts[i]);
                
                // Look for JSON data
                try {
                    const data = JSON.parse(part);
                    if (data && typeof data === 'object') {
                        Object.assign(metadata, this.sanitizeMetadata(data));
                        break;
                    }
                } catch {} // Ignore JSON parse errors
                
                // Look for key=value pairs
                const kvMatch = part.match(/^(\w+)=(.+)$/);
                if (kvMatch) {
                    const [, key, value] = kvMatch;
                    if (key in metadata) {
                        // Handle numeric values
                        const numValue = Number(value);
                        metadata[key] = !isNaN(numValue) ? numValue : value;
                    }
                }
            }

            // Then check other outputs for metadata
            const outputs = tx.transaction?.outputs || tx.out;
            if (outputs) {
                for (let i = 0; i < outputs.length; i++) {
                    if (i === outputIndex) continue;
                    
                    const out = outputs[i];
                    const outScript = out.outputScript || out.s;
                    if (!outScript) continue;

                    // Parse OP_RETURN data
                    if (outScript.startsWith('6a') || outScript.includes('OP_RETURN')) {
                        const data = this.parseOpReturnScript(outScript);
                        try {
                            const jsonData = JSON.parse(data);
                            if (jsonData && typeof jsonData === 'object') {
                                Object.assign(metadata, this.sanitizeMetadata(jsonData));
                            }
                        } catch {} // Ignore JSON parse errors
                    }
                }
            }

            // Ensure required fields
            if (!metadata.postId) {
                metadata.postId = tx.transaction?.hash || tx.tx?.h;
            }

            return metadata;
        } catch (error) {
            logger.error('Failed to extract LOCK metadata', {
                error: error instanceof Error ? error.message : 'Unknown error',
                txid: tx.transaction?.hash || tx.tx?.h
            });
            return metadata;
        }
    }

    private isValidLockMetadata(metadata: any): boolean {
        return (
            typeof metadata === 'object' &&
            typeof metadata.postId === 'string' &&
            metadata.postId.length > 0 &&
            typeof metadata.content === 'string' &&
            typeof metadata.lockAmount === 'number' &&
            typeof metadata.lockDuration === 'number' &&
            metadata.lockAmount >= 0 &&
            metadata.lockDuration >= 0
        );
    }

    private sanitizeMetadata(content: any): any {
        return {
            postId: typeof content.postId === 'string' ? content.postId : '',
            lockAmount: typeof content.lockAmount === 'number' ? Math.max(0, content.lockAmount) : 0,
            lockDuration: typeof content.lockDuration === 'number' ? Math.max(0, content.lockDuration) : 0
        };
    }

    private async retryOperation(operation: () => Promise<void>, maxRetries: number): Promise<void> {
        let lastError: Error | null = null;
        for (let i = 0; i < maxRetries; i++) {
            try {
                await operation();
                return;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown error');
                if (i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
                }
            }
        }
        if (lastError) throw lastError;
    }

    private normalizeBlockTime(timestamp: number | undefined): number {
        if (!timestamp || isNaN(timestamp)) {
            return Date.now();
        }
        // Convert Unix timestamp to milliseconds if needed
        return timestamp < 1e12 ? timestamp * 1000 : timestamp;
    }

    private parseOrdinalInscription(script: string): { contentType?: string; content?: string } | null {
        try {
            // Remove OP_FALSE OP_IF
            const data = script.substring(13);
            
            // Split into chunks
            const chunks = data.split(' ');
            
            // Find content type and content
            let contentType = '';
            let content = '';
            
            for (let i = 0; i < chunks.length; i++) {
                if (chunks[i] === 'OP_PUSH') {
                    if (i + 1 < chunks.length && !contentType) {
                        contentType = chunks[i + 1];
                        i++;
                    } else if (i + 1 < chunks.length) {
                        content = chunks[i + 1];
                        i++;
                    }
                }
            }
            
            return { contentType, content };
        } catch (error) {
            logger.error('Failed to parse ordinal inscription', {
                error: error instanceof Error ? error.message : 'Unknown error',
                script: script.substring(0, 100)
            });
            return null;
        }
    }

    private decodeScript(hexScript: string): { type: string; content: string } | null {
        try {
            const script = Script.fromHex(hexScript);
            const chunks = script.chunks;

            // Look for OP_RETURN data (opcode 106)
            if (chunks.length > 0 && chunks[0].opcodenum === 106) {
                let content = '';
                let type = 'unknown';

                // Extract content from script chunks
                for (let i = 1; i < chunks.length; i++) {
                    const chunk = chunks[i];
                    if (chunk.buf) {
                        const text = chunk.buf.toString('utf8');
                        if (text.startsWith('text/')) {
                            type = text;
                        } else if (text.includes('content=')) {
                            content = text.split('content=')[1];
                        } else {
                            content = text;
                        }
                    }
                }

                return { type, content };
            }

            return null;
        } catch (error) {
            logger.error('Error decoding script', {
                error: error instanceof Error ? error.message : 'Unknown error',
                hexScript: hexScript.substring(0, 50) + '...'
            });
            return null;
        }
    }

    public async parseTransaction(tx: any): Promise<ParsedTransaction | null> {
        try {
            logger.debug('Raw transaction data', {
                id: tx.id,
                block_height: tx.block_height,
                block_time: tx.block_time,
                addresses: tx.addresses,
                outputCount: tx.outputs?.length,
                dataCount: tx.data?.length,
                hasData: !!tx.data,
                hasOutputs: !!tx.outputs
            });

            // Log first few data items if present
            if (Array.isArray(tx.data)) {
                logger.debug('Transaction data array sample', {
                    first5Items: tx.data.slice(0, 5),
                    containsApp: tx.data.some((d: string) => d.includes('app=')),
                    containsLock: tx.data.some((d: string) => d.includes('lock')),
                    dataTypes: tx.data.slice(0, 5).map((d: string) => typeof d)
                });
            }

            // Log first few outputs if present
            if (Array.isArray(tx.outputs)) {
                logger.debug('Transaction outputs sample', {
                    first2Outputs: tx.outputs.slice(0, 2).map((out: string) => ({
                        preview: out.substring(0, 50),
                        length: out.length,
                        isHex: /^[0-9a-fA-F]+$/.test(out)
                    }))
                });

                // Try to decode outputs
                const decodedOutputs = tx.outputs
                    .map((out: string) => this.decodeScript(out))
                    .filter((result: any) => result !== null);

                if (decodedOutputs.length > 0) {
                    logger.debug('Decoded outputs', { decodedOutputs });
                }
            }

            // First check if this is a LOCK protocol transaction
            if (Array.isArray(tx.data)) {
                const isLockApp = tx.data.some((d: string) => d === 'app=lockd.app');
                const lockAmount = tx.data.find((d: string) => d.startsWith('lockamount='))?.split('=')[1];
                const lockDuration = tx.data.find((d: string) => d.startsWith('lockduration='))?.split('=')[1];
                const postId = tx.data.find((d: string) => d.startsWith('postid='))?.split('=')[1];

                // Log LOCK protocol detection results
                logger.debug('LOCK protocol detection', {
                    isLockApp,
                    lockAmount,
                    lockDuration,
                    postId,
                    hasAllRequired: isLockApp && lockAmount && lockDuration
                });

                if (isLockApp && lockAmount && lockDuration) {
                    logger.info('Found LOCK protocol data', {
                        txid: tx.id,
                        lockAmount,
                        lockDuration,
                        postId
                    });

                    // Extract content from tx.data
                    let content = '';
                    const contentItems = tx.data
                        .filter((d: string) => d.startsWith('content='))
                        .map((d: string) => d.split('content=')[1]);
                    
                    if (contentItems.length > 0) {
                        content = contentItems.join(' '); // Join multiple content items if present
                        logger.debug('Content extracted from tx.data', {
                            contentItems,
                            finalContent: content
                        });
                    } else {
                        // Try to extract content from decoded outputs
                        if (Array.isArray(tx.outputs)) {
                            for (const output of tx.outputs) {
                                const decoded = this.decodeScript(output);
                                if (decoded?.content) {
                                    content = decoded.content;
                                    logger.debug('Content extracted from decoded output', {
                                        content,
                                        type: decoded.type
                                    });
                                    break;
                                }
                            }
                        }
                    }

                    const result: ParsedTransaction = {
                        txid: tx.id,
                        type: 'lock',
                        protocol: 'LOCK',
                        blockHeight: tx.block_height,
                        blockTime: tx.block_time,
                        metadata: {
                            postId: postId || tx.id,
                            content,
                            lockAmount: Number(lockAmount),
                            lockDuration: Number(lockDuration),
                            timestamp: Date.now()
                        }
                    };

                    logger.info('Successfully parsed LOCK transaction', {
                        txid: result.txid,
                        blockHeight: result.blockHeight,
                        metadata: result.metadata
                    });

                    return result;
                }
            }

            // If we didn't find LOCK data in tx.data, try the old way
            interface BMapTx {
                tx: {
                    h: string;
                    out: Array<{
                        s: string;
                        e: { v: number };
                    }>;
                    in: Array<{
                        e: { h: string; i: number };
                        i: number;
                    }>;
                    hasScripts: boolean;
                };
                blk?: {
                    i: number;
                    t: number;
                };
            }

            // Handle JungleBus format
            const bmapTx: BMapTx = {
                tx: {
                    h: tx.transaction?.hash || tx.hash || tx.id,
                    out: [],
                    in: tx.transaction?.inputs?.map((input: any, i: number) => ({
                        e: { h: input.prevTxId || input.hash, i: input.outputIndex || input.index || 0 },
                        i: i
                    })) || tx.inputs?.map((input: any, i: number) => ({
                        e: { h: input.hash || '', i: input.index || 0 },
                        i: i
                    })) || [],
                    hasScripts: false
                },
                blk: tx.block ? {
                    i: tx.block.height,
                    t: Math.floor(new Date(tx.block.timestamp).getTime() / 1000)
                } : undefined
            };

            // Enhanced JungleBus output handling
            if (Array.isArray(tx.outputs)) {
                bmapTx.tx.out = tx.outputs.map((output: any) => {
                    // Handle both string and object outputs
                    const script = typeof output === 'string' ? output : 
                                 output.outputScript || output.script || '';
                    const value = typeof output === 'object' ? 
                                output.satoshis || output.value || 0 : 0;
                    
                    return {
                        s: this.hexToAscii(script),
                        e: { v: value }
                    };
                });
            } else if (tx.transaction?.outputs) {
                bmapTx.tx.out = tx.transaction.outputs.map((out: any) => ({
                    s: this.hexToAscii(out.outputScript || out.script || ''),
                    e: { v: out.satoshis || out.value || 0 }
                }));
            }

            logger.debug('Mapped to BMAP format', {
                txid: bmapTx.tx.h,
                outputCount: bmapTx.tx.out.length,
                outputScripts: bmapTx.tx.out.map(o => o.s?.substring(0, 50))
            });

            // Add additional metadata
            bmapTx.tx.hasScripts = bmapTx.tx.out.some((o) => o.s?.length > 0);

            // Process the transaction with enhanced LOCK detection
            const outputs = bmapTx.tx.out;
            for (let i = 0; i < outputs.length; i++) {
                const output = outputs[i];
                const script = output.s;

                logger.debug('Processing output', {
                    index: i,
                    script: script?.substring(0, 50),
                    hasLockProtocol: script?.includes(this.LOCK_PROTOCOL)
                });

                // Try both direct string match and hex-decoded match
                if (script && (
                    script.includes(this.LOCK_PROTOCOL) || 
                    script.split(' ').some(part => this.hexToAscii(part) === this.LOCK_PROTOCOL)
                )) {
                    return this.processLockTransaction(bmapTx, output, i);
                }
            }

            return null;
        } catch (error) {
            logger.error('Failed to parse transaction', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                txid: tx.transaction?.hash || tx.hash || tx.id
            });
            return null;
        }
    }
}
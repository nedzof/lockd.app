/**
 * TransactionDataParser: Responsible for parsing raw transaction data
 */
import * as bsv from 'bsv';
import { JungleBusClient } from '@gorillapool/js-junglebus';
import { JungleBusResponse } from '../shared/types.js';
import { BaseParser } from './base_parser.js';
import { sanitize_for_db, decode_hex_string } from './utils/helpers.js';
import { logger } from '../utils/logger.js';

export class TransactionDataParser extends BaseParser {
    private jungleBus: JungleBusClient;
    private transactionCache = new Map<string, boolean>();

    constructor() {
        super();
        
        this.jungleBus = new JungleBusClient('junglebus.gorillapool.io', {
            useSSL: true,
            protocol: 'json',
            onError: (ctx) => {
                logger.error("❌ JungleBus Transaction Parser ERROR", ctx);
            }
        });
    }

    /**
     * Fetch raw transaction data from JungleBus
     * @param tx_id Transaction ID to fetch
     * @returns The raw transaction data or null if not found
     */
    public async fetch_transaction(tx_id: string): Promise<JungleBusResponse | null> {
        if (!tx_id || typeof tx_id !== 'string') {
            this.logError('Invalid transaction ID', { tx_id });
            return null;
        }

        // Check if transaction is already in cache
        if (this.transactionCache.has(tx_id)) {
            this.logInfo('Transaction already in cache, skipping fetch', { tx_id });
            return null; // Assume already processed
        }

        this.logInfo('Fetching transaction from JungleBus', { tx_id });

        // Set timeout for JungleBus transaction fetch
        const timeoutPromise = new Promise<null>((resolve) => {
            setTimeout(() => {
                this.logWarn('Transaction fetch from JungleBus timed out', { tx_id });
                resolve(null);
            }, 10000); // 10 second timeout
        });

        // Fetch transaction from JungleBus
        const txPromise = this.jungleBus.GetTransaction(tx_id).catch(error => {
            this.logError('Error fetching transaction from JungleBus', {
                tx_id,
                error: error instanceof Error ? error.message : String(error)
            });
            return null;
        });

        // Race the fetch against the timeout
        const tx: any = await Promise.race([txPromise, timeoutPromise]);
        
        if (!tx || !tx.transaction) {
            this.logWarn('Transaction not found or invalid', { tx_id });
            return null;
        }

        // Add to cache after fetching
        this.transactionCache.set(tx_id, true);
        this.prune_cache(); // Prune cache if needed

        return tx;
    }

    /**
     * Extract data from transaction
     * @param tx The transaction object from JungleBus
     * @returns Array of data strings extracted from OP_RETURN outputs
     */
    public extract_data_from_transaction(tx: JungleBusResponse): string[] {
        const data: string[] = [];
        
        try {
            // Parse the raw transaction using BSV
            try {
                const rawTx = Buffer.from(tx.transaction, 'base64');
                const bsvTx = new bsv.Transaction(rawTx);
                
                // Process each output
                for (let i = 0; i < bsvTx.outputs.length; i++) {
                    const output = bsvTx.outputs[i];
                    
                    // Check if this is an OP_RETURN output
                    if (output.script && output.script.isDataOut()) {
                        const chunks = output.script.chunks;
                        
                        // Skip OP_RETURN (first chunk)
                        for (let j = 1; j < chunks.length; j++) {
                            const chunk = chunks[j];
                            if (chunk.buf) {
                                // Convert buffer to string
                                try {
                                    const str = sanitize_for_db(chunk.buf.toString('utf8'));
                                    data.push(str);
                                } catch {
                                    // If UTF-8 conversion fails, try hex
                                    const hex = chunk.buf.toString('hex');
                                    data.push(hex);
                                }
                            }
                        }
                    }
                }
            } catch (bsvError) {
                this.logWarn('Failed to parse with BSV library, falling back to raw outputs', {
                    tx_id: tx?.id || 'unknown',
                    error: bsvError instanceof Error ? bsvError.message : String(bsvError)
                });
            }
            
            // If no data found in OP_RETURN outputs, try to extract from other outputs
            if (data.length === 0) {
                // Also check the transaction outputs array from JungleBus
                if (tx.outputs && Array.isArray(tx.outputs)) {
                    for (const output of tx.outputs) {
                        if (typeof output === 'string' && output.length > 0) {
                            // Try to decode the output
                            try {
                                // Check if it's hex
                                if (/^[0-9a-fA-F]+$/.test(output)) {
                                    const decoded = decode_hex_string(output);
                                    if (decoded) {
                                        // Split by common delimiters
                                        const parts = decoded.split(/[\s\t\n\r\x00-\x1F]+/).filter(Boolean);
                                        data.push(...parts);
                                    }
                                } else {
                                    // Add as is
                                    data.push(output);
                                }
                            } catch {
                                // If decoding fails, add as is
                                data.push(output);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            this.logError('Error extracting data from transaction', {
                tx_id: tx?.id || 'unknown',
                error: error instanceof Error ? error.message : String(error)
            });
        }
        
        return data;
    }

    /**
     * Get sender address from transaction
     * @param tx The transaction object from JungleBus
     * @returns The sender address or empty string if not found
     */
    public get_sender_address(tx: JungleBusResponse): string {
        try {
            // Get sender address from first input
            return tx.inputs && tx.inputs[0] ? tx.inputs[0].address : '';
        } catch (error) {
            this.logError('Error getting sender address', {
                tx_id: tx?.id || 'unknown',
                error: error instanceof Error ? error.message : String(error)
            });
            return '';
        }
    }

    /**
     * Prune the transaction cache if it exceeds the maximum size
     */
    private prune_cache(): void {
        if (this.transactionCache.size > this.MAX_CACHE_SIZE) {
            // Convert to array of keys
            const keys = Array.from(this.transactionCache.keys());
            
            // Remove oldest entries (first 20% of the cache)
            const pruneCount = Math.floor(this.MAX_CACHE_SIZE * 0.2);
            const keysToRemove = keys.slice(0, pruneCount);
            
            for (const key of keysToRemove) {
                this.transactionCache.delete(key);
            }
            
            this.logInfo('Pruned transaction cache', {
                pruned: pruneCount,
                remaining: this.transactionCache.size
            });
        }
    }
}

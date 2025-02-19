import { parseTx } from 'bmapjs';
import { logger } from '../utils/logger';

interface Transaction {
    tx: {
        h: string;
        raw: string;
        blk?: {
            i: number;
            t: number;
        };
    };
}

interface ParsedTransaction {
    txid: string;
    type: string;
    blockHeight?: number;
    blockTime?: number;
    senderAddress?: string;
    metadata: {
        postId: string;
        content: string;
        protocol?: string;
    };
}

export class TransactionParser {
    constructor() {
        // Initialize any parser-specific configuration
    }

    public async parseTransaction(tx: Transaction): Promise<ParsedTransaction | null> {
        try {
            // Use BMAP to parse the transaction
            const bmapTx = await parseTx(tx.tx.raw);
            
            // Check if this is a relevant transaction for our app
            if (!this.isRelevantTransaction(bmapTx)) {
                return null;
            }

            // Extract the relevant data using BMAP parsed structure
            const parsedTx: ParsedTransaction = {
                txid: tx.tx.h,
                type: this.determineTransactionType(bmapTx),
                blockHeight: tx.tx.blk?.i,
                blockTime: tx.tx.blk?.t,
                senderAddress: bmapTx.in[0]?.e?.a, // First input's address
                metadata: {
                    postId: this.extractPostId(bmapTx),
                    content: this.extractContent(bmapTx),
                    protocol: bmapTx.MAP?.app || 'unknown'
                }
            };

            logger.debug('Successfully parsed transaction', {
                txid: parsedTx.txid,
                type: parsedTx.type
            });

            return parsedTx;
        } catch (error) {
            logger.error('Failed to parse transaction', {
                txid: tx.tx.h,
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    private isRelevantTransaction(bmapTx: any): boolean {
        // Check if this transaction is relevant for our application
        // For example, check if it uses our protocol or has specific OP_RETURN data
        return bmapTx.MAP?.app === 'lockd' || 
               bmapTx.out.some((output: any) => 
                   output.s?.includes('lockd') || 
                   output.s?.includes('LOCK')
               );
    }

    private determineTransactionType(bmapTx: any): string {
        // Determine the type of transaction based on the BMAP data
        if (bmapTx.out.some((output: any) => output.s?.includes('LOCK'))) {
            return 'lock';
        }
        if (bmapTx.out.some((output: any) => output.s?.includes('UNLOCK'))) {
            return 'unlock';
        }
        return 'unknown';
    }

    private extractPostId(bmapTx: any): string {
        // Extract post ID from the transaction
        // This is application-specific logic
        const postOutput = bmapTx.out.find((output: any) => 
            output.s?.includes('postId=')
        );
        return postOutput?.s?.split('postId=')[1] || '';
    }

    private extractContent(bmapTx: any): string {
        // Extract content from the transaction
        // This is application-specific logic
        const contentOutput = bmapTx.out.find((output: any) => 
            output.s?.includes('content=')
        );
        return contentOutput?.s?.split('content=')[1] || '';
    }
}
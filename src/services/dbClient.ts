import { db_client } from '../db/index.js';
import { PrismaClient } from '@prisma/client';
import { ParsedTransaction, ProcessedTransaction } from '../shared/types.js';
import { logger } from '../utils/logger.js';

/**
 * @deprecated This class is being replaced by the new modular DbClient architecture.
 * Please use the new DbClient from '../db/index.js' instead.
 */
export class DbClient {
    private static instance: DbClient | null = null;
    private instance_id: number;

    private constructor() {
        this.instance_id = Date.now();
        
        logger.info('DEPRECATION NOTICE: DbClient is deprecated and will be removed in a future release.', {
            instance_id: this.instance_id,
            recommendation: 'Use the new modular DbClient from \'../db/index.js\' instead.'
        });
    }

    public static get_instance(): DbClient {
        if (!DbClient.instance) {
            DbClient.instance = new DbClient();
            logger.info('Created new DbClient singleton instance (deprecated)');
        }
        return DbClient.instance;
    }
    
    /**
     * @deprecated Use the new DbClient from '../db/index.js' instead
     */
    public createClient() {
        logger.warn('DbClient.createClient is deprecated', {
            recommendation: 'Use the new modular DbClient from \'../db/index.js\' instead.'
        });
        return new PrismaClient({
            datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
            log: [
                { level: 'error', emit: 'stdout' },
                { level: 'warn', emit: 'stdout' },
            ],
        });
    }
    
    /**
     * @deprecated Use the new DbClient from '../db/index.js' instead
     */
    public async processTransaction(tx: ParsedTransaction): Promise<ProcessedTransaction> {
        logger.warn('DbClient.processTransaction is deprecated', {
            recommendation: 'Use the new modular DbClient from \'../db/index.js\' instead.'
        });
        return await db_client.process_transaction(tx);
    }
    
    /**
     * @deprecated Use the new DbClient from '../db/index.js' instead
     */
    public async processTransactionBatch(txs: ParsedTransaction[]): Promise<ProcessedTransaction[]> {
        logger.warn('DbClient.processTransactionBatch is deprecated', {
            recommendation: 'Use the new modular DbClient from \'../db/index.js\' instead.'
        });
        return await db_client.process_transaction_batch(txs);
    }
    
    /**
     * @deprecated Use the new DbClient from '../db/index.js' instead
     */
    public async getTransaction(tx_id: string): Promise<ProcessedTransaction | null> {
        logger.warn('DbClient.getTransaction is deprecated', {
            recommendation: 'Use the new modular DbClient from \'../db/index.js\' instead.'
        });
        return await db_client.get_transaction(tx_id);
    }
    
    /**
     * @deprecated Use the new DbClient from '../db/index.js' instead
     */
    public async getCurrentBlockHeight(): Promise<number | null> {
        logger.warn('DbClient.getCurrentBlockHeight is deprecated', {
            recommendation: 'Use the new modular DbClient from \'../db/index.js\' instead.'
        });
        return await db_client.get_current_block_height();
    }
    
    /**
     * @deprecated Use the new DbClient from '../db/index.js' instead
     */
    public async getPost(post_txid: string, include_vote_options = false): Promise<any> {
        logger.warn('DbClient.getPost is deprecated', {
            recommendation: 'Use the new modular DbClient from \'../db/index.js\' instead.'
        });
        return await db_client.get_post(post_txid, include_vote_options);
    }
    
    /**
     * @deprecated Use the new DbClient from '../db/index.js' instead
     */
    public async getLocksForTarget(target_txid: string): Promise<any[]> {
        logger.warn('DbClient.getLocksForTarget is deprecated', {
            recommendation: 'Use the new modular DbClient from \'../db/index.js\' instead.'
        });
        return await db_client.get_locks_for_target(target_txid);
    }
    
    /**
     * @deprecated This method is no longer needed with the new architecture
     */
    private createBlockTimeDate(block_time?: number | string | null): Date {
        logger.warn('DbClient.createBlockTimeDate is deprecated');
        return new Date();
    }
    
    /**
     * @deprecated This method is no longer needed with the new architecture
     */
    private chunk<T>(arr: T[], size: number): T[][] {
        logger.warn('DbClient.chunk is deprecated');
        return [];
    }
}

// Export singleton instance
export const dbClient = DbClient.get_instance();

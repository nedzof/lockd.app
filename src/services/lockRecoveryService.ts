import { PrismaClient } from '@prisma/client';
import logger from './logger';
import axios from 'axios';

const prisma = new PrismaClient();

/**
 * Service responsible for reconstructing lock data from blockchain transactions
 * in case of database failures or inconsistencies
 */
export class LockRecoveryService {
  private static instance: LockRecoveryService | null = null;

  // Singleton pattern
  public static getInstance(): LockRecoveryService {
    if (!LockRecoveryService.instance) {
      LockRecoveryService.instance = new LockRecoveryService();
    }
    return LockRecoveryService.instance;
  }

  /**
   * Verify all lock records against blockchain data to ensure consistency
   */
  public async verifyLockRecords(): Promise<{
    verified: number;
    mismatched: number;
    recovered: number;
  }> {
    const result = { verified: 0, mismatched: 0, recovered: 0 };
    
    try {
      logger.info('Starting lock record verification');
      
      // Get all lock records from the database
      const locks = await prisma.lock_like.findMany({
        select: {
          id: true,
          tx_id: true,
          amount: true,
          unlock_height: true
        }
      });
      
      logger.info(`Found ${locks.length} lock records to verify`);
      
      // Verify each lock against blockchain data
      for (const lock of locks) {
        try {
          // Skip records with generated tx_ids (not real blockchain transactions)
          if (lock.tx_id.startsWith('lock_')) {
            continue;
          }
          
          // Get transaction data from blockchain
          const txData = await this.getTransactionData(lock.tx_id);
          
          if (!txData) {
            logger.warn(`Transaction ${lock.tx_id} not found on blockchain`);
            result.mismatched++;
            continue;
          }
          
          // Basic verification - transaction exists
          result.verified++;
          
        } catch (error) {
          logger.error(`Error verifying lock ${lock.id} (${lock.tx_id}):`, error);
          result.mismatched++;
        }
      }
      
      logger.info(`Lock verification complete: ${result.verified} verified, ${result.mismatched} mismatched, ${result.recovered} recovered`);
      return result;
    } catch (error) {
      logger.error('Error during lock verification:', error);
      throw error;
    }
  }
  
  /**
   * Reconstruct lock data from blockchain transactions
   * This can be used for disaster recovery in case of database corruption
   * @param startBlock Optional starting block to scan from
   * @param endBlock Optional ending block to scan to
   */
  public async reconstructLockData(startBlock?: number, endBlock?: number): Promise<{
    processed: number;
    recovered: number;
  }> {
    const result = { processed: 0, recovered: 0 };
    
    try {
      logger.info(`Starting lock data reconstruction from blockchain ${startBlock ? `from block ${startBlock}` : ''}`);
      
      // Implementation depends on blockchain API capabilities
      // This would typically involve:
      // 1. Finding transactions related to your application (searching for app-specific metadata)
      // 2. Identifying lock transactions based on their structure
      // 3. Reconstructing lock data and inserting into the database
      
      // For now, log a placeholder message
      logger.info('Lock data reconstruction would scan the blockchain for lock transactions and rebuild the database');
      
      return result;
    } catch (error) {
      logger.error('Error during lock data reconstruction:', error);
      throw error;
    }
  }
  
  /**
   * Get transaction data from blockchain API
   * @param txId Transaction ID
   */
  private async getTransactionData(txId: string): Promise<any> {
    try {
      // Use WhatsOnChain API as an example
      const response = await axios.get(`https://api.whatsonchain.com/v1/bsv/main/tx/${txId}`);
      return response.data;
    } catch (error) {
      logger.error(`Error fetching transaction ${txId}:`, error);
      return null;
    }
  }
}

// Export singleton instance
export const lockRecoveryService = LockRecoveryService.getInstance(); 
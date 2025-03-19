/**
 * JungleBusService
 * 
 * Handles interactions with the JungleBus API for fetching blockchain transactions.
 */

import { JungleBusClient } from '@gorillapool/js-junglebus';
import { CONFIG } from './config.js';
import logger from './logger.js';

interface TransactionCallback {
  (transaction: any): Promise<void>;
}

interface StatusCallback {
  (status: any): Promise<void>;
}

interface ErrorCallback {
  (error: Error, transactionId?: string): Promise<void>;
}

export class JungleBusService {
  private jungleBus: JungleBusClient;
  private subscriptionId: string;
  private baseUrl: string;
  
  constructor() {
    // Get configuration from environment variables via config
    this.subscriptionId = CONFIG.JB_SUBSCRIPTION_ID;
    this.baseUrl = CONFIG.JUNGLEBUS_URL;
    
    // Log a message if we're using the default subscription ID
    if (this.subscriptionId === 'lockd-app') {
      logger.warn('Using default subscription ID. Check your .env file for JB_SUBSCRIPTION_ID');
    }
    
    // Log configuration details
    logger.info('JungleBus Service initialized', {
      subscription_id: this.subscriptionId,
      base_url: this.baseUrl
    });
    
    // Initialize JungleBus client
    const baseUrlWithoutProtocol = this.baseUrl.replace(/^https?:\/\//, '');
    this.jungleBus = new JungleBusClient(baseUrlWithoutProtocol, {
      useSSL: this.baseUrl.startsWith('https'),
      protocol: 'json',
      onConnected: (ctx) => {
        logger.info("🔌 JungleBus CONNECTED", ctx);
      },
      onConnecting: (ctx) => {
        logger.info("🔄 JungleBus CONNECTING", ctx);
      },
      onDisconnected: (ctx) => {
        logger.info("❌ JungleBus DISCONNECTED", ctx);
      },
      onError: (ctx) => {
        logger.error("❌ JungleBus ERROR", ctx);
      },
    });
  }
  
  /**
   * Subscribe to JungleBus for transaction notifications
   * @param fromBlock The block height to start from
   * @param onTransaction Callback for transaction processing
   * @param onStatus Callback for status updates
   * @param onError Callback for error handling
   * @returns The subscription ID
   */
  async subscribe(
    fromBlock: number,
    onTransaction: TransactionCallback,
    onStatus: StatusCallback,
    onError: ErrorCallback
  ): Promise<string> {
    try {
      logger.info('Subscribing to JungleBus', { 
        fromBlock,
        subscription_id: this.subscriptionId 
      });
      
      // Subscribe to JungleBus
      await this.jungleBus.Subscribe(
        this.subscriptionId,
        fromBlock,
        async (tx: any) => {
          try {
            // Don't log transaction IDs here - let the onTransaction handler decide if this is a transaction worth logging
            // This way we only log transactions that are actually valid and processed
            await onTransaction(tx);
          } catch (error) {
            const txId = tx?.tx?.h || tx?.hash || tx?.id || tx?.tx_id;
            logger.error('Failed to process transaction', {
              transaction_id: txId,
              error: (error as Error).message
            });
            await onError(error as Error, txId);
          }
        },
        async (status: any) => {
          try {
            // Only log status updates if they're important or contain transactions
            if ((status.statusCode === 200 && status.transactions > 0) || // Block done with transactions 
                status.statusCode === 300 || // Reorg
                status.statusCode === 400) { // Error
              logger.info('Status update received', status);
            }
            await onStatus(status);
          } catch (error) {
            logger.error('Failed to process status update', {
              status,
              error: (error as Error).message
            });
          }
        },
        async (error: any) => {
          logger.error('JungleBus subscription error', { 
            error: error instanceof Error ? error.message : JSON.stringify(error) 
          });
          await onError(error instanceof Error ? error : new Error(JSON.stringify(error)));
        }
      );
      
      return this.subscriptionId;
    } catch (error) {
      logger.error('Failed to subscribe to JungleBus', { error: (error as Error).message });
      throw error;
    }
  }
  
  /**
   * Unsubscribe from the current JungleBus subscription
   */
  async unsubscribe(): Promise<void> {
    try {
      logger.info('Unsubscribing from JungleBus', { subscription_id: this.subscriptionId });
      await this.jungleBus.Disconnect();
    } catch (error) {
      logger.error('Failed to unsubscribe from JungleBus', { error: (error as Error).message });
      throw error;
    }
  }
}

// Export singleton instance
export const junglebus_service = new JungleBusService();
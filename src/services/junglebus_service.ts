/**
 * JungleBusService
 * 
 * Handles interactions with the JungleBus API for fetching blockchain transactions.
 */

import { createLogger, format, transports, Logger } from 'winston';
import { JungleBusClient } from '@gorillapool/js-junglebus';
import { CONFIG } from './config.js';

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
  private logger: Logger;
  private subscriptionId: string;
  private apiKey: string;
  private baseUrl: string;
  
  constructor() {
    // Initialize logger first
    this.logger = createLogger({
      level: 'info',
      format: format.combine(
        format.timestamp(),
        format.printf(({ level, message, timestamp, ...meta }) => {
          return `${timestamp} [${level.toUpperCase()}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;
        })
      ),
      transports: [
        new transports.Console()
      ]
    });
    
    // Get configuration from environment variables via config
    this.subscriptionId = CONFIG.JB_SUBSCRIPTION_ID;
    this.apiKey = CONFIG.JUNGLEBUS_API_KEY;
    this.baseUrl = CONFIG.JUNGLEBUS_URL;
    
    // Log a message if we're using the default subscription ID
    if (this.subscriptionId === 'lockd-app') {
      this.logger.warn('Using default subscription ID. Check your .env file for JB_SUBSCRIPTION_ID');
    }
    
    // Log configuration details (but don't log sensitive API key)
    this.logger.info('JungleBus Service initialized', {
      subscription_id: this.subscriptionId,
      base_url: this.baseUrl,
      has_api_key: !!this.apiKey
    });
    
    // Initialize JungleBus client
    const baseUrlWithoutProtocol = this.baseUrl.replace(/^https?:\/\//, '');
    this.jungleBus = new JungleBusClient(baseUrlWithoutProtocol, {
      useSSL: this.baseUrl.startsWith('https'),
      protocol: 'json',
      token: this.apiKey,
      onConnected: (ctx) => {
        this.logger.info("🔌 JungleBus CONNECTED", ctx);
      },
      onConnecting: (ctx) => {
        this.logger.info("🔄 JungleBus CONNECTING", ctx);
      },
      onDisconnected: (ctx) => {
        this.logger.info("❌ JungleBus DISCONNECTED", ctx);
      },
      onError: (ctx) => {
        this.logger.error("❌ JungleBus ERROR", ctx);
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
      this.logger.info('Subscribing to JungleBus', { 
        fromBlock,
        subscription_id: this.subscriptionId 
      });
      
      // Subscribe to JungleBus
      await this.jungleBus.Subscribe(
        this.subscriptionId,
        fromBlock,
        async (tx: any) => {
          try {
            const txId = tx?.tx?.h || tx?.hash || tx?.id || tx?.tx_id;
            this.logger.info(`Found transaction: ${txId}`, { tx_id: txId, tx: tx });
            await onTransaction(tx);
          } catch (error) {
            const txId = tx?.tx?.h || tx?.hash || tx?.id || tx?.tx_id;
            this.logger.error('Failed to process transaction', {
              transaction_id: txId,
              error: (error as Error).message
            });
            await onError(error as Error, txId);
          }
        },
        async (status: any) => {
          try {
            this.logger.info('Status update received', status);
            await onStatus(status);
          } catch (error) {
            this.logger.error('Failed to process status update', {
              status,
              error: (error as Error).message
            });
          }
        },
        async (error: any) => {
          this.logger.error('JungleBus subscription error', { 
            error: error instanceof Error ? error.message : JSON.stringify(error) 
          });
          await onError(error instanceof Error ? error : new Error(JSON.stringify(error)));
        }
      );
      
      return this.subscriptionId;
    } catch (error) {
      this.logger.error('Failed to subscribe to JungleBus', { error: (error as Error).message });
      throw error;
    }
  }
  
  /**
   * Unsubscribe from the current JungleBus subscription
   */
  async unsubscribe(): Promise<void> {
    try {
      this.logger.info('Unsubscribing from JungleBus', { subscription_id: this.subscriptionId });
      await this.jungleBus.Disconnect();
    } catch (error) {
      this.logger.error('Failed to unsubscribe from JungleBus', { error: (error as Error).message });
      throw error;
    }
  }
}

// Export singleton instance
export const junglebus_service = new JungleBusService();

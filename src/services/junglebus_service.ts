/**
 * JungleBusService
 * 
 * Simple service to interact with JungleBus API
 */

import { JungleBusClient, ControlMessageStatusCode } from '@gorillapool/js-junglebus';
import { CONFIG } from './config.js';
import logger from './logger.js';

export class JungleBusService {
  private client: JungleBusClient;
  private subscriptionId: string;
  
  constructor() {
    this.subscriptionId = CONFIG.JB_SUBSCRIPTION_ID;
    
    // Initialize client with simple configuration
    const baseUrl = CONFIG.JUNGLEBUS_URL.replace(/^https?:\/\//, '');
    this.client = new JungleBusClient(baseUrl, {
      useSSL: CONFIG.JUNGLEBUS_URL.startsWith('https'),
      protocol: 'json',
      onConnected: (ctx) => {
        logger.info('🔌 Connected to JungleBus', ctx);
      },
      onConnecting: (ctx) => {
        logger.info('🔄 Connecting to JungleBus', ctx);
      },
      onDisconnected: (ctx) => {
        logger.info('🔌 Disconnected from JungleBus', ctx);
      },
      onError: (ctx) => {
        logger.error('❌ JungleBus error', ctx);
      }
    });
    
    logger.info('🛠️ JungleBus service initialized', {
      subscription_id: this.subscriptionId,
      url: CONFIG.JUNGLEBUS_URL
    });
  }
  
  /**
   * Subscribe to blockchain events
   */
  async subscribe(
    fromBlock: number,
    onTransaction: (tx: any) => Promise<void>,
    onStatus: (status: any) => Promise<void>,
    onError: (error: any, txId?: string) => Promise<void>
  ): Promise<string> {
    try {
      logger.info('🔄 Subscribing to JungleBus', { 
        from_block: fromBlock,
        subscription_id: this.subscriptionId 
      });
      
      await this.client.Subscribe(
        this.subscriptionId,
        fromBlock,
        async (tx: any) => {
          try {
            await onTransaction(tx);
          } catch (error) {
            const txId = tx?.tx?.h || tx?.hash || tx?.id || tx?.tx_id || 'unknown';
            logger.error('❌ Transaction handler error', {
              tx_id: txId,
              error: error instanceof Error ? error.message : String(error)
            });
            await onError(error, txId);
          }
        },
        async (status: any) => {
          try {
            // Log important status updates
            if (status.statusCode === ControlMessageStatusCode.BLOCK_DONE && status.transactions > 0) {
              logger.info('🧱 Block processed', { 
                block: status.block, 
                transactions: status.transactions 
              });
            } else if (status.statusCode === ControlMessageStatusCode.REORG) {
              logger.warn('🔄 Blockchain reorg', { block: status.block });
            }
            
            await onStatus(status);
          } catch (error) {
            logger.error('❌ Status handler error', {
              error: error instanceof Error ? error.message : String(error)
            });
          }
        },
        async (error: any) => {
          logger.error('❌ JungleBus subscription error', { 
            error: error instanceof Error ? error.message : String(error) 
          });
          await onError(error);
        }
      );
      
      return this.subscriptionId;
    } catch (error) {
      logger.error('❌ Failed to subscribe to JungleBus', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }
  
  /**
   * Unsubscribe from JungleBus
   */
  async unsubscribe(): Promise<void> {
    try {
      logger.info('🛑 Unsubscribing from JungleBus');
      await this.client.Disconnect();
    } catch (error) {
      logger.error('❌ Failed to unsubscribe from JungleBus', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }
}

// Export singleton instance
export const junglebus_service = new JungleBusService();
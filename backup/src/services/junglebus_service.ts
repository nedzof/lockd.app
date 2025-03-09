/**
 * JungleBusService
 * 
 * Handles all interactions with the JungleBus API for fetching blockchain transactions.
 * Implements retry logic, error handling, and exponential backoff.
 */

import { createLogger, format, transports, Logger } from 'winston';
import { JungleBusClient } from '@gorillapool/js-junglebus';
import { CONFIG } from './config';

interface JungleBusConfig {
  baseUrl?: string;
  subscriptionId?: string;
  maxRetries?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  backoffFactor?: number;
}

interface TransactionCallback {
  (transaction: any): Promise<void>;
}

interface StatusCallback {
  (status: any): Promise<void>;
}

interface ErrorCallback {
  (error: Error, transactionId?: string): Promise<void>;
}

interface MempoolCallback {
  (transaction: any): Promise<void>;
}

export class JungleBusService {
  private jungleBus: JungleBusClient;
  private subscription: any | null = null;
  private logger: Logger;
  private config: Required<JungleBusConfig>;
  
  constructor(config: JungleBusConfig = {}) {
    // Set default configuration values
    this.config = {
      baseUrl: config.baseUrl || 'junglebus.gorillapool.io',
      subscriptionId: config.subscriptionId || process.env.JB_SUBSCRIPTION_ID || CONFIG.JB_SUBSCRIPTION_ID,
      maxRetries: config.maxRetries || CONFIG.JB_MAX_RETRIES,
      initialBackoffMs: config.initialBackoffMs || CONFIG.JB_RETRY_DELAY_MS,
      maxBackoffMs: config.maxBackoffMs || CONFIG.JB_MAX_RETRY_DELAY_MS,
      backoffFactor: config.backoffFactor || 2
    };
    
    // Initialize logger
    this.logger = createLogger({
      level: 'info',
      format: format.combine(
        format.timestamp(),
        format.json()
      ),
      transports: [
        new transports.Console()
      ]
    });
    
    // Initialize JungleBus client
    this.jungleBus = new JungleBusClient(this.config.baseUrl, {
      useSSL: true,
      protocol: 'json',
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
   * @param onMempool Callback for mempool transactions
   * @returns The subscription ID
   */
  async subscribe(
    fromBlock: number,
    onTransaction: TransactionCallback,
    onStatus: StatusCallback,
    onError: ErrorCallback,
    onMempool?: MempoolCallback
  ): Promise<string> {
    try {
      this.logger.info('Subscribing to JungleBus', { 
        fromBlock,
        subscription_id: this.config.subscriptionId 
      });
      
      // Lazy-load JungleBus if not already initialized
      if (!this.jungleBus) {
        const JungleBusModule = await import('@gorillapool/js-junglebus');
        const JungleBusClient = JungleBusModule.JungleBusClient;
        
        this.jungleBus = new JungleBusClient(this.config.baseUrl, {
          useSSL: true,
          protocol: 'json',
          onConnected: (ctx: any) => {
            this.logger.info("🔌 JungleBus CONNECTED", ctx);
          },
          onConnecting: (ctx: any) => {
            this.logger.info("🔄 JungleBus CONNECTING", ctx);
          },
          onDisconnected: (ctx: any) => {
            this.logger.info("❌ JungleBus DISCONNECTED", ctx);
          },
          onError: (ctx: any) => {
            this.logger.error("❌ JungleBus ERROR", ctx);
            onError(new Error(ctx.message || 'Unknown JungleBus error'));
          },
        });
      }
      
      // Subscribe to JungleBus using the format from the backup implementation
      await this.jungleBus.Subscribe(
        this.config.subscriptionId,
        fromBlock,
        async (tx: any) => {
          try {
            await this.with_retry(() => onTransaction(tx));
          } catch (error) {
            this.logger.error('Failed to process transaction after retries', {
              transaction_id: tx?.tx?.h || tx?.hash || tx?.id || tx?.tx_id,
              error: (error as Error).message
            });
            await onError(error as Error, tx?.tx?.h || tx?.hash || tx?.id || tx?.tx_id);
          }
        },
        async (status: any) => {
          try {
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
        },
        onMempool ? async (tx: any) => {
          try {
            await this.with_retry(() => onMempool(tx));
          } catch (error) {
            this.logger.error('Failed to process mempool transaction', {
              transaction_id: tx?.tx?.h || tx?.hash || tx?.id || tx?.tx_id,
              error: (error as Error).message
            });
          }
        } : undefined
      );
      
      this.subscription = { id: this.config.subscriptionId };
      return this.config.subscriptionId;
    } catch (error) {
      this.logger.error('Failed to subscribe to JungleBus', { error: (error as Error).message });
      throw error;
    }
  }
  
  /**
   * Unsubscribe from the current JungleBus subscription
   */
  async unsubscribe(): Promise<void> {
    if (this.jungleBus && this.subscription) {
      try {
        this.logger.info('Unsubscribing from JungleBus', { subscription_id: this.subscription.id });
        await this.jungleBus.Disconnect();
        this.subscription = null;
      } catch (error) {
        this.logger.error('Failed to unsubscribe from JungleBus', { error: (error as Error).message });
        throw error;
      }
    }
  }
  
  /**
   * Fetch subscription details from JungleBus API
   * @returns The subscription details
   */
  async fetchSubscriptionDetails(): Promise<any> {
    try {
      // Direct API call to JungleBus
      const response = await fetch(`https://${this.config.baseUrl}/v1/subscription/${this.config.subscriptionId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      this.logger.info("📋 SUBSCRIPTION DETAILS", { data });
      return data;
    } catch (error) {
      this.logger.warn("⚠️ Failed to fetch subscription details", {
        error: error instanceof Error ? error.message : 'Unknown error',
        subscription_id: this.config.subscriptionId
      });
      return null;
    }
  }
  
  /**
   * Execute a function with retry logic and exponential backoff
   * @param fn The function to execute
   * @returns The result of the function
   */
  private async with_retry<T>(fn: () => Promise<T>): Promise<T> {
    let retries = 0;
    let backoffMs = this.config.initialBackoffMs;
    
    while (true) {
      try {
        return await fn();
      } catch (error) {
        retries++;
        
        if (retries >= this.config.maxRetries) {
          this.logger.error('Max retries reached', { 
            retries, 
            error: (error as Error).message 
          });
          throw error;
        }
        
        this.logger.warn('Retrying after error', { 
          retry: retries, 
          backoff_ms: backoffMs,
          error: (error as Error).message 
        });
        
        // Wait for backoff period
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        
        // Increase backoff for next retry (exponential backoff)
        backoffMs = Math.min(
          backoffMs * this.config.backoffFactor,
          this.config.maxBackoffMs
        );
      }
    }
  }
  
  /**
   * Get historical transactions from the blockchain
   * @param fromBlock The block height to start from
   * @param toBlock The block height to end at (optional, defaults to latest block)
   * @param batchSize Number of transactions to fetch at once (default 100)
   * @returns Array of historical transactions
   */
  async get_historical_transactions(
    fromBlock: number,
    toBlock?: number,
    batchSize: number = 100
  ): Promise<any[]> {
    try {
      this.logger.info('Fetching historical transactions', {
        from_block: fromBlock,
        to_block: toBlock || 'latest',
        batch_size: batchSize
      });
      
      // Use the JungleBus API to fetch historical transactions
      // Simulating with a temporary implementation - this will need to be replaced
      // with actual JungleBus API calls when available
      
      // Use our existing subscription to fetch transactions
      // This is a simplified example - in a production environment, we would
      // use a more sophisticated approach to query historical transactions
      
      // For the purpose of this implementation, we'll use the current database
      // to get sample transactions that we can reprocess
      
      // Sample transaction data (mock data for now)
      const mockTransactions = [
        {
          tx: { h: 'sample_text_post_transaction_1' },
          block: { 
            time: Math.floor(Date.now() / 1000), 
            height: fromBlock + 100,
            hash: '000000000000000003247295d101b891ca1200bec85b972612...'
          },
          addresses: ['c201b3574c0118f9d21284b917498acd9748121e'],
          outputs: [
            "0063036f7264510a746578742f706c61696e002b456e747765646572207265646520696368206f6465722064752e20457320726569636874206a65747a74216876a914c201b3574c0118f9d21284b917498acd9748121e88ac6a223150755161374b36324d694b43747373534c4b79316b683536575755374d745552350353455403617070096c6f636b642e61707007636f6e74656e742b456e747765646572207265646520696368206f6465722064752e20457320726569636874206a65747a74210969735f6c6f636b65640566616c73650769735f766f74650566616c736506706f73744964126d376e74357a756f2d65687530677036363708736571",
            "76a914c201b3574c0118f9d21284b917498acd9748121e88ac"
          ]
        },
        {
          tx: { h: 'sample_vote_post_transaction_1' },
          block: { 
            time: Math.floor(Date.now() / 1000),
            height: fromBlock + 150,
            hash: '000000000000000003247295d101b891ca1200bec85b972612...'
          },
          addresses: ['c201b3574c0118f9d21284b917498acd9748121e'],
          outputs: [
            "0063036f7264510a746578742f706c61696e001957686f206973207468652022536368776163686b6f7066223f6876a914c201b3574c0118f9d21284b917498acd9748121e88ac6a223150755161374b36324d694b43747373534c4b79316b683536575755374d745552350353455403617070096c6f636b642e61707007636f6e74656e741957686f206973207468652022536368776163686b6f7066223f0969735f6c6f636b65640566616c73650769735f766f746504747275650c6f7074696f6e735f68617368406233653865346666333864623332386230356362373664343836323863323232636461353463356365373933343839633265633465",
            "0063036f7264510a746578742f706c61696e0006467269747a656876a914c201b3574c0118f9d21284b917498acd9748121e88ac6a223150755161374b36324d694b43747373534c4b79316b683536575755374d745552350353455403617070096c6f636b642e61707007636f6e74656e7406467269747a650769735f766f746504747275650b6f7074696f6e496e64657801300e706172656e7453657175656e6365013007706f73745f6964126d377165327874332d6431333535337333730873657175656e636501320474616773025b5d0974696d657374616d7018323032352d30332d30315431363a30313a30302e3730345a04747970650b766f74",
            "76a914c201b3574c0118f9d21284b917498acd9748121e88ac"
          ]
        }
      ];
      
      this.logger.info(`Found ${mockTransactions.length} sample transactions for reprocessing`);
      
      // TODO: Replace this with actual API call to fetch historical transactions
      // when the JungleBus API supports it
      
      // For future implementation:
      // const historicalTransactions = await this.jungleBus.getTransactions({
      //   fromBlock: fromBlock,
      //   toBlock: toBlock,
      //   limit: batchSize
      // });
      
      return mockTransactions;
    } catch (error) {
      this.logger.error('Failed to fetch historical transactions', {
        error: (error as Error).message,
        from_block: fromBlock,
        to_block: toBlock
      });
      return [];
    }
  }
}

// Export singleton instance
export const junglebus_service = new JungleBusService();

// Export default for direct instantiation
export default JungleBusService;
import { PrismaClient } from '@prisma/client';
import { logger } from '../../utils/logger.js';
import { tx_parser } from '../../services/tx_parser.js';
import { JungleBusService } from '../../services/junglebus_service.js';

interface ScannerOptions {
  startBlock?: number;
  cleanupDb?: boolean;
  subscriptionId?: string;
  environment?: 'development' | 'production';
}

/**
 * Main scanner class that handles blockchain scanning operations
 */
export class Scanner {
  private prisma: PrismaClient;
  private jungleBus: JungleBusService;
  private isRunning: boolean = false;

  constructor(options: ScannerOptions = {}) {
    this.prisma = new PrismaClient();
    this.jungleBus = new JungleBusService({
      subscriptionId: options.subscriptionId,
      environment: options.environment
    });
  }

  /**
   * Start the scanner
   */
  async start(options: ScannerOptions = {}) {
    try {
      logger.info('Starting Lockd App Transaction Scanner', {
        start_block: options.startBlock,
        subscription_id: this.jungleBus.subscriptionId,
        environment: options.environment
      });

      // Cleanup database if requested
      if (options.cleanupDb) {
        await this.cleanup();
      }

      // Initialize scanner
      await this.initialize(options);

      // Start scanning
      this.isRunning = true;
      await this.startScanning(options.startBlock);

      logger.info('Scanner is running. Press Ctrl+C to stop.');
    } catch (error) {
      logger.error('Error starting scanner', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Stop the scanner
   */
  async stop() {
    try {
      this.isRunning = false;
      await this.jungleBus.unsubscribe();
      await this.prisma.$disconnect();
      logger.info('Scanner stopped');
    } catch (error) {
      logger.error('Error stopping scanner', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Initialize the scanner
   */
  private async initialize(options: ScannerOptions) {
    try {
      // Initialize JungleBus service
      await this.jungleBus.initialize();

      // Initialize transaction parser
      await tx_parser.initialize();

      logger.info('Scanner initialized');
    } catch (error) {
      logger.error('Error initializing scanner', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Start scanning from a specific block
   */
  private async startScanning(fromBlock?: number) {
    try {
      const startBlock = fromBlock || await this.getLastProcessedBlock();
      logger.info(`Starting scanner from block ${startBlock}`);

      await this.jungleBus.subscribe({
        fromBlock: startBlock,
        onTransaction: this.handleTransaction.bind(this),
        onStatus: this.handleStatus.bind(this),
        onError: this.handleError.bind(this)
      });

      logger.info('Scanner subscription established');
    } catch (error) {
      logger.error('Error starting scanner subscription', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Handle incoming transaction
   */
  private async handleTransaction(tx: any) {
    try {
      const data = tx_parser.extract_data_from_transaction(tx);
      if (data && data.length > 0) {
        await this.prisma.processed_transaction.create({
          data: {
            tx_id: tx.id,
            block_height: tx.block_height || 0,
            block_time: BigInt(tx.block_time || 0),
            protocol: 'LOCKD',
            type: 'unknown',
            metadata: {
              author_address: tx.author_address,
              block_hash: tx.block_hash
            }
          }
        });
      }
    } catch (error) {
      logger.error('Error processing transaction', {
        tx_id: tx?.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle status updates
   */
  private async handleStatus(status: any) {
    try {
      logger.info('Status update received', {
        block: status.block,
        transactions: status.transactions,
        block_hash: status.block_hash
      });

      logger.info(`Block ${status.block} processed with ${status.transactions} transactions`);
    } catch (error) {
      logger.error('Error handling status update', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Handle errors
   */
  private async handleError(error: any) {
    logger.error('Scanner error', {
      error: error instanceof Error ? error.message : String(error)
    });
  }

  /**
   * Get the last processed block
   */
  private async getLastProcessedBlock(): Promise<number> {
    try {
      const lastTx = await this.prisma.processed_transaction.findFirst({
        orderBy: { block_height: 'desc' }
      });
      return lastTx?.block_height || 0;
    } catch (error) {
      logger.error('Error getting last processed block', {
        error: error instanceof Error ? error.message : String(error)
      });
      return 0;
    }
  }

  /**
   * Cleanup the database
   */
  private async cleanup() {
    try {
      await this.prisma.processed_transaction.deleteMany();
      await this.prisma.post.deleteMany();
      await this.prisma.vote_option.deleteMany();
      logger.info('Database cleaned up');
    } catch (error) {
      logger.error('Error cleaning up database', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
} 
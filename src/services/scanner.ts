import { JungleBusClient, ControlMessageStatusCode } from "@gorillapool/js-junglebus";
import { TransactionParser } from './parser';
import { DBClient } from './dbClient';
import { logger } from '../utils/logger';

export class Scanner {
    private client: JungleBusClient;
    private parser: TransactionParser;
    private dbClient: DBClient;
    readonly subscriptionId = '2177e79197422e0d162a685bb6fcc77c67f55a1920869d7c7685b0642043eb9c';
    readonly startBlock = 882000;
    private transactionBatch: any[] = [];
    private readonly BATCH_SIZE = 50;
    private readonly MAX_RETRIES = 3;

    constructor() {
        console.log('Initializing Scanner components...');
        
        console.log('Creating TransactionParser...');
        this.parser = new TransactionParser();
        
        console.log('Creating DBClient...');
        this.dbClient = new DBClient();
        
        console.log('Creating JungleBusClient...');
        this.client = new JungleBusClient("junglebus.gorillapool.io", {
            useSSL: true,
            protocol: "json",
            onConnected: (ctx) => {
                console.log("Connected to JungleBus:", ctx);
                logger.info("Connected to JungleBus", { context: ctx });
            },
            onConnecting: (ctx) => {
                console.log("Connecting to JungleBus:", ctx);
                logger.info("Connecting to JungleBus", { context: ctx });
            },
            onDisconnected: (ctx) => {
                console.log("Disconnected from JungleBus:", ctx);
                logger.warn("Disconnected from JungleBus", { context: ctx });
            },
            onError: (ctx) => {
                console.log("JungleBus error:", ctx);
                logger.error("JungleBus error", { error: ctx });
            },
        });
        
        console.log('Scanner initialization complete');
    }

    private async handleMessage(message: any) {
        try {
          logger.debug('Received message from JungleBus', {
            type: message.type,
            block: message.block?.height,
            txCount: message.block?.tx?.length || 0,
            messageKeys: Object.keys(message),
            blockKeys: message.block ? Object.keys(message.block) : [],
            txKeys: message.transaction ? Object.keys(message.transaction) : []
          });

          if (message.block?.tx) {
            // Log sample transaction structure
            const sampleTx = message.block.tx[0];
            if (sampleTx) {
              logger.debug('Sample transaction structure', {
                txKeys: Object.keys(sampleTx),
                hasTx: !!sampleTx.tx,
                txInnerKeys: sampleTx.tx ? Object.keys(sampleTx.tx) : [],
                hasRaw: !!(sampleTx.tx?.raw || sampleTx.raw),
                rawLength: (sampleTx.tx?.raw || sampleTx.raw || '').length
              });
            }
          }

          if (message.type === 'block') {
            await this.processBlock(message.block);
          } else if (message.type === 'transaction') {
            await this.processTransaction(message.transaction);
          }
        } catch (error) {
          logger.error('Error handling message', {
            error: error instanceof Error ? error.message : 'Unknown error',
            messageType: message.type
          });
          throw error;
        }
    }

    private async processTransaction(tx: any) {
        try {
          logger.debug('Processing single transaction', {
            txid: tx.h,
            hasRaw: !!tx.raw,
            txKeys: Object.keys(tx)
          });

          const parsed = await this.parser.parseTransaction({ tx });
          if (parsed && parsed.length > 0) {
            await this.dbClient.insertTransactions(parsed);
          }
        } catch (error) {
          logger.error('Error processing transaction', {
            txid: tx.h,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          throw error;
        }
    }

    private async processBlock(block: Block): Promise<void> {
        logger.info('Processing block', {
          height: block.height,
          txCount: block.tx?.length || 0,
          timestamp: block.timestamp,
          hasTransactions: !!block.tx,
          blockKeys: Object.keys(block)
        });

        if (!block.tx || block.tx.length === 0) {
          logger.debug('No transactions in block', { height: block.height });
          return;
        }

        try {
          // Process transactions in batches
          const batches = this.chunk(block.tx, this.BATCH_SIZE);
          logger.debug('Split transactions into batches', {
            totalTx: block.tx.length,
            batchCount: batches.length,
            batchSize: this.BATCH_SIZE
          });

          for (const [batchIndex, batch] of batches.entries()) {
            const parsedTransactions: ParsedTransaction[] = [];
            const batchStart = process.hrtime();

            // Parse each transaction in the batch
            for (const tx of batch) {
              logger.debug('Processing transaction in batch', {
                blockHeight: block.height,
                txid: tx.tx?.h || tx.h,
                hasRaw: !!(tx.tx?.raw || tx.raw),
                txKeys: Object.keys(tx),
                txInnerKeys: tx.tx ? Object.keys(tx.tx) : [],
                batchIndex
              });

              const parsed = await this.parser.parseTransaction(tx);
              if (parsed) {
                parsedTransactions.push(...parsed);
                logger.debug('Transaction parsed successfully', {
                  txid: tx.tx?.h || tx.h,
                  parsedCount: parsed.length
                });
              }
            }

            const [batchSeconds, batchNanos] = process.hrtime(batchStart);
            logger.info('Batch processing complete', {
              blockHeight: block.height,
              batchIndex,
              parsedCount: parsedTransactions.length,
              processingTime: batchSeconds + batchNanos / 1e9
            });

            if (parsedTransactions.length > 0) {
              logger.info('Inserting batch of transactions', {
                blockHeight: block.height,
                batchSize: parsedTransactions.length,
                batchIndex
              });

              let retryCount = 0;
              while (retryCount < this.MAX_RETRIES) {
                try {
                  await this.dbClient.insertTransactions(parsedTransactions);
                  break;
                } catch (error) {
                  retryCount++;
                  if (retryCount === this.MAX_RETRIES) {
                    throw error;
                  }
                  logger.warn('Retrying batch insert', {
                    attempt: retryCount,
                    maxRetries: this.MAX_RETRIES,
                    error: error instanceof Error ? error.message : 'Unknown error'
                  });
                  await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
                }
              }
            }
          }

          logger.info('Block processing complete', {
            block: block.height,
            status: 200
          });
        } catch (error) {
          logger.error('Error processing block', {
            height: block.height,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          throw error;
        }
    }

    private chunk(arr: any[], size: number): any[][] {
        return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => 
          arr.slice(i * size, (i + 1) * size)
        );
    }

    private async start() {
        try {
            const config = {
                startBlock: this.startBlock,
                batchSize: this.BATCH_SIZE,
                maxRetries: this.MAX_RETRIES
            };
            logger.info('Starting scanner with config', config);
            
            logger.info('Connecting to database...');
            const dbStartTime = Date.now();
            await this.dbClient.connect();
            const dbDuration = Date.now() - dbStartTime;
            logger.info('Database connected', {
                durationMs: dbDuration
            });
            
            logger.info('Starting JungleBus subscription...');
            await this.client.Subscribe(
                this.subscriptionId,
                this.startBlock,
                this.handleMessage.bind(this),
                this.handleStatus.bind(this),
                this.handleError.bind(this),
                this.handleMessage.bind(this)
            );
            
            logger.info('Scanner initialization complete', {
                ...config,
                time: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Error starting scanner', {
                error: error instanceof Error ? error.message : error,
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    private async stop() {
        try {
            // Process any remaining transactions in the batch
            if (this.transactionBatch.length > 0) {
                console.log(`Processing remaining ${this.transactionBatch.length} transactions before stopping...`);
                await this.processBatch();
            }
            
            await this.client.Disconnect();
            logger.info('Scanner stopped');
        } catch (error) {
            logger.error('Error stopping scanner', {
                error: error instanceof Error ? error.message : error
            });
            throw error;
        }
    }

    private handleStatus(message: any) {
        if (message.statusCode === ControlMessageStatusCode.BLOCK_DONE) {
            logger.info("Block processing complete", { 
                block: message.block,
                status: message.statusCode,
                time: new Date().toISOString()
            });
        } else if (message.statusCode === ControlMessageStatusCode.WAITING) {
            logger.info("Waiting for new block", { 
                message,
                time: new Date().toISOString()
            });
        } else if (message.statusCode === ControlMessageStatusCode.REORG) {
            logger.warn("Reorg detected", { 
                message,
                time: new Date().toISOString()
            });
        } else if (message.statusCode === ControlMessageStatusCode.ERROR) {
            logger.error("Status error", { 
                message,
                time: new Date().toISOString()
            });
        }
    }

    private handleError(error: any) {
        logger.error('Subscription error', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }

    private async processBatch(): Promise<void> {
        if (this.transactionBatch.length === 0) {
            logger.info('Skipping batch processing - empty batch');
            return;
        }

        const currentBatch = [...this.transactionBatch];
        const batchSize = currentBatch.length;
        logger.info('Starting batch processing', {
            batchSize,
            firstTxId: currentBatch[0]?.txid,
            lastTxId: currentBatch[batchSize - 1]?.txid
        });

        this.transactionBatch = []; // Clear the batch
        logger.info('Cleared transaction batch', {
            previousSize: batchSize,
            newSize: this.transactionBatch.length
        });

        let retryCount = 0;
        while (retryCount < this.MAX_RETRIES) {
            try {
                logger.info(`Processing batch attempt ${retryCount + 1}/${this.MAX_RETRIES}`, {
                    batchSize
                });
                
                // Process each transaction in the batch
                for (const [index, parsedTx] of currentBatch.entries()) {
                    logger.info('Processing transaction from batch', {
                        txId: parsedTx.txid,
                        batchIndex: index,
                        batchSize
                    });

                    const dbStartTime = Date.now();
                    await this.dbClient.saveTransaction(parsedTx);
                    const dbDuration = Date.now() - dbStartTime;
                    
                    logger.info('Database insert successful', {
                        txId: parsedTx.txid,
                        durationMs: dbDuration,
                        batchIndex: index
                    });
                    
                    const blockTime = parsedTx.blockTime ? new Date(parsedTx.blockTime * 1000) : new Date();
                    logger.info('Transaction processed successfully', {
                        txId: parsedTx.txid,
                        block: parsedTx.blockHeight,
                        count: 1,
                        time: blockTime.toISOString(),
                        timestamp: blockTime.toISOString(),
                        types: [parsedTx.type],
                        batchIndex: index
                    });
                }

                logger.info('Batch processed successfully', {
                    batchSize,
                    attempt: retryCount + 1,
                    time: new Date().toISOString()
                });
                return;
            } catch (error) {
                retryCount++;
                const isLastRetry = retryCount === this.MAX_RETRIES;
                
                logger.error(`Batch processing failed`, {
                    attempt: retryCount,
                    maxRetries: this.MAX_RETRIES,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    stack: error instanceof Error ? error.stack : undefined,
                    batchSize,
                    isLastRetry
                });

                if (isLastRetry) {
                    // On final retry, log the failed transactions
                    for (const tx of currentBatch) {
                        logger.error('Failed to process transaction after all retries', {
                            txId: tx.txid,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                    }
                    return;
                }

                const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
                logger.info('Retrying batch after delay', {
                    attempt: retryCount,
                    delayMs: delay,
                    batchSize
                });
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
}

// Main entry point
const runScanner = async () => {
    console.log('Scanner script starting...');
    
    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
        console.error('Uncaught Exception:', error);
    });

    const scanner = new Scanner();
    console.log('Scanner instance created');
    
    try {
        await scanner.start();
        console.log('Scanner started successfully. Keeping process alive...');
        
        // Keep the process alive
        process.stdin.resume();
        
        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            console.log('Received SIGINT. Shutting down...');
            await scanner.stop();
            process.exit(0);
        });
    } catch (error) {
        console.error('Failed to start scanner:', error);
        process.exit(1);
    }
};

// Only run the scanner if this file is being run directly
if (process.env.NODE_ENV !== 'test') {
    runScanner().catch(error => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}
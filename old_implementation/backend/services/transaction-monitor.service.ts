import { LockTrackingService } from './lock-tracking.service';
import { WalletError, ErrorCodes } from '../../shared/utils/errors';

export class TransactionMonitorService {
  private static instance: TransactionMonitorService;
  private lockTrackingService: LockTrackingService;
  private monitoredTransactions: Map<string, NodeJS.Timeout>;
  private readonly POLLING_INTERVAL = 60000; // 1 minute
  private readonly MAX_RETRIES = 60; // 1 hour total monitoring time

  private constructor() {
    this.lockTrackingService = new LockTrackingService();
    this.monitoredTransactions = new Map();
  }

  public static getInstance(): TransactionMonitorService {
    if (!TransactionMonitorService.instance) {
      TransactionMonitorService.instance = new TransactionMonitorService();
    }
    return TransactionMonitorService.instance;
  }

  /**
   * Starts monitoring a transaction
   */
  public startMonitoring(txId: string): void {
    if (this.monitoredTransactions.has(txId)) {
      return;
    }

    let retries = 0;
    const interval = setInterval(async () => {
      try {
        await this.lockTrackingService.monitorTransaction(txId);
        this.stopMonitoring(txId);
      } catch (error) {
        retries++;
        if (retries >= this.MAX_RETRIES) {
          this.stopMonitoring(txId);
          console.error(`Failed to monitor transaction ${txId} after ${this.MAX_RETRIES} attempts:`, error);
        }
      }
    }, this.POLLING_INTERVAL);

    this.monitoredTransactions.set(txId, interval);
  }

  /**
   * Stops monitoring a transaction
   */
  public stopMonitoring(txId: string): void {
    const interval = this.monitoredTransactions.get(txId);
    if (interval) {
      clearInterval(interval);
      this.monitoredTransactions.delete(txId);
    }
  }

  /**
   * Stops monitoring all transactions
   */
  public stopAll(): void {
    for (const [txId, interval] of this.monitoredTransactions) {
      clearInterval(interval);
    }
    this.monitoredTransactions.clear();
  }

  /**
   * Gets the number of monitored transactions
   */
  public getMonitoredCount(): number {
    return this.monitoredTransactions.size;
  }

  /**
   * Checks if a transaction is being monitored
   */
  public isMonitored(txId: string): boolean {
    return this.monitoredTransactions.has(txId);
  }
} 
import { JungleBusClient } from '@gorillapool/js-junglebus';
import type { JungleBusTransaction, JungleBusSubscription } from './junglebus.types';
import { TRANSACTION_TYPES } from './junglebus.types';
import { DatabaseService } from './databaseService';
import type { BlockchainTransaction } from './types';

export class JungleBusService {
  private client: JungleBusClient;
  private databaseService: DatabaseService;
  private subscriptionId?: number;

  constructor() {
    this.client = new JungleBusClient('https://junglebus.gorillapool.io');
    this.databaseService = new DatabaseService();
  }

  public async subscribe(fromBlock: number) {
    const subscription: JungleBusSubscription = {
      fromBlock,
      outputs: [
        // Listen for ordinal inscriptions
        { 
          type: TRANSACTION_TYPES.OUTPUT_TYPES.ORD,
          filter: TRANSACTION_TYPES.ORD_PREFIX // 'ord' prefix
        },
        // Listen for standard BSV transactions
        { 
          type: TRANSACTION_TYPES.OUTPUT_TYPES.PUBKEYHASH 
        }
      ]
    };

    try {
      this.subscriptionId = await this.client.Subscribe(
        subscription.fromBlock,
        async (tx: JungleBusTransaction) => {
          await this.processTransaction(tx);
        },
        async (status: any) => {
          console.log('Status update:', status);
        },
        async (mempool: any) => {
          console.log('Mempool update:', mempool);
        },
        (error: Error) => {
          console.error('JungleBus subscription error:', error);
        }
      );

      console.log(`JungleBus subscription created with ID: ${this.subscriptionId}`);
    } catch (error) {
      console.error('Error creating JungleBus subscription:', error);
      throw error;
    }
  }

  public async unsubscribe() {
    if (this.subscriptionId) {
      try {
        await this.client.Unsubscribe(this.subscriptionId);
        console.log(`Unsubscribed from JungleBus subscription: ${this.subscriptionId}`);
        this.subscriptionId = undefined;
      } catch (error) {
        console.error('Error unsubscribing:', error);
      }
    }
  }

  private async processTransaction(tx: JungleBusTransaction): Promise<void> {
    try {
      const blockchainTx = this.extractTransactionData(tx);
      if (blockchainTx) {
        await this.databaseService.processTransactions([blockchainTx]);
      }
    } catch (error) {
      console.error('Error processing transaction:', error);
    }
  }

  private extractTransactionData(tx: JungleBusTransaction): BlockchainTransaction | null {
    try {
      // Find ordinal inscription output
      const ordOutput = tx.tx.outputs.find(output => 
        output.s.includes(TRANSACTION_TYPES.ORD_PREFIX)
      );

      if (!ordOutput) return null;

      // Extract MIME type
      const mimeType = this.extractMimeType(ordOutput.s);
      if (!mimeType || !TRANSACTION_TYPES.IMAGE_TYPES.some(type => mimeType.startsWith(type))) {
        return null;
      }

      // Get author address from first input
      const authorAddress = tx.tx.inputs[0]?.a || '';
      if (!authorAddress) {
        console.warn(`No author address found for transaction ${tx.tx.h}`);
        return null;
      }

      const blockchainTx: BlockchainTransaction = {
        txid: tx.tx.h,
        content: ordOutput.s, // Store the full ordinal inscription
        author_address: authorAddress,
        media_type: mimeType,
        blockHeight: tx.block?.i || 0,
        amount: 0, // Set if needed
        locked_until: tx.tx.lock || 0,
        description: `${mimeType.split('/')[1].toUpperCase()} image inscription`
      };

      console.log('Created blockchain transaction:', blockchainTx);
      return blockchainTx;
    } catch (error) {
      console.error('Error extracting transaction data:', error);
      return null;
    }
  }

  private extractMimeType(script: string): string | undefined {
    try {
      const ordIndex = script.indexOf(TRANSACTION_TYPES.ORD_PREFIX);
      if (ordIndex === -1) return undefined;

      // Skip past 'ord' and look for the MIME type
      const afterOrd = script.slice(ordIndex + 6);
      const chunks = afterOrd.match(/.{1,2}/g) || [];
      let mimeType = '';
      
      for (const chunk of chunks) {
        if (chunk === '00') break;
        mimeType += String.fromCharCode(parseInt(chunk, 16));
      }

      mimeType = mimeType
        .replace(/^Q\t?/, '')
        .replace(/^Q(?=[a-z])/, '')
        .replace(/\r?\n/g, '')
        .trim();

      if (TRANSACTION_TYPES.IMAGE_TYPES.some(type => mimeType.startsWith(type))) {
        console.log(`Found image MIME type: ${mimeType}`);
        return mimeType;
      }

      return undefined;
    } catch (error) {
      console.error('Error extracting MIME type:', error);
      return undefined;
    }
  }
} 
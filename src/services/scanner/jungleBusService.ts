import { JungleBusClient } from '@gorillapool/js-junglebus';
import type { JungleBusTransaction, Transaction, ControlMessage, JungleBusSubscription, SubscriptionErrorContext } from './junglebus.types.js';
import { TRANSACTION_TYPES } from './junglebus.types.js';
import { DatabaseService } from './databaseService.js';
import type { BlockchainTransaction } from './types.js';

export class JungleBusService {
  private client: JungleBusClient;
  private databaseService: DatabaseService;
  private subscription?: JungleBusSubscription;

  constructor() {
    this.client = new JungleBusClient('https://junglebus.gorillapool.io');
    this.databaseService = new DatabaseService();
  }

  public async subscribe(fromBlock: number) {
    try {
      this.subscription = await this.client.Subscribe(
        'lockd.app',
        fromBlock,
        (tx: Transaction) => this.processTransaction({ 
          tx, 
          blockHeight: tx.block_height 
        }),
        (status: ControlMessage) => {
          console.log('Status update:', status);
        },
        (error: any) => {
          console.error('JungleBus subscription error:', error?.message || error);
        }
      );

      console.log(`JungleBus subscription created with ID: ${this.subscription.subscriptionID}`);
      this.subscription.Subscribe();
    } catch (error) {
      console.error('Error creating JungleBus subscription:', error);
      throw error;
    }
  }

  public async unsubscribe() {
    if (this.subscription) {
      try {
        this.subscription.UnSubscribe();
        console.log(`Unsubscribed from JungleBus subscription: ${this.subscription.subscriptionID}`);
        this.subscription = undefined;
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
      // Parse the raw transaction
      const rawTx = tx.tx.transaction;
      
      // Check for MAP protocol transaction
      if (rawTx.includes(TRANSACTION_TYPES.MAP.PREFIX)) {
        const mapData = this.extractMapData(rawTx);
        if (mapData && mapData.app === TRANSACTION_TYPES.MAP.APP && mapData.type === TRANSACTION_TYPES.MAP.TYPE) {
          return {
            txid: tx.tx.id,
            content: mapData.content,
            author_address: this.extractAuthorAddress(rawTx),
            media_type: mapData.contentType || 'text/plain',
            blockHeight: tx.blockHeight,
            description: mapData.content
          };
        }
      }

      // Check for ordinal inscription
      if (rawTx.includes(TRANSACTION_TYPES.ORD_PREFIX)) {
        const mimeType = this.extractMimeType(rawTx);
        if (!mimeType || !TRANSACTION_TYPES.IMAGE_TYPES.some(type => mimeType.startsWith(type))) {
          return null;
        }

        const authorAddress = this.extractAuthorAddress(rawTx);
        if (!authorAddress) {
          console.warn(`No author address found for transaction ${tx.tx.id}`);
          return null;
        }

        const blockchainTx: BlockchainTransaction = {
          txid: tx.tx.id,
          content: rawTx,
          author_address: authorAddress,
          media_type: mimeType,
          blockHeight: tx.blockHeight,
          amount: 0,
          description: `${mimeType.split('/')[1].toUpperCase()} image inscription`
        };

        console.log('Created blockchain transaction:', blockchainTx);
        return blockchainTx;
      }

      return null;
    } catch (error) {
      console.error('Error extracting transaction data:', error);
      return null;
    }
  }

  private extractAuthorAddress(rawTx: string): string {
    try {
      // Extract the first input's address from the raw transaction
      // This is a simplified implementation - in production you'd want to use a proper BSV library
      const addressMatch = rawTx.match(/76a914([0-9a-f]{40})88ac/);
      if (addressMatch && addressMatch[1]) {
        return addressMatch[1];
      }
      return '';
    } catch (error) {
      console.error('Error extracting author address:', error);
      return '';
    }
  }

  private extractMapData(rawTx: string): { 
    app: string;
    type: string;
    content: string;
    contentType?: string;
  } | null {
    try {
      // Find MAP prefix
      const mapIndex = rawTx.indexOf(TRANSACTION_TYPES.MAP.PREFIX);
      if (mapIndex === -1) return null;

      // Parse MAP data from raw transaction
      const mapData = rawTx.substring(mapIndex);
      const parts = mapData.split('00'); // Split on null bytes
      
      // Extract MAP fields
      const data: Record<string, string> = {};
      for (let i = 0; i < parts.length - 1; i += 2) {
        const key = this.hexToString(parts[i]);
        const value = this.hexToString(parts[i + 1]);
        if (!key || !value) break;
        data[key] = value;
      }

      if (data.app !== TRANSACTION_TYPES.MAP.APP || data.type !== TRANSACTION_TYPES.MAP.TYPE) {
        return null;
      }

      return {
        app: data.app,
        type: data.type,
        content: data.content || '',
        contentType: data.contentType
      };
    } catch (error) {
      console.error('Error extracting MAP data:', error);
      return null;
    }
  }

  private hexToString(hex: string): string {
    try {
      const bytes = hex.match(/.{2}/g) || [];
      return bytes.map(byte => String.fromCharCode(parseInt(byte, 16))).join('');
    } catch (error) {
      console.error('Error converting hex to string:', error);
      return '';
    }
  }

  private extractMimeType(rawTx: string): string | undefined {
    try {
      const ordIndex = rawTx.indexOf(TRANSACTION_TYPES.ORD_PREFIX);
      if (ordIndex === -1) return undefined;

      // Skip past 'ord' and look for the MIME type
      const afterOrd = rawTx.slice(ordIndex + 6);
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
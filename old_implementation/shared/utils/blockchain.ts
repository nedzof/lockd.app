import axios from 'axios';
import { WalletError, ErrorCodes } from '../utils/errors';

// Cache the current block height to reduce API calls
let cachedBlockHeight: number | null = null;
let lastBlockHeightUpdate: number = 0;
const BLOCK_HEIGHT_CACHE_TTL = 60000; // 1 minute

/**
 * Gets the current block height
 */
export async function getBlockHeight(): Promise<number> {
  // Return cached value if still valid
  const now = Date.now();
  if (cachedBlockHeight !== null && now - lastBlockHeightUpdate < BLOCK_HEIGHT_CACHE_TTL) {
    return cachedBlockHeight;
  }

  try {
    const response = await axios.get('https://api.whatsonchain.com/v1/bsv/main/chain/info');
    
    if (!response.data?.blocks) {
      throw new WalletError(
        'Invalid response from blockchain API',
        ErrorCodes.API_INVALID_RESPONSE
      );
    }

    // Update cache
    cachedBlockHeight = response.data.blocks;
    lastBlockHeightUpdate = now;

    return cachedBlockHeight;
  } catch (error) {
    throw new WalletError(
      'Failed to get current block height',
      ErrorCodes.BLOCK_HEIGHT_FETCH_FAILED,
      undefined,
      error
    );
  }
}

/**
 * Broadcasts a transaction to the network
 */
export async function broadcastTransaction(txHex: string): Promise<string> {
  try {
    const response = await axios.post('https://api.whatsonchain.com/v1/bsv/main/tx/raw', {
      txhex: txHex
    });

    if (!response.data?.txid) {
      throw new WalletError(
        'Invalid response from blockchain API',
        ErrorCodes.API_INVALID_RESPONSE
      );
    }

    return response.data.txid;
  } catch (error) {
    throw new WalletError(
      'Failed to broadcast transaction',
      ErrorCodes.TX_BROADCAST_FAILED,
      undefined,
      error
    );
  }
}

/**
 * Gets transaction details
 */
export async function getTransaction(txId: string): Promise<any> {
  try {
    const response = await axios.get(`https://api.whatsonchain.com/v1/bsv/main/tx/hash/${txId}`);
    
    if (!response.data) {
      throw new WalletError(
        'Invalid response from blockchain API',
        ErrorCodes.API_INVALID_RESPONSE
      );
    }

    return response.data;
  } catch (error) {
    throw new WalletError(
      'Failed to get transaction details',
      ErrorCodes.TX_FETCH_FAILED,
      undefined,
      error
    );
  }
}

/**
 * Gets UTXO details for an address
 */
export async function getAddressUtxos(address: string): Promise<any[]> {
  try {
    const response = await axios.get(`https://api.whatsonchain.com/v1/bsv/main/address/${address}/unspent`);
    
    if (!Array.isArray(response.data)) {
      throw new WalletError(
        'Invalid response from blockchain API',
        ErrorCodes.API_INVALID_RESPONSE
      );
    }

    return response.data;
  } catch (error) {
    throw new WalletError(
      'Failed to get address UTXOs',
      ErrorCodes.UTXO_FETCH_FAILED,
      undefined,
      error
    );
  }
} 
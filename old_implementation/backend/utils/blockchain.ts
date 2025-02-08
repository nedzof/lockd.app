import { bsv } from 'scrypt-ts';
import axios from 'axios';
import { validateBsvAddress, validateTxId } from '../../shared/utils/address';
import {
    BlockchainError,
    ApiError,
    ValidationError,
    ErrorCodes,
    handleApiError
} from '../../shared/utils/errors';

const API_RATE_LIMIT = 3; // requests per second
const API_TIMEOUT = 10000; // 10 seconds
const MAX_RETRIES = 3;

export interface ScriptData {
    satoshis: number;
    script: string;
}

export interface UTXO {
    txid: string;
    vout: number;
    script: string;
    satoshis: number;
}

/**
 * Rate limiter for API calls
 */
class RateLimiter {
    private lastCallTime: number = 0;
    private readonly minInterval: number;

    constructor(requestsPerSecond: number) {
        this.minInterval = 1000 / requestsPerSecond;
    }

    async wait(): Promise<void> {
        const now = Date.now();
        const timeSinceLastCall = now - this.lastCallTime;
        
        if (timeSinceLastCall < this.minInterval) {
            await new Promise(resolve => setTimeout(resolve, this.minInterval - timeSinceLastCall));
        }
        
        this.lastCallTime = Date.now();
    }
}

const rateLimiter = new RateLimiter(API_RATE_LIMIT);

/**
 * Makes an API call with retries and rate limiting
 */
async function makeApiCall<T>(url: string, method: 'get' | 'post' = 'get', data?: any): Promise<T> {
    let lastError: Error | null = null;
    
    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            await rateLimiter.wait();
            
            const response = await axios({
                method,
                url,
                data,
                timeout: API_TIMEOUT
            });
            
            return response.data;
        } catch (error: any) {
            lastError = error;
            
            // Handle rate limiting explicitly
            if (error.response?.status === 429) {
                const retryAfter = parseInt(error.response.headers['retry-after'] || '1');
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                continue;
            }
            
            // Exponential backoff for other errors
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
    }
    
    throw handleApiError(lastError || new Error('API call failed after retries'));
}

/**
 * Gets UTXO data with validation
 */
export async function getUtxoData(txid: string): Promise<ScriptData> {
    if (!validateTxId(txid)) {
        throw new ValidationError(
            'Invalid transaction ID format',
            ErrorCodes.TX_VALIDATION_FAILED,
            'txid',
            txid
        );
    }

    const url = `https://api.whatsonchain.com/v1/bsv/main/tx/${txid}/out/0`;
    
    try {
        const data = await makeApiCall<any>(url);
        
        if (!data.value || !data.scriptPubKey?.hex) {
            throw new BlockchainError(
                'Invalid UTXO data format',
                ErrorCodes.UTXO_FETCH_FAILED,
                undefined,
                data
            );
        }

        return {
            satoshis: data.value,
            script: data.scriptPubKey.hex
        };
    } catch (error: any) {
        if (error instanceof BlockchainError || error instanceof ValidationError) {
            throw error;
        }
        throw handleApiError(error);
    }
}

/**
 * Broadcasts a transaction with validation
 */
export async function broadcastTx(txHex: string): Promise<string> {
    if (!txHex || typeof txHex !== 'string') {
        throw new ValidationError(
            'Invalid transaction hex',
            ErrorCodes.TX_VALIDATION_FAILED,
            'txHex',
            txHex
        );
    }

    try {
        // Validate transaction format
        const tx = new bsv.Transaction(txHex);
        if (!tx.inputs.length || !tx.outputs.length) {
            throw new ValidationError(
                'Invalid transaction format',
                ErrorCodes.TX_VALIDATION_FAILED,
                'transaction',
                'Missing inputs or outputs'
            );
        }
    } catch (error) {
        throw new ValidationError(
            'Invalid transaction hex format',
            ErrorCodes.TX_VALIDATION_FAILED,
            'txHex',
            error instanceof Error ? error.message : 'Unknown error'
        );
    }

    const url = 'https://api.whatsonchain.com/v1/bsv/main/tx/raw';
    
    try {
        return await makeApiCall<string>(url, 'post', { txhex: txHex });
    } catch (error: any) {
        throw handleApiError(error);
    }
}

/**
 * Gets address UTXOs with validation
 */
export async function getAddressUtxos(address: string): Promise<UTXO[]> {
    if (!validateBsvAddress(address, false)) {
        throw new ValidationError(
            'Invalid BSV address',
            ErrorCodes.INVALID_ADDRESS,
            'address',
            address
        );
    }

    const url = `https://api.whatsonchain.com/v1/bsv/main/address/${address}/unspent`;
    
    try {
        const data = await makeApiCall<any[]>(url);
        
        return data.map((utxo, index) => {
            if (!validateTxId(utxo.tx_hash) || 
                typeof utxo.tx_pos !== 'number' || 
                !utxo.script_pub_key ||
                typeof utxo.value !== 'number') {
                throw new BlockchainError(
                    'Invalid UTXO format in response',
                    ErrorCodes.UTXO_FETCH_FAILED,
                    undefined,
                    { utxo, index }
                );
            }

            return {
                txid: utxo.tx_hash,
                vout: utxo.tx_pos,
                script: utxo.script_pub_key,
                satoshis: utxo.value
            };
        });
    } catch (error: any) {
        if (error instanceof BlockchainError || error instanceof ValidationError) {
            throw error;
        }
        throw handleApiError(error);
    }
}

/**
 * Gets current block height with validation and caching
 */
export async function getCurrentBlockHeight(): Promise<number> {
    const url = 'https://api.whatsonchain.com/v1/bsv/main/chain/info';
    
    try {
        const data = await makeApiCall<any>(url);
        
        if (typeof data.blocks !== 'number' || data.blocks < 0) {
            throw new BlockchainError(
                'Invalid block height format',
                ErrorCodes.BLOCK_HEIGHT_FETCH_FAILED,
                undefined,
                data
            );
        }

        return data.blocks;
    } catch (error: any) {
        if (error instanceof BlockchainError) {
            throw error;
        }
        throw handleApiError(error);
    }
}

/**
 * Converts hex to integer with validation
 */
export function hex2Int(hex: string): number {
    if (typeof hex !== 'string') {
        throw new ValidationError(
            'Input must be a string',
            ErrorCodes.TX_VALIDATION_FAILED,
            'hex',
            typeof hex
        );
    }

    if (hex.startsWith('0x')) {
        hex = hex.slice(2);
    }

    if (!/^[0-9a-fA-F]+$/.test(hex)) {
        throw new ValidationError(
            'Invalid hex format',
            ErrorCodes.TX_VALIDATION_FAILED,
            'hex',
            hex
        );
    }

    const num = parseInt(hex, 16);
    if (isNaN(num)) {
        throw new ValidationError(
            'Failed to parse hex',
            ErrorCodes.TX_VALIDATION_FAILED,
            'hex',
            hex
        );
    }

    return num;
} 
/**
 * Transaction Fetcher
 * 
 * Handles fetching transaction data from the JungleBus API
 */

import axios from 'axios';
import logger from '../logger.js';
import { CONFIG } from '../config.js';

export class TxFetcher {
  private baseUrl: string;
  private apiKey?: string;
  
  constructor() {
    this.baseUrl = CONFIG.JUNGLEBUS_URL;
    this.apiKey = CONFIG.JUNGLEBUS_API_KEY;
  }
  
  /**
   * Fetches transaction data from JungleBus API
   */
  async fetch_transaction(txId: string): Promise<any> {
    try {
      const url = `${this.baseUrl}/v1/transaction/get/${txId}`;
      const headers: Record<string, string> = {};
      
      if (this.apiKey) {
        headers['Authorization'] = this.apiKey;
      }
      
      const response = await axios.get(url, { headers });
      return response.data;
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        logger.warn(`Transaction ${txId} not found in API`);
        return null;
      }
      
      logger.error(`Failed to fetch transaction ${txId}: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Extracts outputs from raw transaction data
   */
  extract_outputs_from_tx_data(txData: any): string[] {
    const outputs: string[] = [];
    
    if (txData?.tx?.out && Array.isArray(txData.tx.out)) {
      txData.tx.out.forEach((out: any) => {
        if (out.s) outputs.push(out.s);
        else if (out.script) outputs.push(out.script);
      });
    } else if (txData?.outputs && Array.isArray(txData.outputs)) {
      outputs.push(...txData.outputs);
    } else if (txData?.out && Array.isArray(txData.out)) {
      txData.out.forEach((out: any) => {
        if (typeof out === 'string') outputs.push(out);
        else if (out.s) outputs.push(out.s);
        else if (out.script) outputs.push(out.script);
      });
    }
    
    return outputs;
  }
}

// Export singleton instance
export const tx_fetcher = new TxFetcher(); 
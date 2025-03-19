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
    // Use JB_API_KEY if it exists in CONFIG, otherwise undefined
    this.apiKey = (CONFIG as any).JB_API_KEY;
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
   * This function is crucial for processing JungleBus transaction data
   */
  extract_outputs_from_tx_data(txData: any): any[] {
    const outputs: any[] = [];
    
    try {
      // First check if we have a JungleBus transaction format with data array
      if (txData?.data && Array.isArray(txData.data)) {
        // This is a JungleBus transaction, return the whole transaction as an output
        // to process its data array in the parser
        outputs.push(txData);
        logger.debug(`Found JungleBus transaction with data array of ${txData.data.length} items`);
        return outputs;
      }
      
      // Try different known transaction formats
      if (txData?.tx?.out && Array.isArray(txData.tx.out)) {
        // bsv-js tx format
        txData.tx.out.forEach((out: any) => {
          if (out.s) outputs.push(out.s);
          else if (out.script) outputs.push(out.script);
        });
      } else if (txData?.outputs && Array.isArray(txData.outputs)) {
        // If outputs is an array of strings
        if (typeof txData.outputs[0] === 'string') {
          outputs.push(...txData.outputs);
        } 
        // If outputs is an array of objects (like in JungleBus)
        else if (typeof txData.outputs[0] === 'object') {
          txData.outputs.forEach((output: any) => {
            if (output.script) outputs.push(output.script);
            else if (output.s) outputs.push(output.s);
          });
        }
      } else if (txData?.out && Array.isArray(txData.out)) {
        txData.out.forEach((out: any) => {
          if (typeof out === 'string') outputs.push(out);
          else if (out.s) outputs.push(out.s);
          else if (out.script) outputs.push(out.script);
        });
      }
      
      // If no outputs found but we have data array (different format)
      if (outputs.length === 0 && txData?.output_types && txData?.data) {
        logger.debug(`Found alternative JungleBus format with output_types array`);
        // Return the whole transaction to handle in the parser
        outputs.push(txData);
      }
      
      // Log a warning if we couldn't extract any outputs
      if (outputs.length === 0) {
        logger.warn(`Could not extract outputs from transaction data: ${JSON.stringify(txData).substring(0, 200)}...`);
      }
      
      return outputs;
    } catch (error) {
      logger.error(`Error extracting outputs: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }
}

// Export singleton instance
export const tx_fetcher = new TxFetcher(); 
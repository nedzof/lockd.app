/**
 * Transaction Parser
 * 
 * Main parser class that orchestrates the transaction parsing workflow
 */

import { BMAP } from 'bmapjs';
import logger from '../logger.js';
import { tx_fetcher } from './tx_fetcher.js';
import { extract_content_from_op_return } from './content_extractor.js';
import { extract_key_value_pairs, build_metadata } from './metadata_builder.js';
import { extract_timestamp } from './utils/timestamp_utils.js';

// Import types
import type { LockProtocolData } from '../../shared/types.js';

// Type Definitions
export interface TransactionOutput {
  hex: string;
  content?: string;
  metadata: LockProtocolData;
  type?: string;
  isValid: boolean;
}

export interface ParsedTransaction {
  txId: string;
  outputs: TransactionOutput[];
  timestamp?: string;
  blockHeight?: number;
}

/**
 * Transaction Parser class
 * Handles parsing Bitcoin transactions
 */
export class TxParser {
  protected bmap: BMAP;
  
  constructor() {
    this.bmap = new BMAP();
    logger.info('Transaction Parser initialized with bmapjs');
  }
  
  /**
   * Checks if a transaction output contains lockd.app data
   */
  is_valid_output(output: any): boolean {
    if (!output) return false;
    
    // Get the hex script
    const outputHex = typeof output === 'string' ? output : output.s || output.script || '';
    
    if (!outputHex || outputHex.length < 10) return false;
    
    const lowerOutput = outputHex.toLowerCase();
    
    // Skip standard P2PKH payment outputs without additional data
    if (lowerOutput.startsWith('76a914') && lowerOutput.endsWith('88ac') && lowerOutput.length < 50) {
      return false;
    }
    
    // Check specifically for lockd.app pattern
    return lowerOutput.includes('6c6f636b642e617070'); // 'lockd.app' in hex
  }
  
  /**
   * Parse a script output
   */
  async parse_output(outputHex: string): Promise<{
    content?: string;
    type?: string;
    metadata: LockProtocolData;
  }> {
    try {
      const cleanHex = outputHex.toLowerCase();
      let metadata = {} as LockProtocolData;
      let content = '';
      let type = undefined;
      
      // Extract data from OP_RETURN
      if (cleanHex.includes('6a')) { // OP_RETURN opcode is 0x6a
        // Find position of OP_RETURN
        const opReturnPos = cleanHex.indexOf('6a');
        if (opReturnPos >= 0) {
          // Extract everything after OP_RETURN
          const opReturnData = cleanHex.substring(opReturnPos + 2);
          
          // Check for lockd.app signature
          if (opReturnData.includes('6c6f636b642e617070')) { // 'lockd.app' in hex
            type = 'lockd';
            
            // Extract all key-value pairs
            const keyValuePairs = extract_key_value_pairs(opReturnData);
            
            // Extract content
            content = extract_content_from_op_return(opReturnData);
            
            // Build metadata object
            metadata = build_metadata(keyValuePairs, content);
          }
        }
      }
      
      return {
        content,
        type,
        metadata
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error parsing output: ${errorMessage}`);
      return { metadata: {} as LockProtocolData };
    }
  }
  
  /**
   * Parse transaction data
   */
  async parse_transaction_data(txData: any): Promise<ParsedTransaction> {
    try {
      const txId = txData?.tx?.h || txData?.hash || txData?.id || txData?.tx_id;
      
      if (!txId) {
        throw new Error('Transaction ID not found in transaction data');
      }
      
      // Extract outputs from transaction data
      const txOutputs = tx_fetcher.extract_outputs_from_tx_data(txData);
      const outputs: TransactionOutput[] = [];
      
      // Process each output
      for (const output of txOutputs) {
        // Check if it's a valid lockd.app output
        const isValid = this.is_valid_output(output);
        
        // Process only valid outputs
        if (isValid) {
          try {
            // Parse output with our extraction methods
            const parsed = await this.parse_output(output);
            outputs.push({
              hex: output,
              content: parsed.content,
              metadata: parsed.metadata,
              type: parsed.type,
              isValid: true
            });
          } catch (parseError: unknown) {
            const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
            logger.error(`Failed to parse output: ${errorMessage}`);
            outputs.push({
              hex: output,
              metadata: {} as LockProtocolData,
              isValid: false
            });
          }
        } else {
          // Add invalid output to the list
          outputs.push({
            hex: output,
            metadata: {} as LockProtocolData,
            isValid: false
          });
        }
      }
      
      return {
        txId,
        outputs,
        blockHeight: txData.block_height || txData.height,
        timestamp: extract_timestamp(txData)
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to parse transaction data: ${errorMessage}`);
      return {
        txId: txData?.tx?.h || 'unknown',
        outputs: [],
        timestamp: new Date().toISOString()
      };
    }
  }
  
  /**
   * Parse a single transaction by ID
   */
  async parse_transaction(txId: string): Promise<ParsedTransaction> {
    try {
      const txData = await tx_fetcher.fetch_transaction(txId);
      
      if (!txData) {
        return {
          txId,
          outputs: [],
          timestamp: new Date().toISOString()
        };
      }
      
      return await this.parse_transaction_data(txData);
    } catch (error: any) {
      logger.error(`Failed to parse transaction ${txId}: ${error.message}`);
      return {
        txId,
        outputs: [],
        timestamp: new Date().toISOString()
      };
    }
  }
  
  /**
   * Process multiple transactions sequentially
   */
  async parse_transactions(txIds: string[]): Promise<ParsedTransaction[]> {
    if (txIds.length === 0) return [];
    
    logger.info(`Processing ${txIds.length} transactions`);
    
    const results: ParsedTransaction[] = [];
    for (const txId of txIds) {
      try {
        results.push(await this.parse_transaction(txId));
      } catch (error: any) {
        logger.error(`Error processing transaction ${txId}: ${error.message}`);
        results.push({
          txId,
          outputs: [],
          timestamp: new Date().toISOString()
        });
      }
    }
    return results;
  }
}

// Export singleton instance
export const tx_parser = new TxParser(); 
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
  _optionIndex?: number; // Add custom field for option index
  _authorAddress?: string; // Add custom field for author address
}

export interface ParsedTransaction {
  txId: string;
  outputs: TransactionOutput[];
  timestamp?: string;
  blockHeight?: number;
  rawTx?: string; // Raw transaction data in base64 format
  authorAddress?: string; // Author address from transaction data
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
    
    // Check if we have a string (hex) or an object
    if (typeof output === 'string') {
      // Get the hex script
      const outputHex = output;
      
      if (!outputHex || outputHex.length < 10) return false;
      
      const lowerOutput = outputHex.toLowerCase();
      
      // Skip standard P2PKH payment outputs without additional data
      if (lowerOutput.startsWith('76a914') && lowerOutput.endsWith('88ac') && lowerOutput.length < 50) {
        return false;
      }
      
      // Check specifically for lockd.app pattern in hex
      return lowerOutput.includes('6c6f636b642e617070'); // 'lockd.app' in hex
    } 
    // For object type output (from JungleBus)
    else if (typeof output === 'object') {
      // If we have the 'data' property (JungleBus format), check it directly
      if (output.data && Array.isArray(output.data)) {
        // Look for app=lockd.app in the data array
        return output.data.some((item: string) => 
          typeof item === 'string' && item.toLowerCase().includes('app=lockd.app')
        );
      }
      
      // Try to extract script hex
      const outputHex = output.s || output.script || '';
      
      if (!outputHex || outputHex.length < 10) return false;
      
      const lowerOutput = outputHex.toLowerCase();
      
      // Skip standard P2PKH payment outputs without additional data
      if (lowerOutput.startsWith('76a914') && lowerOutput.endsWith('88ac') && lowerOutput.length < 50) {
        return false;
      }
      
      // Check specifically for lockd.app pattern in hex
      return lowerOutput.includes('6c6f636b642e617070'); // 'lockd.app' in hex
    }
    
    return false;
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
            
            // Check for specific vote markers in raw hex
            const isVoteQuestion = opReturnData.includes('76657291756573') // 'vote_ques' in hex
                                || opReturnData.includes('69735f766f74653d74727565') // 'is_vote=true' in hex
                                || opReturnData.includes('766f74655f64617461') // 'vote_data' in hex
                                || opReturnData.includes('6f7074696f6e30'); // 'option0' in hex
            
            if (isVoteQuestion) {
              logger.debug('Vote-specific markers detected in transaction output');
            }
            
            // Build metadata object
            metadata = build_metadata(keyValuePairs, content);
            
            // If we have vote_data or direct option fields, double check that is_vote is set
            if ((keyValuePairs.vote_data || Object.keys(keyValuePairs).some(k => k.startsWith('option'))) 
                && metadata.is_vote !== true) {
              logger.debug('Setting is_vote=true based on vote_data or option fields presence');
              metadata.is_vote = true;
            }
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
   * Detects if the transaction is a vote with embedded vote options
   * We now exclusively use single-output votes with embedded options
   */
  detect_vote_transaction(outputs: TransactionOutput[]): void {
    // Check for a single output with embedded vote data
    if (outputs.length >= 1 && outputs[0].isValid) {
      const output = outputs[0];
      
      // Check for vote metadata
      if (output.metadata?.is_vote === true) {
        logger.debug('Found vote transaction with embedded options');
        
        // Check for vote_options in custom metadata
        const customMeta = (output.metadata as any)._custom_metadata || {};
        if (customMeta.vote_option_objects && Array.isArray(customMeta.vote_option_objects)) {
          // This is a vote with options embedded in the metadata
          logger.debug(`Vote with ${customMeta.vote_option_objects.length} embedded options`);
          
          // Make sure total_options is set if available
          if (!output.metadata.total_options && customMeta.vote_option_objects.length > 0) {
            output.metadata.total_options = customMeta.vote_option_objects.length;
          }
        } else {
          // This is a vote without embedded options in custom metadata
          // This might be using the direct option0, option1, etc. fields
          if (output.metadata.vote_options && Array.isArray(output.metadata.vote_options)) {
            logger.debug(`Vote with ${output.metadata.vote_options.length} vote_options`);
            
            // Make sure total_options is set
            if (!output.metadata.total_options) {
              output.metadata.total_options = output.metadata.vote_options.length;
            }
          }
        }
      }
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
      
      // Extract author address
      const authorAddress = this.extract_author_address(txData);
      
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
            
            // Create the output object
            const outputObj: TransactionOutput = {
              hex: output,
              content: parsed.content,
              metadata: parsed.metadata,
              type: parsed.type,
              isValid: true
            };
            
            // Add author address to metadata if available
            if (authorAddress) {
              outputObj._authorAddress = authorAddress;
            }
            
            outputs.push(outputObj);
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
      
      // Check if this is a multi-part vote transaction
      this.detect_vote_transaction(outputs);
      
      return {
        txId,
        outputs,
        blockHeight: txData.block_height || txData.height,
        timestamp: extract_timestamp(txData),
        rawTx: txData.transaction || undefined,
        authorAddress
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
  
  /**
   * Extracts author address from transaction data
   */
  extract_author_address(txData: any): string | undefined {
    try {
      // First, check for addresses array
      if (txData.addresses && Array.isArray(txData.addresses) && txData.addresses.length > 0) {
        return txData.addresses[0];
      }
      
      // Try to get from inputs if available
      if (txData.inputs && Array.isArray(txData.inputs) && txData.inputs.length > 0) {
        const input = txData.inputs[0];
        if (input && typeof input === 'object') {
          // Check different possible formats for input addresses
          if (input.address) return input.address;
          if (input.addresses && Array.isArray(input.addresses) && input.addresses.length > 0) {
            return input.addresses[0];
          }
        }
      }
      
      // Try to extract from BMAP parser if available
      if (txData.transaction) {
        try {
          // Use appropriate BMAP methods based on transaction format
          // We'll skip this for now since method naming may vary
          // This is a fallback approach only
          logger.debug('Using raw transaction analysis for address extraction');
          
          // Direct parsing of P2PKH output scripts for addresses
          if (txData.outputs && Array.isArray(txData.outputs)) {
            for (const output of txData.outputs) {
              // Look for a P2PKH pattern with OP_DUP OP_HASH160 <pubKeyHash> OP_EQUALVERIFY OP_CHECKSIG
              // In hex, this looks like: 76a914<pubKeyHash>88ac
              if (typeof output === 'string' && output.startsWith('76a914') && output.endsWith('88ac')) {
                const pubKeyHash = output.substring(6, output.length - 4);
                logger.debug(`Found potential P2PKH output with pubKeyHash: ${pubKeyHash}`);
                // We'd need a proper address encoder here, but we'll leave this as a placeholder
                // since the addresses array should already provide this info
              }
            }
          }
        } catch (error) {
          logger.debug(`Failed to extract address from transaction: ${error}`);
        }
      }
      
      return undefined;
    } catch (error) {
      logger.debug(`Error extracting author address: ${error}`);
      return undefined;
    }
  }
}

// Export singleton instance
export const tx_parser = new TxParser(); 
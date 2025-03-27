/**
 * Transaction Parser
 * 
 * Simplified parser class that processes JSON ordinal inscriptions
 */

import { BMAP } from 'bmapjs';
import logger from '../logger.js';
import { tx_fetcher } from './tx_fetcher.js';
import { extract_timestamp } from './utils/timestamp_utils.js';
import { parseOrdinalInscription, convertOrdinalToLockProtocolData, isJsonOrdinalInscription } from './ordinal_parser.js';

// Import types
import type { LockProtocolData } from '../../shared/types.js';

// Type Definitions
export interface TransactionOutput {
  hex: string;
  content?: string;
  metadata: LockProtocolData;
  type?: string;
  isValid: boolean;
  _optionIndex?: number;
  _authorAddress?: string;
}

export interface ParsedTransaction {
  txId: string;
  outputs: TransactionOutput[];
  timestamp?: string;
  blockHeight?: number;
  rawTx?: string;
  authorAddress?: string;
}

/**
 * Transaction Parser class
 * Handles parsing Bitcoin transactions with JSON ordinal inscriptions
 */
export class TxParser {
  protected bmap: BMAP;
  
  constructor() {
    this.bmap = new BMAP();
    logger.info('Transaction Parser initialized with bmapjs for JSON ordinal format');
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
   * Parse a script output for JSON ordinal inscription
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
          
          // Decode hex to UTF-8 text to check for JSON content
          const decodedText = this.decodeHexToUtf8(opReturnData);
          
          // Check if text contains a valid JSON structure
          if (isJsonOrdinalInscription(decodedText)) {
            // Parse the JSON content as an ordinal inscription
            content = decodedText;
            const ordinalInscription = parseOrdinalInscription(content);
            
            if (ordinalInscription) {
              // Convert the ordinal inscription to our internal format
              metadata = convertOrdinalToLockProtocolData(ordinalInscription);
              type = 'lockd';
              logger.debug('Parsed JSON ordinal inscription successfully');
              return { content, type, metadata };
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
   * Decode hex string to UTF-8 text
   */
  private decodeHexToUtf8(hex: string): string {
    try {
      // Remove any non-hex characters
      const cleanHex = hex.replace(/[^0-9a-f]/gi, '');
      
      // Convert hex to bytes
      const bytes = [];
      for (let i = 0; i < cleanHex.length; i += 2) {
        bytes.push(parseInt(cleanHex.substring(i, i + 2), 16));
      }
      
      // Convert bytes to UTF-8 string
      return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
    } catch (error) {
      logger.error(`Error decoding hex to UTF-8: ${error}`);
      return '';
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
              isValid: !!parsed.type // Only valid if type is set
            };
            
            // Add author address to metadata if available
            if (authorAddress) {
              outputObj._authorAddress = authorAddress;
              
              // Also set author_address in metadata if not already set
              if (!(outputObj.metadata as any).author_address) {
                (outputObj.metadata as any).author_address = authorAddress;
              }
            }
            
            // Only add valid JSON ordinal inscriptions
            if (parsed.type) {
              outputs.push(outputObj);
            }
          } catch (parseError: unknown) {
            const errorMessage = parseError instanceof Error ? parseError.message : String(parseError);
            logger.error(`Failed to parse output: ${errorMessage}`);
            // Skip invalid outputs instead of adding them as invalid
          }
        }
      }
      
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
      
      return undefined;
    } catch (error) {
      logger.debug(`Error extracting author address: ${error}`);
      return undefined;
    }
  }
}

// Export singleton instance
export const tx_parser = new TxParser(); 
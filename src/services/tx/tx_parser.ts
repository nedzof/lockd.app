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
  rawTx?: string; // Raw transaction data in base64 format
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
   * Detects if the transaction is a vote with multiple outputs
   * where one is the question and others are vote options
   */
  detect_vote_transaction(outputs: TransactionOutput[]): void {
    // Only process if we have multiple valid outputs
    if (outputs.length <= 1) return;
    
    try {
      // Check if any outputs already have is_vote = true
      const explicitVoteOutputs = outputs.filter(o => o.isValid && o.metadata?.is_vote === true);
      
      // If at least one output is explicitly marked as a vote, check if it's a multi-part vote
      if (explicitVoteOutputs.length > 0) {
        logger.debug(`Found ${explicitVoteOutputs.length} outputs explicitly marked as votes`);
        
        // Find the question output (might have total_options set or be the first output)
        const questionOutput = explicitVoteOutputs.find(o => o.metadata?.total_options) || explicitVoteOutputs[0];
        
        // Ensure all outputs in this transaction are marked as votes
        for (const output of outputs.filter(o => o.isValid)) {
          output.metadata.is_vote = true;
        }
        
        // Propagate post_id from question to all options if they don't have it
        if (questionOutput.metadata?.post_id) {
          const postId = questionOutput.metadata.post_id;
          for (const output of outputs.filter(o => o.isValid && !o.metadata.post_id)) {
            output.metadata.post_id = postId;
          }
        }
        
        // Propagate options_hash if present
        const optionsHash = questionOutput.metadata?.options_hash;
        if (optionsHash) {
          for (const output of outputs.filter(o => o.isValid)) {
            output.metadata.options_hash = optionsHash;
          }
        }
        
        // Find all option outputs
        const optionOutputs = outputs.filter(o => 
          o.isValid && 
          o !== questionOutput && 
          (o.metadata?.option_index !== undefined || o.metadata?.is_vote === true)
        );
        
        // Assign option indices if not already set
        optionOutputs.forEach((output, index) => {
          if (output.metadata.option_index === undefined) {
            output.metadata.option_index = index + 1;
          }
        });
        
        // Set total_options on question output if not already set
        if (!questionOutput.metadata.total_options && optionOutputs.length > 0) {
          questionOutput.metadata.total_options = optionOutputs.length;
        }
        
        logger.debug(`Vote transaction with ${optionOutputs.length} options processed`);
        return;
      }
      
      // Check for outputs with consistent post_id - this is our traditional approach
      // Get all unique post_ids
      const postIdsMap = new Map<string, number>();
      
      // Count occurrences of each post_id
      for (const output of outputs.filter(o => o.isValid && o.metadata?.post_id)) {
        const postId = output.metadata.post_id;
        postIdsMap.set(postId, (postIdsMap.get(postId) || 0) + 1);
      }
      
      // If any post_id appears multiple times, it might be a vote
      for (const [postId, count] of postIdsMap.entries()) {
        if (count > 1 || outputs.length >= 3) { // Multi-part vote with shared post_id or many outputs
          const relatedOutputs = outputs.filter(
            o => o.isValid && (!o.metadata.post_id || o.metadata.post_id === postId)
          );
          
          if (relatedOutputs.length >= 2) { // Enough to be a vote
            // Mark all related outputs as part of a vote
            for (const output of relatedOutputs) {
              output.metadata.is_vote = true;
              
              // Set post_id for outputs that don't have it
              if (!output.metadata.post_id) {
                output.metadata.post_id = postId;
              }
            }
            
            // Assume first output is the question
            const questionOutput = relatedOutputs[0];
            const optionOutputs = relatedOutputs.slice(1);
            
            // Set option indices if not already set
            optionOutputs.forEach((output, index) => {
              if (output.metadata.option_index === undefined) {
                output.metadata.option_index = index + 1;
              }
            });
            
            // Set total_options on question
            if (!questionOutput.metadata.total_options) {
              questionOutput.metadata.total_options = optionOutputs.length;
            }
            
            // Find an options hash to propagate
            const optionsHash = relatedOutputs.find(o => o.metadata?.options_hash)?.metadata?.options_hash;
            if (optionsHash) {
              for (const output of relatedOutputs) {
                output.metadata.options_hash = optionsHash;
              }
            }
            
            logger.debug(`Vote transaction detected with ${optionOutputs.length} options for post_id ${postId}`);
            break;
          }
        }
      }
      
      // If no vote was detected with post_id, check if multiple outputs might be a vote
      // by looking at their structure (one question followed by multiple options)
      if (!outputs.some(o => o.isValid && o.metadata?.is_vote === true) && outputs.length >= 3) {
        const validOutputs = outputs.filter(o => o.isValid);
        if (validOutputs.length >= 3) { // Enough outputs to likely be a vote
          // Mark all valid outputs as vote
          for (const output of validOutputs) {
            output.metadata.is_vote = true;
          }
          
          // Assume first output is the question
          const questionOutput = validOutputs[0];
          const optionOutputs = validOutputs.slice(1);
          
          // Set option indices
          optionOutputs.forEach((output, index) => {
            if (output.metadata.option_index === undefined) {
              output.metadata.option_index = index + 1;
            }
          });
          
          // Set total_options on question
          if (!questionOutput.metadata.total_options) {
            questionOutput.metadata.total_options = optionOutputs.length;
          }
          
          // Find an options hash to propagate
          const optionsHash = validOutputs.find(o => o.metadata?.options_hash)?.metadata?.options_hash;
          if (optionsHash) {
            for (const output of validOutputs) {
              output.metadata.options_hash = optionsHash;
            }
          }
          
          // If a post_id exists anywhere, propagate it
          const postId = validOutputs.find(o => o.metadata?.post_id)?.metadata?.post_id;
          if (postId) {
            for (const output of validOutputs) {
              if (!output.metadata.post_id) {
                output.metadata.post_id = postId;
              }
            }
          }
          
          logger.debug(`Vote transaction detected with ${optionOutputs.length} options based on output structure`);
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error detecting vote transaction: ${errorMessage}`);
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
      
      // Check if this is a multi-part vote transaction
      this.detect_vote_transaction(outputs);
      
      return {
        txId,
        outputs,
        blockHeight: txData.block_height || txData.height,
        timestamp: extract_timestamp(txData),
        rawTx: txData.transaction || undefined
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
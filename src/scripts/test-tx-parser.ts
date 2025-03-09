/**
 * Test script for the transaction parser
 * 
 * This script tests the transaction parser by parsing sample transactions
 * and displaying formatted UTF-8 strings with metadata
 */

import { tx_parser } from '../services/tx_parser.js';
import logger from '../services/logger.js';
import chalk from 'chalk';

// Define interface for transaction output to match the parser's interface
interface TransactionOutput {
  hex: string;
  decodedUtf8?: string;
  formattedText?: string;
  metadata?: Record<string, any>;
  type?: string;
  isValid: boolean;
  data?: Record<string, any>;
}

// Sample transaction IDs for testing - known BSV transactions containing data
const TX_ID_1 = 'a7cc804be0a15810e2fa0f97d7c15305b1facb7af1a876549b41af1f116fe053'; // Vote transaction
const TX_ID_2 = '8ef0d46c7cef8c92a473f82f8a6f78f9a8a4d6f82e41272b4fa78ae10ef8b82b'; // Simple post

/**
 * Displays formatted transaction output in a clean, readable way
 * @param output Transaction output object
 * @param index Output index
 */
function displayFormattedOutput(output: TransactionOutput, index: number) {
  if (!output.isValid) {
    return; // Skip invalid outputs entirely
  }
  
  console.log(chalk.cyan(`\n------- OUTPUT ${index + 1} -------`));
  
  // Check for vote-related content
  const isVoteQuestion = output.metadata?.is_vote === true && !output.metadata?.option_index;
  const isVoteOption = output.metadata?.is_vote === true && output.metadata?.option_index !== undefined;
  
  // Display content
  if (output.metadata?.direct_content) {
    // If we have direct content extracted from the hex, prioritize it
    if (isVoteQuestion) {
      console.log(chalk.magenta('📊 VOTE QUESTION: ') + chalk.white(output.metadata.direct_content));
    } 
    else if (isVoteOption) {
      console.log(chalk.magenta(`⚪ OPTION ${output.metadata.option_index}: `) + chalk.white(output.metadata.direct_content));
    }
    else {
      console.log(chalk.green('📝 CONTENT: ') + chalk.white(output.metadata.direct_content));
    }
  }
  else if (output.metadata && output.metadata.content) {
    if (isVoteQuestion) {
      console.log(chalk.magenta('📊 VOTE QUESTION: ') + chalk.white(output.metadata.content));
    } 
    else if (isVoteOption) {
      console.log(chalk.magenta(`⚪ OPTION ${output.metadata.option_index}: `) + chalk.white(output.metadata.content));
    }
    else {
      console.log(chalk.green('📝 CONTENT: ') + chalk.white(output.metadata.content));
    }
  } else if (output.formattedText) {
    console.log(chalk.white(output.formattedText));
  } else if (output.decodedUtf8) {
    const truncatedContent = output.decodedUtf8.length > 500 ? 
      `${output.decodedUtf8.slice(0, 500)}...` : output.decodedUtf8;
    console.log(chalk.gray(`Raw decoded content:\n${truncatedContent}`));
  }
  
  // Display metadata if available
  if (output.metadata && Object.keys(output.metadata).length > 0) {
    // Filter out content-related fields from metadata display if already shown
    const metadataEntries = Object.entries(output.metadata)
      .filter(([key]) => 
        !['content', 'content_type', 'direct_content'].includes(key) || 
        !(output.metadata && (output.metadata.content || output.metadata.direct_content))
      )
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB)); // Sort keys alphabetically
    
    if (metadataEntries.length > 0) {
      console.log(chalk.yellow('\nExtracted Metadata:'));
      
      // Format metadata fields with proper indentation and color
      for (const [key, value] of metadataEntries) {
        const valueStr = typeof value === 'object' ? JSON.stringify(value) : value;
        console.log(chalk.yellow(`  ${key}: `) + chalk.white(valueStr));
      }
    }
  }
  
  // Display output type if available
  if (output.type) {
    console.log(chalk.blue(`\nOutput type: ${output.type}`));
  }
}

async function testParser() {
  console.log(chalk.green('Starting transaction parser test'));
  
  try {
    // Test first transaction (vote transaction)
    console.log(chalk.green('\n===== TESTING FIRST TRANSACTION (VOTE) ====='));
    console.log(chalk.green(`Parsing transaction: ${TX_ID_1}`));
    const parsedTx1 = await tx_parser.parse_transaction(TX_ID_1);
    
    console.log(chalk.green(`Transaction parsed successfully with ${parsedTx1.outputs.length} outputs`));
    const validOutputs1 = parsedTx1.outputs.filter(o => o.isValid);
    console.log(chalk.green(`Found ${validOutputs1.length} valid outputs`));
    
    if (parsedTx1.timestamp) {
      console.log(chalk.green(`Transaction timestamp: ${parsedTx1.timestamp}`));
    }
    
    // Display each valid output with formatted text
    validOutputs1.forEach((output, index) => {
      displayFormattedOutput(output, index);
    });
    
    // Test second transaction (simple post)
    console.log(chalk.green('\n===== TESTING SECOND TRANSACTION (POST) ====='));
    console.log(chalk.green(`Parsing transaction: ${TX_ID_2}`));
    const parsedTx2 = await tx_parser.parse_transaction(TX_ID_2);
    
    console.log(chalk.green(`Transaction parsed successfully with ${parsedTx2.outputs.length} outputs`));
    const validOutputs2 = parsedTx2.outputs.filter(o => o.isValid);
    console.log(chalk.green(`Found ${validOutputs2.length} valid outputs`));
    
    if (parsedTx2.timestamp) {
      console.log(chalk.green(`Transaction timestamp: ${parsedTx2.timestamp}`));
    }
    
    // Display each valid output with formatted text
    validOutputs2.forEach((output, index) => {
      displayFormattedOutput(output, index);
    });
    
    console.log(chalk.green('\n===== TEST COMPLETED SUCCESSFULLY ====='));
  } catch (error: any) {
    console.error(chalk.red(`Test failed: ${error.message}`));
  }
}

// Run the test
testParser();

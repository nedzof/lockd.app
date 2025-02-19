import { Transaction, ParsedTransaction, RawTransaction } from './types';
import bmap from 'bmapjs';
import axios from 'axios';
import { logger } from '../utils/logger';

export class TransactionParser {
  constructor() {
    logger.info('[TransactionParser] Initializing parser...');
  }

  async parseTransaction(tx: any): Promise<ParsedTransaction[] | null> {
    const startTime = process.hrtime();
    const txId = tx.tx?.h || tx.h || tx.id;
    
    logger.info('Starting transaction parsing', {
      txId,
      txData: {
        hasRaw: !!tx.tx?.raw,
        hasTransaction: !!tx.transaction,
        hasOut: !!tx.out || !!tx.tx?.out,
        txKeys: Object.keys(tx),
        txTxKeys: tx.tx ? Object.keys(tx.tx) : [],
        txSize: tx.tx?.raw?.length || tx.transaction?.length || tx.raw?.length || 0
      }
    });

    try {
      // Use bmap to parse the transaction
      let bmapTx;
      try {
        let rawTx = '';
        if (tx.tx?.raw) {
          // JungleBus format
          rawTx = tx.tx.raw;
          logger.debug('Using JungleBus raw format', { txId, rawLength: rawTx.length });
        } else if (tx.transaction) {
          // Raw hex transaction
          rawTx = tx.transaction;
          logger.debug('Using raw hex transaction format', { txId, rawLength: rawTx.length });
        } else if (tx.raw) {
          // Direct raw format
          rawTx = tx.raw;
          logger.debug('Using direct raw format', { txId, rawLength: rawTx.length });
        } else {
          logger.debug('No raw transaction data found', { 
            txId,
            txKeys: Object.keys(tx),
            txTxKeys: tx.tx ? Object.keys(tx.tx) : [],
            txOutLength: tx.out?.length || tx.tx?.out?.length || 0
          });
          return null;
        }

        logger.debug('Attempting to parse with bmap', {
          txId,
          rawLength: rawTx.length,
          rawPreview: rawTx.slice(0, 100),
          format: tx.tx?.raw ? 'junglebus' : (tx.transaction ? 'hex' : 'raw')
        });

        const parseStart = process.hrtime();
        bmapTx = await bmap.TransactionData.fromRaw(rawTx);
        const [parseSeconds, parseNanos] = process.hrtime(parseStart);
        
        logger.debug('Bmap parsing result', {
          txId,
          hasBmapTx: !!bmapTx,
          bmapKeys: bmapTx ? Object.keys(bmapTx) : [],
          outCount: bmapTx?.out?.length || 0,
          inCount: bmapTx?.in?.length || 0,
          parseTime: parseSeconds + parseNanos / 1e9,
          hasLockData: bmapTx?.out?.some(out => {
            const script = out.s || out.str || out.script;
            return script && (
              script.includes('OP_RETURN') || 
              script.includes('lock') || 
              script.includes('MAP')
            );
          })
        });

        if (!bmapTx) {
          logger.warn('Bmap parsing returned null result', { txId });
          return null;
        }

        logger.debug('Transaction parsed with bmap', {
          txId,
          inputCount: bmapTx.inputs.length,
          outputCount: bmapTx.outputs.length
        });
      } catch (error) {
        logger.error('Failed to parse with bmap', {
          txId,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        });
        return null;
      }

      const parsedTransactions: ParsedTransaction[] = [];
      const parseStart = process.hrtime();

      // Get sender address from first input if available
      let senderAddress: string | undefined;
      if (bmapTx.inputs.length > 0) {
        try {
          senderAddress = bmapTx.inputs[0].address;
          logger.debug('Extracted sender address', { txId, senderAddress });
        } catch (error) {
          logger.debug('Failed to extract sender address', { 
            txId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Process each output
      for (const [index, output] of bmapTx.outputs.entries()) {
        const outputStart = process.hrtime();
        try {
          // Check if it's an OP_RETURN output
          if (!output.script.includes('OP_RETURN')) {
            continue;
          }

          // Extract data parts from the script
          const parts = output.parts || [];
          if (parts.length === 0) {
            logger.debug('No data parts in OP_RETURN', { 
              txId, 
              outputIndex: index,
              script: output.script
            });
            continue;
          }

          // Try to find and parse JSON data in the parts
          let jsonData = null;
          for (const part of parts) {
            try {
              // Try to decode as UTF-8
              const decodedData = Buffer.from(part, 'hex').toString('utf8');
              logger.debug('Decoded part data', {
                txId,
                outputIndex: index,
                decodedLength: decodedData.length,
                decodedPreview: decodedData.slice(0, 100),
                isJson: decodedData.trim().startsWith('{')
              });

              if (decodedData.trim().startsWith('{')) {
                jsonData = JSON.parse(decodedData);
                break;
              }
            } catch (error) {
              logger.debug('Failed to decode/parse part', {
                txId,
                outputIndex: index,
                error: error instanceof Error ? error.message : 'Unknown error'
              });
              continue;
            }
          }

          if (!jsonData) {
            logger.debug('No valid JSON found in parts', { 
              txId, 
              outputIndex: index,
              partCount: parts.length
            });
            continue;
          }

          if (this.isLockdTransaction(jsonData)) {
            logger.info('Valid Lockd transaction found', { 
              txId, 
              outputIndex: index,
              type: jsonData.type,
              app: jsonData.app
            });
            
            const blockHeight = tx.block_height || tx.blk?.i || tx.height;
            const blockTime = tx.block_time || tx.blk?.t || tx.time;

            const parsedTx = {
              txid: txId,
              type: jsonData.type || 'content',
              blockHeight,
              blockTime,
              senderAddress,
              metadata: {
                application: jsonData.app,
                postId: jsonData.postId || `${txId}_${index}`,
                type: jsonData.type || 'content',
                content: jsonData.content,
                tags: jsonData.tags || [],
                sequence: jsonData.sequence || 0,
                parentSequence: jsonData.parentSequence || 0
              }
            };

            parsedTransactions.push(parsedTx);
            
            logger.info('Added parsed transaction', {
              txId,
              outputIndex: index,
              type: parsedTx.type,
              postId: parsedTx.metadata.postId
            });
          }

          const [outputSeconds, outputNanos] = process.hrtime(outputStart);
          logger.debug('Output processing complete', {
            txId,
            outputIndex: index,
            processingTime: outputSeconds + outputNanos / 1e9
          });
        } catch (error) {
          logger.error('Error processing output', {
            txId,
            outputIndex: index,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
          });
        }
      }

      const [parseSeconds, parseNanos] = process.hrtime(parseStart);
      logger.info('Parsing complete', {
        txId,
        parsedCount: parsedTransactions.length,
        totalParseTime: parseSeconds + parseNanos / 1e9,
        outputCount: bmapTx.outputs.length
      });

      return parsedTransactions.length > 0 ? parsedTransactions : null;

    } catch (error) {
      logger.error('Error parsing transaction', {
        txId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      return null;
    } finally {
      const [totalSeconds, totalNanos] = process.hrtime(startTime);
      logger.info('Transaction processing complete', {
        txId,
        totalTime: totalSeconds + totalNanos / 1e9,
        memoryUsage: process.memoryUsage()
      });
    }
  }

  private isLockdTransaction(data: any): boolean {
    const isValid = (
      data &&
      typeof data === 'object' &&
      data.app === 'lockd.app' &&
      typeof data.type === 'string' &&
      (data.content !== undefined || data.type === 'like' || data.type === 'follow')
    );

    logger.debug('Checking if Lockd transaction', {
      app: data?.app,
      type: data?.type,
      hasContent: data?.content !== undefined,
      isValid
    });

    return isValid;
  }

  private async parseJSONData(data: string): Promise<any | null> {
    try {
      let decodedStr = '';
      try {
        decodedStr = Buffer.from(data, 'hex').toString('utf8');
      } catch {
        decodedStr = data;
      }

      const jsonMatches = [
        decodedStr.match(/^\{.*\}$/s),
        decodedStr.match(/\{.*\}/s),
        decodedStr.match(/\s*\{.*\}\s*/s)
      ].filter(Boolean);

      if (jsonMatches.length > 0) {
        return JSON.parse(jsonMatches[0]![0]);
      }
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  private isOpReturn(script: string): boolean {
    const hasOpReturn = script?.includes('OP_RETURN');
    const has6a = script?.includes('6a');
    const hasOpFalse = script?.includes('OP_FALSE OP_RETURN');
    
    logger.debug('[TransactionParser] OP_RETURN detection:', {
      script,
      hasOpReturn,
      has6a,
      hasOpFalse,
      result: hasOpReturn || has6a || hasOpFalse
    });
    
    return hasOpReturn || has6a || hasOpFalse;
  }

  private extractDataFromScript(script: string): string | null {
    if (!script) {
      logger.debug('[TransactionParser] Empty script provided');
      return null;
    }

    logger.debug('[TransactionParser] Attempting to extract data from script:', {
      script,
      length: script.length,
      hasOpFalse: script.includes('OP_FALSE OP_RETURN'),
      hasOpReturn: script.includes('OP_RETURN'),
      starts6a: script.startsWith('6a'),
      starts006a: script.startsWith('006a')
    });

    if (script.includes('OP_FALSE OP_RETURN')) {
      const parts = script.split('OP_FALSE OP_RETURN ');
      logger.debug('[TransactionParser] Split on OP_FALSE OP_RETURN:', {
        partsLength: parts.length,
        part1: parts[0],
        part2: parts[1]?.slice(0, 50)
      });
      return parts[1]?.trim() || null;
    } 
    
    if (script.includes('OP_RETURN')) {
      const parts = script.split('OP_RETURN ');
      logger.debug('[TransactionParser] Split on OP_RETURN:', {
        partsLength: parts.length,
        part1: parts[0],
        part2: parts[1]?.slice(0, 50)
      });
      return parts[1]?.trim() || null;
    } 
    
    if (script.startsWith('6a')) {
      logger.debug('[TransactionParser] Processing 6a script:', {
        originalScript: script,
        extractedData: script.slice(2)?.slice(0, 50)
      });
      return script.slice(2);
    }

    if (script.startsWith('006a')) {
      logger.debug('[TransactionParser] Processing 006a script:', {
        originalScript: script,
        extractedData: script.slice(4)?.slice(0, 50)
      });
      return script.slice(4);
    }

    logger.debug('[TransactionParser] No matching script pattern found');
    return null;
  }

  private extractOutputsFromRawTransaction(rawTx: string): Array<{script: string, value: number}> {
    logger.debug('Starting raw transaction parsing', {
      txLength: rawTx.length,
      preview: rawTx.slice(0, 100)
    });

    const outputs: Array<{script: string, value: number}> = [];
    
    try {
      // Look for common MAP protocol patterns
      const patterns = [
        // OP_RETURN outputs
        /6a([0-9a-f]*)/g,  // Standard OP_RETURN
        /006a([0-9a-f]*)/g,  // OP_FALSE OP_RETURN
        /0063([0-9a-f]*)/g,  // Another form of OP_FALSE OP_RETURN
        
        // MAP protocol specific patterns
        /"OP_RETURN ([^"]+)"/g,  // Quoted OP_RETURN
        /"OP_FALSE OP_RETURN ([^"]+)"/g,  // Quoted OP_FALSE OP_RETURN
        /\{[^}]*"app":"lockd\.app"[^}]*\}/g  // JSON containing lockd.app
      ];

      let foundOutputs = 0;
      for (const pattern of patterns) {
        const matches = [...rawTx.matchAll(pattern)];
        logger.debug('Pattern matches', {
          pattern: pattern.toString(),
          matchCount: matches.length
        });

        for (const match of matches) {
          const script = match[1] || match[0];  // Use capture group if exists, otherwise full match
          outputs.push({
            script,
            value: 0  // OP_RETURN outputs have 0 value
          });
          foundOutputs++;
        }
      }

      // Try to parse as JSON if no matches found
      if (foundOutputs === 0 && rawTx.includes('{') && rawTx.includes('}')) {
        try {
          const jsonMatch = rawTx.match(/\{.*\}/s);
          if (jsonMatch) {
            const jsonData = JSON.parse(jsonMatch[0]);
            if (jsonData.app === 'lockd.app') {
              logger.debug('Found lockd.app JSON data', {
                app: jsonData.app,
                type: jsonData.type
              });
              outputs.push({
                script: jsonMatch[0],
                value: 0
              });
            }
          }
        } catch (e) {
          logger.debug('Failed to parse as JSON', {
            error: e instanceof Error ? e.message : 'Unknown error'
          });
        }
      }

      logger.info('Extracted outputs from raw transaction', {
        outputCount: outputs.length,
        patterns: patterns.length
      });

      return outputs;
    } catch (error) {
      logger.error('Error parsing raw transaction', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      return [];
    }
  }
}
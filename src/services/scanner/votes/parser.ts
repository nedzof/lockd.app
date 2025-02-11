import { Transaction, StructuredTransaction, VoteOption } from '../types';

export class TransactionParser {
  private static cleanString(s: string): string {
    // Remove control characters and special bytes
    const cleaned = s.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
    // Remove multiple spaces
    return cleaned.replace(/\s+/g, ' ').trim();
  }

  private static hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  private static bytesToString(bytes: Uint8Array): string {
    return new TextDecoder().decode(bytes);
  }

  private static parseScriptData(hex: string): Record<string, any> {
    try {
      const bytes = this.hexToBytes(hex);
      const data: Record<string, any> = {};
      
      // Convert bytes to string for pattern matching
      const fullString = this.bytesToString(bytes);
      
      // Helper function to extract content between markers
      const extractContent = (start: string, end: string = '\x00'): string | null => {
        const startIdx = fullString.indexOf(start);
        if (startIdx === -1) return null;
        
        const contentStart = startIdx + start.length;
        const endIdx = fullString.indexOf(end, contentStart);
        if (endIdx === -1) return null;
        
        return this.cleanString(fullString.slice(contentStart, endIdx));
      };

      // Extract various fields
      data.content = extractContent('content');
      data.version = extractContent('version') || '1.0.0';
      
      // Check for vote question
      if (fullString.includes('isVoteQuestion') || fullString.includes('what will flip btc')) {
        data.isVoteQuestion = true;
        // If content wasn't found with 'content' marker, try 'what will flip btc'
        if (!data.content) {
          data.content = extractContent('what will flip btc') || 'what will flip btc';
        }
      }

      // Check for vote option
      if (fullString.includes('vote_option')) {
        data.isVoteOption = true;
        const lockAmount = extractContent('lockAmount');
        if (lockAmount) {
          data.lockAmount = parseInt(lockAmount, 10);
        }
        
        // For vote options, check for specific cryptocurrency content
        ['eth', 'xrp', 'doge', 'btc', 'bsv'].forEach(crypto => {
          if (fullString.includes(crypto)) {
            data.content = crypto;
          }
        });
      }

      // Set type based on what we found
      data.type = data.isVoteOption ? 'vote_option' : 'vote';

      return data;
    } catch (error) {
      console.error('Error parsing script data:', error);
      return {};
    }
  }

  private static extractAuthorAddress(tx: Transaction): string | null {
    // Try to get the author address from the last output's scriptPubKey address
    if (tx.vout && tx.vout.length > 0) {
      const lastOutput = tx.vout[tx.vout.length - 1];
      if (lastOutput.scriptPubKey?.addresses && lastOutput.scriptPubKey.addresses.length > 0) {
        return lastOutput.scriptPubKey.addresses[0];
      }
    }
    
    return null;
  }

  public static parseTransaction(tx: Transaction): StructuredTransaction {
    const timestamp = new Date(tx.time * 1000);
    
    // Format for Prisma VoteQuestion and VoteOption models
    const structured = {
      transaction_id: tx.txid,
      block_height: tx.blockheight,
      block_hash: tx.blockhash,
      timestamp: tx.time,
      
      // VoteQuestion format
      voteQuestion: null as any,
      
      // VoteOption format
      voteOptions: [] as any[],
      
      metadata: {
        version: null,
        app: 'lockd.app',
        type: 'vote',
        severity: 'info',
        tags: ['lockdapp', 'vote_question'],
        authorAddress: this.extractAuthorAddress(tx)
      }
    };

    // Process outputs
    tx.vout.forEach(output => {
      if (output.scriptPubKey?.hex) {
        const parsed = this.parseScriptData(output.scriptPubKey.hex);

        // Update metadata
        if (parsed.version) {
          structured.metadata.version = parsed.version;
        }

        // Format vote question for Prisma
        if (parsed.isVoteQuestion && parsed.content) {
          structured.voteQuestion = {
            txid: tx.txid,
            content: parsed.content,
            author_address: structured.metadata.authorAddress,
            created_at: timestamp,
            options: [], // Will be filled with formatted options
            tags: structured.metadata.tags
          };
        }

        // Format vote options for Prisma
        else if (parsed.isVoteOption && parsed.content) {
          const option = {
            txid: tx.txid + '_' + parsed.content, // Unique txid for each option
            question_txid: tx.txid,
            content: parsed.content,
            author_address: structured.metadata.authorAddress,
            created_at: timestamp,
            lock_amount: parsed.lockAmount || 1000,
            lock_duration: 1,
            tags: structured.metadata.tags
          };
          
          structured.voteOptions.push(option);
          
          // Also add to vote question options if it exists
          if (structured.voteQuestion) {
            structured.voteQuestion.options.push({
              option: parsed.content,
              lockAmount: parsed.lockAmount || 1000,
              lockDuration: 1,
              timestamp: timestamp.toISOString()
            });
          }
        }
      }
    });

    return structured;
  }
} 
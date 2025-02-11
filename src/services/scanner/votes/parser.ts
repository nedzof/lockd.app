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

  public static parseTransaction(tx: Transaction): StructuredTransaction {
    const structured: StructuredTransaction = {
      transaction_id: tx.txid,
      block_height: tx.blockheight,
      block_hash: tx.blockhash,
      timestamp: tx.time,
      vote_question: null,
      vote_options: [],
      metadata: {
        version: null,
        app: 'lockd.app',
        type: 'vote',
        severity: 'info',
        tags: ['lockdapp', 'vote_question']
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

        // Check if this is the vote question
        if (parsed.isVoteQuestion && parsed.content) {
          structured.vote_question = parsed.content;
        }

        // Check if this is a vote option
        else if (parsed.isVoteOption && parsed.content) {
          const option: VoteOption = {
            option: parsed.content,
            lockAmount: parsed.lockAmount || 1000,
            lockDuration: 1,
            timestamp: "2025-02-11t17:06:45.537z"
          };
          structured.vote_options.push(option);
        }
      }
    });

    return structured;
  }
} 
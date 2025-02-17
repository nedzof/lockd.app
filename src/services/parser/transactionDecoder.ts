import fetch from 'node-fetch';
import { BitcoinTransaction, DecodedTransaction, TransactionOutput, OpReturnData } from './types';
import { PROTOCOLS, SCRIPT_TYPES } from './constants';

export class TransactionDecoder {
  constructor(private readonly jungleBusUrl: string = 'https://junglebus.gorillapool.io/v1/transaction/get/') {}

  async decodeFullTransaction(txid: string): Promise<DecodedTransaction> {
    const response = await fetch(`${this.jungleBusUrl}${txid}`);
    const txData = await response.json();

    // Base transaction structure
    const decodedTx: DecodedTransaction = {
      transaction: {
        txid,
        version: txData.version,
        inputs: txData.inputs.map((input: any) => ({
          txid: input.txid,
          vout: input.vout,
          scriptSig: input.scriptSig.hex,
          sequence: input.sequence,
          witness: input.witness
        })),
        outputs: [],
        locktime: txData.locktime,
        blockHash: txData.block_hash,
        blockHeight: txData.block_height,
        timestamp: new Date(txData.block_time * 1000).toISOString()
      },
      votingData: {
        question: '',
        options: [],
        metadata: {
          postId: '',
          totalOptions: 0,
          optionsHash: ''
        }
      }
    };

    // Process outputs
    let currentVoteOption: any = null;
    decodedTx.transaction.outputs = txData.outputs.map((output: any, index: number) => {
      const decodedOutput: TransactionOutput = {
        value: output.value,
        scriptPubKey: output.scriptPubKey.hex,
        addresses: output.scriptPubKey.addresses || [],
        type: output.scriptPubKey.type
      };

      // Detect and decode OP_RETURN data
      if (output.scriptPubKey.type === SCRIPT_TYPES.NULLDATA) {
        decodedOutput.opReturn = this.decodeOpReturn(output.scriptPubKey.asm);
        
        if (decodedOutput.opReturn) {
          // Extract vote data
          if (decodedOutput.opReturn.metadata?.type === 'vote_question') {
            decodedTx.votingData.metadata.totalOptions = parseInt(decodedOutput.opReturn.metadata.totalOptions || '0', 10);
            decodedTx.votingData.metadata.optionsHash = decodedOutput.opReturn.metadata.optionsHash || '';
            decodedTx.votingData.question = decodedOutput.opReturn.content || '';
          } else if (decodedOutput.opReturn.metadata?.type === 'vote_option') {
            currentVoteOption = {
              index: parseInt(decodedOutput.opReturn.metadata.optionIndex || '0', 10),
              content: decodedOutput.opReturn.content || '',
              lockAmount: parseInt(decodedOutput.opReturn.metadata.lockAmount || '0', 10),
              lockDuration: parseInt(decodedOutput.opReturn.metadata.lockDuration || '0', 10)
            };
            decodedTx.votingData.options.push(currentVoteOption);
          }

          // Extract general metadata
          if (decodedOutput.opReturn.metadata?.postId) {
            decodedTx.votingData.metadata.postId = decodedOutput.opReturn.metadata.postId;
          }
        }
      }

      return decodedOutput;
    });

    // Sort options by index
    decodedTx.votingData.options.sort((a, b) => a.index - b.index);

    return decodedTx;
  }

  decodeTransaction(tx: BitcoinTransaction): OpReturnData[] {
    const decodedOutputs: OpReturnData[] = [];

    for (const output of tx.outputs) {
      const decodedOutput = this.decodeOutput(output);
      if (decodedOutput?.opReturn) {
        decodedOutputs.push(decodedOutput.opReturn);
      }
    }

    return decodedOutputs;
  }

  private decodeOutput(output: TransactionOutput): { opReturn?: OpReturnData } {
    const decodedOutput: { opReturn?: OpReturnData } = {};

    if (!output.scriptPubKey?.asm?.startsWith('OP_RETURN')) {
      return decodedOutput;
    }

    try {
      decodedOutput.opReturn = this.decodeOpReturn(output.scriptPubKey.asm);
    } catch (error) {
      console.error('Failed to decode OP_RETURN:', error);
    }

    return decodedOutput;
  }

  private decodeOpReturn(asm: string): OpReturnData | undefined {
    if (!asm) return undefined;

    const parts = asm.split(' ');
    if (parts.length < 2) return undefined;

    // Remove OP_RETURN
    parts.shift();

    let protocols: string[] = [];
    let content = '';
    let metadata: Record<string, string> = {};

    try {
      // Try to decode the data
      const decodedData = Buffer.from(parts[0], 'hex').toString('utf8');
      
      // Check for MAP protocol
      if (decodedData.includes('MAP')) {
        protocols.push('MAP');
        content = decodedData.split('content=')[1]?.split('&')[0] || '';
        
        // Extract metadata
        const metadataPairs = decodedData.split('&');
        for (const pair of metadataPairs) {
          const [key, value] = pair.split('=');
          if (key && value) {
            metadata[key] = value;
          }
        }
      }
      
      // Check for ORD protocol
      if (decodedData.includes('ORD')) {
        protocols.push('ORD');
      }

      return {
        protocols,
        content,
        metadata
      };
    } catch (error) {
      console.error('Failed to decode OP_RETURN data:', error);
      return undefined;
    }
  }
}

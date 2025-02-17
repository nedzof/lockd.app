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
    decodedTx.transaction.outputs = txData.outputs.map((output: any, index: number) => {
      const decodedOutput: TransactionOutput = {
        value: output.value,
        scriptPubKey: output.scriptPubKey.hex,
        addresses: output.addresses,
        type: output.type
      };

      // Detect and decode OP_RETURN data
      if (output.type === SCRIPT_TYPES.NULLDATA) {
        decodedOutput.opReturn = this.decodeOpReturn(output.scriptPubKey.asm);
        
        // Extract voting data from first valid OP_RETURN
        if (index === 0 && decodedOutput.opReturn) {
          decodedTx.votingData = this.extractVotingData(decodedOutput.opReturn);
        }
      }

      return decodedOutput;
    });

    return decodedTx;
  }

  private decodeOpReturn(asm: string): OpReturnData | null {
    const chunks = asm.split(' ');
    if (chunks[0] !== 'OP_RETURN') return null;

    const opReturn: OpReturnData = {
      protocols: [],
      metadata: {}
    };

    let currentProtocol = '';
    let buffer = '';

    for (let i = 1; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // Detect protocol identifiers
      if (chunk === PROTOCOLS.ORD) {
        currentProtocol = 'ORD';
        opReturn.protocols.push('ORD');
      } else if (chunk === PROTOCOLS.MAP) {
        currentProtocol = 'MAP';
        opReturn.protocols.push('MAP');
      } else if (chunk === PROTOCOLS.BITCOM) {
        currentProtocol = 'BITCOM';
        opReturn.protocols.push('BITCOM');
      } else {
        // Decode data based on current protocol
        const decoded = Buffer.from(chunk, 'hex').toString('utf-8');
        
        switch(currentProtocol) {
          case 'ORD':
            if (decoded.startsWith('text/plain')) {
              opReturn.contentType = 'text/plain';
            } else if (opReturn.contentType) {
              opReturn.content = decoded;
            }
            break;

          case 'MAP':
            const [key, value] = decoded.split('=');
            if (key && value) {
              opReturn.metadata![key] = value;
            }
            break;

          case 'BITCOM':
            buffer += decoded;
            if (decoded.endsWith(']')) {
              const match = buffer.match(/\[(.*?)\]/);
              if (match) {
                opReturn.metadata![match[1]] = true;
              }
              buffer = '';
            }
            break;
        }
      }
    }

    return opReturn;
  }

  private extractVotingData(opReturn: OpReturnData): DecodedTransaction['votingData'] {
    const votingData: DecodedTransaction['votingData'] = {
      question: '',
      options: [],
      metadata: {
        postId: '',
        totalOptions: 0,
        optionsHash: ''
      }
    };

    if (opReturn.metadata) {
      votingData.question = opReturn.content || '';
      votingData.metadata.postId = opReturn.metadata.postId || '';
      votingData.metadata.totalOptions = parseInt(opReturn.metadata.totalOptions || '0', 10);
      votingData.metadata.optionsHash = opReturn.metadata.optionsHash || '';
    }

    return votingData;
  }
}

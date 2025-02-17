import { ProtocolHandler, MAP_PROTOCOL_MARKERS } from './protocolHandler';
import { ParsedPost, TransactionOutput, DecodedTransaction } from './types';
import { JungleBusTransaction } from '../scanner/types';
import { ImageProcessor } from '../scanner/imageProcessor';
import { TransactionDecoder } from './transactionDecoder';

export class MAPProtocolHandler implements ProtocolHandler {
  private decoder: TransactionDecoder;

  constructor(
    public readonly name: string = 'MAP',
    public readonly version: string = '1.0',
    private readonly imageProcessor?: ImageProcessor
  ) {
    this.decoder = new TransactionDecoder();
  }

  detect(script: string): boolean {
    return script.includes(MAP_PROTOCOL_MARKERS.MAP_PREFIX);
  }

  async parse(tx: JungleBusTransaction): Promise<ParsedPost> {
    const decodedTx = await this.decoder.decodeFullTransaction(tx.id);
    return this.convertToPost(decodedTx, tx);
  }

  private convertToPost(decodedTx: DecodedTransaction, originalTx: JungleBusTransaction): ParsedPost {
    const timestamp = Math.floor(new Date(decodedTx.transaction.timestamp).getTime() / 1000);
    
    const basePost: ParsedPost = {
      txid: decodedTx.transaction.txid,
      postId: decodedTx.votingData.metadata.postId || decodedTx.transaction.txid,
      author: '',  // Extract from first input if needed
      blockHeight: decodedTx.transaction.blockHeight,
      blockTime: timestamp,
      timestamp,
      content: {
        text: decodedTx.votingData.question || '',
        title: undefined,
        description: undefined
      },
      metadata: {
        app: MAP_PROTOCOL_MARKERS.APP,
        version: this.version,
        type: 'vote',
        postId: decodedTx.votingData.metadata.postId,
        sequence: 0,
        timestamp: decodedTx.transaction.timestamp,
        voteOptions: decodedTx.votingData.options.map(opt => ({
          optionindex: opt.index,
          content: opt.content,
          lockamount: opt.lockAmount.toString(),
          lockduration: opt.lockDuration.toString()
        })),
        optionsHash: decodedTx.votingData.metadata.optionsHash
      },
      images: [],
      tags: []
    };

    // Handle images if this is v2
    if (this.version === '2.0' && this.imageProcessor && originalTx.outputs) {
      this.processImages(basePost, originalTx.outputs);
    }

    return basePost;
  }

  private async processImages(post: ParsedPost, outputs: any[]): Promise<void> {
    const imageOutputs = outputs.filter(o => 
      o && o.script && (
        o.script.includes('image:') ||
        o.script.includes('data:image/')
      )
    );

    if (imageOutputs.length > 0 && this.imageProcessor) {
      try {
        post.images = await Promise.all(imageOutputs.map(async (output) => {
          if (!output || !output.script) return {
            data: null,
            contentType: '',
            dataURL: null
          };
          
          try {
            const processed = await this.imageProcessor!.processImage(Buffer.from(output.script, 'hex'));
            return {
              data: processed.data,
              contentType: processed.metadata.mimeType,
              dataURL: processed.dataUrl || null
            };
          } catch (error) {
            console.error('Failed to process image:', error);
            return {
              data: null,
              contentType: '',
              dataURL: null
            };
          }
        }));
      } catch (error) {
        console.error('Failed to process images:', error);
      }
    }
  }
}

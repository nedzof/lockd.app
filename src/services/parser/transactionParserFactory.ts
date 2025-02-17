import { ProtocolHandler } from './protocolHandler';
import { MAPProtocolHandler } from './mapProtocolHandler';
import { ParsedPost } from './types';
import { JungleBusTransaction } from '../scanner/types';
import { ImageProcessor } from '../scanner/imageProcessor';

export class TransactionParserFactory {
  private handlers: ProtocolHandler[] = [];

  constructor(imageProcessor?: ImageProcessor) {
    // Register default handlers
    this.registerHandler(new MAPProtocolHandler('MAP', '1.0'));
    this.registerHandler(new MAPProtocolHandler('MAP', '2.0', imageProcessor));
  }

  registerHandler(handler: ProtocolHandler) {
    this.handlers.push(handler);
  }

  async parseTransaction(tx: JungleBusTransaction): Promise<ParsedPost | null> {
    if (!tx.transaction || !tx.outputs || tx.outputs.length === 0) {
      return null;
    }

    for (const output of tx.outputs) {
      if (!output.script) continue;

      for (const handler of this.handlers) {
        if (handler.detect(output.script)) {
          try {
            return await handler.parse(tx);
          } catch (error) {
            console.error(`Error parsing transaction with ${handler.name} v${handler.version}:`, error);
          }
        }
      }
    }

    return null;
  }
}

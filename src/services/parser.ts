// src/parser.ts
import { TransactionOutput } from "@gorillapool/js-junglebus";
import { CONFIG } from "./config";
import { ParsedContent, ParsedTransaction, ParsedVote } from "./types";

export class TransactionParser {
  parseTransaction(tx: any): ParsedTransaction {
    const result: ParsedTransaction = {
      txid: tx.id,
      blockHeight: tx.block_height,
      timestamp: new Date(tx.block_time * 1000),
      postId: "",
      sequence: 0,
      parentSequence: 0,
      contents: [],
      tags: []
    };

    this.processOutputs(tx.outputs, result);
    this.extractMetadata(tx.data, result);
    
    return result;
  }

  private processOutputs(outputs: TransactionOutput[], result: ParsedTransaction) {
    for (const output of outputs) {
      try {
        const script = output.script;
        if (!script) continue;

        const scriptBuffer = Buffer.from(script, 'hex');
        if (scriptBuffer[0] !== 0x6a) continue; // OP_RETURN

        const data = this.parseScriptData(scriptBuffer);
        this.processDataPushes(data, result);
      } catch (error) {
        console.error('Error processing output:', error);
      }
    }
  }

  private parseScriptData(buffer: Buffer): string[] {
    const pushes: string[] = [];
    let offset = 1; // Skip OP_RETURN
    
    while (offset < buffer.length) {
      const opcode = buffer[offset];
      let length = 0;
      
      if (opcode <= 0x4b) {
        length = opcode;
        offset += 1;
      } else if (opcode === 0x4c) {
        length = buffer[offset + 1];
        offset += 2;
      } else {
        break; // Skip unsupported opcodes
      }

      if (offset + length > buffer.length) break;
      
      const data = buffer.subarray(offset, offset + length);
      pushes.push(data.toString('utf8'));
      offset += length;
    }

    return pushes;
  }

  private processDataPushes(pushes: string[], result: ParsedTransaction) {
    for (const item of pushes) {
      if (item.startsWith('app=')) {
        result.postId = item.split('=')[1];
      } else if (item.startsWith('type=')) {
        this.handleType(item, result);
      } else if (item.startsWith('content=')) {
        this.addContent(item, CONFIG.CONTENT_TYPES.PLAIN, result);
      } else if (item.startsWith('filename=')) {
        this.addFileMetadata(item, result);
      } else if (item.startsWith('lockAmount=')) {
        this.processLockParameters(item, result);
      } else if (item.startsWith('optionsHash=')) {
        this.processVoteParameters(item, result);
      } else if (item.startsWith('tags=')) {
        this.processTags(item, result);
      }
    }
  }

  private handleType(item: string, result: ParsedTransaction) {
    const type = item.split('=')[1];
    if (type === 'vote_question') {
      result.sequence = 0;
    } else if (type === 'vote_option') {
      result.parentSequence = result.sequence;
    }
  }

  private addContent(item: string, contentType: string, result: ParsedTransaction) {
    const content: ParsedContent = {
      type: contentType,
      data: decodeURIComponent(item.split('=')[1])
    };
    
    if (contentType === CONFIG.CONTENT_TYPES.IMAGE) {
      content.encoding = 'base64';
    }
    
    result.contents.push(content);
  }

  private addFileMetadata(item: string, result: ParsedTransaction) {
    const filename = item.split('=')[1];
    const content = result.contents[result.contents.length - 1];
    if (content) {
      content.filename = filename;
    }
  }

  private processLockParameters(item: string, result: ParsedTransaction) {
    const amount = parseInt(item.split('=')[1], 10);
    if (!result.vote) result.vote = { optionsHash: '', totalOptions: 0, questionId: '', options: [] };
    result.vote.options[result.vote.options.length - 1].lockAmount = amount;
  }

  private processVoteParameters(item: string, result: ParsedTransaction) {
    const optionsHash = item.split('=')[1];
    if (!result.vote) result.vote = { optionsHash: '', totalOptions: 0, questionId: '', options: [] };
    result.vote.optionsHash = optionsHash;
  }

  private processTags(item: string, result: ParsedTransaction) {
    const tags = item.split('=')[1].replace(/[\[\]"]/g, '');
    result.tags = tags.split(',').map(t => t.trim());
  }
}
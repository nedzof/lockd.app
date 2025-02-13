import { MAP_TYPES, ParsedPost } from './types.js';
import { createHash } from 'crypto';
import { extractImageFromTransaction, validateImageData } from './imageProcessor.js';

interface JungleBusOutput {
  script?: {
    asm?: string;
    hex?: string;
  };
}

interface JungleBusTransaction {
  id: string;
  addresses: string[];
  block_height: number;
  block_time?: number;
  outputs?: JungleBusOutput[];
}

interface ParsedComponent {
  type: MAP_TYPES;
  postId: string;
  sequence: number;
  parentSequence?: number;
  data: Record<string, any>;
  rawHex?: string;
}

function parseMapFields(scriptData: string): Record<string, any> {
  const mapFields: Record<string, any> = {};
  const matches = scriptData.matchAll(/(MAP_)([A-Z_]+)=([^|]+)/gi);
  
  for (const match of Array.from(matches)) {
    const [_, prefix, key, value] = match;
    const fieldName = key.toLowerCase();
    
    // Handle special fields
    switch(fieldName) {
      case 'sequence':
      case 'parent_sequence':
      case 'total_options':
      case 'option_index':
      case 'lock_amount':
      case 'lock_duration':
        mapFields[fieldName] = Number(value) || 0;
        break;
      case 'is_vote':
      case 'is_locked':
        mapFields[fieldName] = value.toLowerCase() === 'true';
        break;
      case 'tags':
        try {
          mapFields[fieldName] = JSON.parse(value);
        } catch (e) {
          mapFields[fieldName] = [];
        }
        break;
      default:
        mapFields[fieldName] = value;
    }
  }
  
  return mapFields;
}

function parseComponent(output: JungleBusOutput): ParsedComponent | null {
  if (!output.script?.asm) return null;

  const mapFields = parseMapFields(output.script.asm);
  const type = mapFields.type as MAP_TYPES;
  const postId = mapFields.post_id;
  
  if (!type || !postId) return null;

  return {
    type,
    postId,
    sequence: Number(mapFields.sequence) || 0,
    parentSequence: mapFields.parent_sequence ? Number(mapFields.parent_sequence) : undefined,
    data: mapFields,
    rawHex: output.script.hex
  };
}

function processImageData(component: ParsedComponent): { data: string; contentType: string; encoding: string } | null {
  if (!component.rawHex) return null;

  try {
    const buffer = Buffer.from(component.rawHex, 'hex');
    const content = buffer.toString('utf8');
    
    // Try base64 pattern first
    const base64Match = content.match(/data:image\/(\w+);base64,([^"]+)/);
    if (base64Match) {
      return {
        data: base64Match[2],
        contentType: `image/${base64Match[1].toLowerCase()}`,
        encoding: 'base64'
      };
    }
    
    // If no base64 pattern found, check if it's raw image data
    if (component.data.content_type?.startsWith('image/')) {
      return {
        data: content,
        contentType: component.data.content_type,
        encoding: component.data.encoding || 'base64'
      };
    }
  } catch (error) {
    console.error('Error processing image data:', error);
  }
  
  return null;
}

function processVoteOptions(
  questionComponent: ParsedComponent,
  allComponents: ParsedComponent[],
  txid: string,
  blockHeight: number
) {
  const options = allComponents
    .filter(c => 
      c.type === MAP_TYPES.VOTE_OPTION && 
      c.parentSequence === questionComponent.sequence
    )
    .sort((a, b) => (a.data.option_index || 0) - (b.data.option_index || 0))
    .map(opt => ({
      text: opt.data.content || '',
      lockAmount: opt.data.lock_amount,
      lockDuration: opt.data.lock_duration,
      index: opt.data.option_index || 0,
      unlockHeight: opt.data.unlock_height,
      currentHeight: blockHeight,
      lockPercentage: 0 // This will be calculated later
    }));

  return {
    question: questionComponent.data.content || '',
    options,
    totalOptions: questionComponent.data.total_options || options.length,
    optionsHash: questionComponent.data.options_hash || ''
  };
}

export async function parseMapTransaction(tx: JungleBusTransaction): Promise<ParsedPost | null> {
  try {
    // Extract image data first
    const imageData = await extractImageFromTransaction(tx);
    const isValidImage = validateImageData(imageData);
    
    // Parse MAP fields from outputs
    const mapFields = tx.outputs?.reduce((fields: Record<string, any>, output: JungleBusOutput) => {
      if (output.script?.asm) {
        const parsedFields = parseMapFields(output.script.asm);
        return { ...fields, ...parsedFields };
      }
      return fields;
    }, {}) || {};

    // Get the first address as author
    const author = tx.addresses?.[0] || '';

    // Create post ID if not present
    const postId = mapFields.post_id || createHash('sha256').update(tx.id).digest('hex').substring(0, 16);

    // Parse content
    const content = {
      text: mapFields.content || '',
      title: mapFields.title || undefined,
      description: mapFields.description || undefined
    };

    // Parse metadata
    const metadata = {
      app: mapFields.app || 'lockd.app',
      version: mapFields.version || '1.0.0',
      lock: mapFields.is_locked ? {
        isLocked: true,
        duration: mapFields.lock_duration || 0,
        unlockHeight: mapFields.unlock_height
      } : undefined
    };

    // Parse vote data if present
    const vote = mapFields.is_vote ? {
      question: mapFields.vote_question || '',
      totalOptions: mapFields.total_options || 0,
      optionsHash: createHash('sha256').update(tx.id + ':options').digest('hex'),
      options: Array.from({ length: mapFields.total_options || 0 }, (_, i) => ({
        index: i,
        text: mapFields[`option_${i}`] || '',
        lockAmount: mapFields[`option_${i}_lock_amount`] || undefined,
        lockDuration: mapFields[`option_${i}_lock_duration`] || undefined,
        unlockHeight: mapFields[`option_${i}_unlock_height`] || undefined,
        currentHeight: tx.block_height,
        lockPercentage: 0
      }))
    } : undefined;

    // Construct the final parsed post
    const parsedPost: ParsedPost = {
      txid: tx.id,
      postId,
      author,
      content,
      metadata,
      vote,
      tags: mapFields.tags || [],
      timestamp: tx.block_time ? tx.block_time * 1000 : Date.now(),
      blockHeight: tx.block_height,
      images: isValidImage && imageData ? [{
        contentType: imageData.mimeType,
        data: imageData.rawData,
        encoding: 'base64',
        dataURL: imageData.dataURL
      }] : []
    };

    return parsedPost;
  } catch (error) {
    console.error('Error parsing MAP transaction:', error);
    return null;
  }
} 
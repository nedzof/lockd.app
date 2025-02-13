import { MAP_TYPES, ParsedPost } from './types';
import { createHash } from 'crypto';

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

export function parseMapTransaction(tx: JungleBusTransaction): ParsedPost | null {
  try {
    const components = new Map<string, ParsedComponent[]>();
    let mainPostId: string | null = null;

    // First pass: Collect all components
    for (const output of tx.outputs || []) {
      const component = parseComponent(output);
      if (!component) continue;

      // Track main post ID using content component
      if (component.type === MAP_TYPES.CONTENT && !mainPostId) {
        mainPostId = component.postId;
      }

      if (!components.has(component.postId)) {
        components.set(component.postId, []);
      }
      components.get(component.postId)?.push(component);
    }

    if (!mainPostId) return null;

    // Initialize result
    const result: ParsedPost = {
      postId: mainPostId,
      images: [],
      tags: [],
      author: tx.addresses[0],
      timestamp: tx.block_time ? new Date(tx.block_time * 1000).toISOString() : new Date().toISOString(),
      txid: tx.id,
      blockHeight: tx.block_height,
      metadata: {
        app: 'lockd.app',
        version: '1.0.0'
      }
    };

    // Process components in sequence order
    const postComponents = components.get(mainPostId) || [];
    postComponents.sort((a, b) => a.sequence - b.sequence);

    for (const component of postComponents) {
      switch (component.type) {
        case MAP_TYPES.CONTENT:
          result.content = {
            title: component.data.title,
            description: component.data.description,
            text: component.data.content || ''
          };
          
          // Handle lock data
          if (component.data.is_locked) {
            result.metadata.lock = {
              isLocked: true,
              duration: component.data.lock_duration,
              amount: component.data.lock_amount,
              unlockHeight: component.data.unlock_height
            };
          }
          break;

        case MAP_TYPES.IMAGE:
          const imageData = processImageData(component);
          if (imageData) {
            result.images.push(imageData);
          }
          break;

        case MAP_TYPES.VOTE_QUESTION:
          result.vote = processVoteOptions(component, postComponents, tx.id, tx.block_height);
          break;

        case MAP_TYPES.TAGS:
          try {
            const tags = component.data.tags;
            result.tags = Array.isArray(tags) ? tags : [];
          } catch (error) {
            console.error('Error parsing tags:', error);
          }
          break;
      }
    }

    return result;
  } catch (error) {
    console.error('Error parsing MAP transaction:', error);
    return null;
  }
} 
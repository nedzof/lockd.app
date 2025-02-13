import { TRANSACTION_TYPES } from './types';

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
  outputs?: JungleBusOutput[];
}

interface VoteOption {
  txid: string;
  post_txid: string;
  content: string;
  author_address: string;
  created_at: Date;
  lock_amount: number;
  lock_duration: number;
  unlock_height: number;
  current_height: number;
  lock_percentage: number;
  tags: string[];
}

interface ParsedMapData {
  txid: string;
  content: string;
  author_address: string;
  media_type?: string;
  block_height: number;
  amount?: number;
  unlock_height?: number;
  description?: string;
  tags: string[];
  metadata?: Record<string, any>;
  is_locked: boolean;
  lock_duration?: number;
  raw_image_data?: string;
  image_format?: string;
  image_source?: string;
  is_vote: boolean;
  vote_options: VoteOption[];
}

export function parseMapTransaction(tx: JungleBusTransaction): ParsedMapData | null {
  try {
    // Initialize result object matching Prisma schema
    const result: ParsedMapData = {
      txid: tx.id,
      content: '',
      author_address: tx.addresses[0],
      block_height: tx.block_height,
      tags: [],
      is_locked: false,
      is_vote: false,
      vote_options: []
    };

    // Process each output for MAP data
    for (const output of tx.outputs || []) {
      if (!output.script?.asm) continue;

      const scriptData = output.script.asm;
      
      // Extract MAP fields
      const mapFields = new Map<string, string>();
      const matches = scriptData.matchAll(/MAP_([A-Z_]+)=([^|]+)/gi);
      for (const match of Array.from(matches)) {
        const [_, key, value] = match;
        mapFields.set(key.toLowerCase(), value);
      }

      // Process image data if present
      if (output.script.hex) {
        const buffer = Buffer.from(output.script.hex, 'hex');
        const content = buffer.toString('utf8');
        
        // Check for base64 encoded images
        const imageMatch = content.match(/data:image\/(\w+);base64,([^"]+)/);
        if (imageMatch) {
          result.media_type = `image/${imageMatch[1]}`;
          result.raw_image_data = imageMatch[2];
          result.image_format = imageMatch[1];
        }

        // Check for image URLs
        const urlMatch = content.match(/https?:\/\/[^\s"]+\.(jpg|jpeg|png|gif|webp)/i);
        if (urlMatch && !result.image_source) {
          result.image_source = urlMatch[0];
          result.image_format = urlMatch[1].toLowerCase();
          result.media_type = `image/${result.image_format}`;
        }
      }

      // Extract main content and metadata
      if (mapFields.has('content')) {
        result.content = mapFields.get('content')!;
      }

      // Handle tags
      if (mapFields.has('tags')) {
        try {
          result.tags = JSON.parse(mapFields.get('tags')!);
        } catch (e) {
          console.error('Error parsing tags:', e);
        }
      }

      // Handle metadata
      if (mapFields.has('metadata')) {
        try {
          result.metadata = JSON.parse(mapFields.get('metadata')!);
        } catch (e) {
          console.error('Error parsing metadata:', e);
        }
      }

      // Handle lock information
      if (mapFields.has('lock_duration')) {
        result.lock_duration = parseInt(mapFields.get('lock_duration')!);
        result.is_locked = true;
      }

      if (mapFields.has('unlock_height')) {
        result.unlock_height = parseInt(mapFields.get('unlock_height')!);
      }

      // Handle vote-specific fields
      if (mapFields.has('is_vote') && mapFields.get('is_vote') === 'true') {
        result.is_vote = true;

        // Parse vote options if present
        const optionCount = parseInt(mapFields.get('vote_options_count') || '0');
        for (let i = 0; i < optionCount; i++) {
          const prefix = `vote_option_${i}_`;
          
          if (!mapFields.has(`${prefix}content`)) continue;

          const voteOption: VoteOption = {
            txid: `${tx.id}_option_${i}`, // Generate unique ID for vote option
            post_txid: tx.id,
            content: mapFields.get(`${prefix}content`)!,
            author_address: tx.addresses[0],
            created_at: new Date(),
            lock_amount: parseInt(mapFields.get(`${prefix}lock_amount`) || '0'),
            lock_duration: parseInt(mapFields.get(`${prefix}lock_duration`) || '0'),
            unlock_height: parseInt(mapFields.get(`${prefix}unlock_height`) || '0'),
            current_height: tx.block_height,
            lock_percentage: parseFloat(mapFields.get(`${prefix}lock_percentage`) || '0'),
            tags: []
          };

          // Parse vote option tags if present
          try {
            if (mapFields.has(`${prefix}tags`)) {
              voteOption.tags = JSON.parse(mapFields.get(`${prefix}tags`)!);
            }
          } catch (e) {
            console.error('Error parsing vote option tags:', e);
          }

          result.vote_options.push(voteOption);
        }
      }
    }

    return result;
  } catch (error) {
    console.error('Error parsing MAP transaction:', error);
    return null;
  }
} 
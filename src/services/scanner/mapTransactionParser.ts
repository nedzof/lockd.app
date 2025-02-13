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
  block_time?: number;
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
  created_at: Date;
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
      vote_options: [],
      created_at: tx.block_time ? new Date(tx.block_time * 1000) : new Date()
    };

    // Process each output for MAP data
    for (const output of tx.outputs || []) {
      if (!output.script?.asm) continue;

      const scriptData = output.script.asm;
      
      // Extract MAP fields with proper type handling
      console.log('🔍 Processing script ASM data:', scriptData.substring(0, 200) + '...');
      const mapFields = new Map<string, string | number | boolean>();
      const matches = scriptData.matchAll(/(MAP_)([A-Z_]+)=([^|]+)/gi);
      for (const match of Array.from(matches)) {
        const [_, prefix, key, value] = match;
        const normalizedKey = key.toLowerCase();
        console.log(`📝 Found MAP field: ${normalizedKey} = ${value}`);
        
        // Handle special fields with type conversion
        switch(normalizedKey) {
          case 'lock_amount':
          case 'lock_duration':
          case 'unlock_height':
          case 'current_height':
            const numValue = parseInt(value) || 0;
            console.log(`🔢 Converting ${normalizedKey} to number:`, numValue);
            mapFields.set(normalizedKey, numValue);
            break;
          case 'is_vote':
          case 'is_vote_question':
            const boolValue = value.toLowerCase() === 'true';
            console.log(`✅ Converting ${normalizedKey} to boolean:`, boolValue);
            mapFields.set(normalizedKey, boolValue);
            break;
          case 'lock_percentage':
            const floatValue = parseFloat(value) || 0;
            console.log(`🔢 Converting ${normalizedKey} to float:`, floatValue);
            mapFields.set(normalizedKey, floatValue);
            break;
          default:
            console.log(`📄 Setting ${normalizedKey} as string:`, value);
            mapFields.set(normalizedKey, value);
        }
      }

      // Log all collected MAP fields
      console.log('📋 All collected MAP fields:');
      mapFields.forEach((value, key) => {
        console.log(`- ${key}: ${value} (${typeof value})`);
      });

      // Process image data if present
      if (output.script.hex) {
        console.log('🔍 Processing potential image data from hex script...');
        const buffer = Buffer.from(output.script.hex, 'hex');
        const content = buffer.toString('utf8');
        console.log('📄 Decoded content length:', content.length);
        console.log('📄 First 200 chars of content:', content.substring(0, 200));
        
        // Look for image data in the raw content first
        let imageData = '';
        let format = '';
        
        // Try base64 pattern first
        const base64Match = content.match(/data:image\/(\w+);base64,([^"]+)/);
        if (base64Match) {
          console.log('📄 Found base64 encoded image in raw data');
          format = base64Match[1].toLowerCase();
          imageData = base64Match[2];
        } 
        // Try content field from MAP data
        else if (mapFields.get('content')) {
          console.log('📄 Checking MAP content field for image data');
          const contentData = mapFields.get('content') as string;
          const contentBase64Match = contentData.match(/data:image\/(\w+);base64,([^"]+)/);
          if (contentBase64Match) {
            console.log('📄 Found base64 encoded image in MAP content');
            format = contentBase64Match[1].toLowerCase();
            imageData = contentBase64Match[2];
          }
        }
        
        // If we found image data, set the result fields
        if (imageData) {
          console.log('📊 Found image data! Length:', imageData.length);
          console.log('🎨 Image format:', format);
          result.media_type = `image/${format}`;
          result.raw_image_data = imageData;
          result.image_format = format;
        } else {
          console.log('❌ No base64 encoded image found in raw data or MAP content');
        }

        // Check for image URLs (as fallback)
        if (!result.raw_image_data) {
          const urlMatch = content.match(/https?:\/\/[^\s"]+\.(jpg|jpeg|png|gif|webp)/i);
          if (urlMatch && !result.image_source) {
            console.log('🔗 Found image URL as fallback!');
            console.log('🔗 URL:', urlMatch[0]);
            console.log('🎨 Image format:', urlMatch[1].toLowerCase());
            result.image_source = urlMatch[0];
            result.image_format = urlMatch[1].toLowerCase();
            result.media_type = `image/${result.image_format}`;
          } else {
            console.log('❌ No image URL found in content');
          }
        }

        // Log final image detection results
        console.log('🖼️ Final image detection results:');
        console.log('- media_type:', result.media_type);
        console.log('- image_format:', result.image_format);
        console.log('- has_raw_data:', !!result.raw_image_data);
        console.log('- image_source:', result.image_source);
      } else {
        console.log('❌ No hex script found in output');
      }

      // Handle author address from MAP data first, fallback to transaction
      const authorFromMap = mapFields.get('author');
      if (typeof authorFromMap === 'string') {
        result.author_address = authorFromMap;
      }

      // Extract main content and metadata
      const content = mapFields.get('content');
      if (typeof content === 'string') {
        result.content = content;
      }

      // Handle tags
      const tags = mapFields.get('tags');
      if (typeof tags === 'string') {
        try {
          result.tags = JSON.parse(tags);
        } catch (e) {
          console.error('Error parsing tags:', e);
        }
      }

      // Handle metadata
      const metadata = mapFields.get('metadata');
      if (typeof metadata === 'string') {
        try {
          result.metadata = JSON.parse(metadata);
        } catch (e) {
          console.error('Error parsing metadata:', e);
        }
      }

      // Handle lock information
      const lockDuration = mapFields.get('lock_duration');
      if (typeof lockDuration === 'number') {
        result.lock_duration = lockDuration;
        result.is_locked = true;
      }

      const unlockHeight = mapFields.get('unlock_height');
      if (typeof unlockHeight === 'number') {
        result.unlock_height = unlockHeight;
      }

      // Handle vote-specific fields
      const isVote = mapFields.get('is_vote') === true || 
                    mapFields.get('type') === 'vote_question' ||
                    mapFields.get('type') === 'vote_option_text' ||
                    mapFields.get('type') === 'vote_option_lock';
                    
      if (isVote) {
        console.log('🗳️ Found vote-related transaction!');
        result.is_vote = true;

        // Get question content
        const questionContent = mapFields.get('question_content');
        if (typeof questionContent === 'string') {
          console.log('📝 Vote question content:', questionContent);
          result.content = questionContent;
        }

        // Parse vote options
        const optionCount = typeof mapFields.get('vote_options_count') === 'number' 
          ? mapFields.get('vote_options_count') as number 
          : 0;

        console.log('🔢 Vote options count:', optionCount);

        // Handle vote option from current output
        const optionIndex = mapFields.get('vote_option_index');
        if (typeof optionIndex === 'number' || typeof optionIndex === 'string') {
          const index = parseInt(optionIndex.toString());
          console.log('🔍 Processing vote option index:', index);
          
          const voteOption: VoteOption = {
            txid: `${tx.id}:vote_option:${index}`,
            post_txid: tx.id,
            content: typeof mapFields.get('content') === 'string' ? mapFields.get('content') as string : '',
            author_address: result.author_address,
            created_at: result.created_at,
            lock_amount: typeof mapFields.get('lock_amount') === 'number' 
              ? mapFields.get('lock_amount') as number 
              : 0,
            lock_duration: typeof mapFields.get('lock_duration') === 'number'
              ? mapFields.get('lock_duration') as number
              : 0,
            unlock_height: typeof mapFields.get('unlock_height') === 'number'
              ? mapFields.get('unlock_height') as number
              : 0,
            current_height: tx.block_height,
            lock_percentage: typeof mapFields.get('lock_percentage') === 'number'
              ? mapFields.get('lock_percentage') as number
              : 0,
            tags: []
          };

          // Parse vote option tags
          const optionTags = mapFields.get('tags');
          if (typeof optionTags === 'string') {
            try {
              voteOption.tags = JSON.parse(optionTags);
              console.log('🏷️ Vote option tags:', voteOption.tags);
            } catch (e) {
              console.error('Error parsing vote option tags:', e);
            }
          }

          console.log('✅ Adding vote option:', voteOption);
          result.vote_options.push(voteOption);
        }

        // Log vote-related fields
        console.log('🗳️ Vote detection results:');
        console.log('- is_vote:', result.is_vote);
        console.log('- content:', result.content);
        console.log('- vote_options:', result.vote_options.length);
      }
    }

    return result;
  } catch (error) {
    console.error('Error parsing MAP transaction:', error);
    return null;
  }
} 
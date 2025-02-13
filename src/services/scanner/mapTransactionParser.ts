import { JungleBusTransaction } from 'junglebus';

export interface ParsedTransaction {
  type: 'content' | 'vote' | 'image' | 'mixed';
  author: string;
  content: string;
  postId: string;
  timestamp: string;
  image?: {
    fileName: string;
    fileSize: number;
    mimeType: string;
    base64Data?: string;
  };
  vote?: {
    optionsCount: number;
    totalLockAmount: number;
    options: Array<{
      text: string;
      index: number;
      lockAmount: number;
      lockDuration: number;
      unlockHeight: number;
      currentHeight: number;
      lockPercentage: number;
    }>;
  };
  lock?: {
    isLocked: boolean;
    amount: number;
    duration: number;
    unlockHeight: number;
    currentHeight: number;
  };
  metadata: {
    version: string;
    totalOutputs: number;
    app: string;
  };
}

export function parseMapTransaction(data: string[]): ParsedTransaction {
  // Helper function to get MAP value
  const getValue = (prefix: string): string | undefined => 
    data.find(d => d.startsWith(`${prefix}=`))?.split('=')[1];
  
  // Helper function to get number value
  const getNumberValue = (prefix: string): number | undefined => {
    const value = getValue(prefix);
    return value ? parseInt(value, 10) : undefined;
  };

  // Basic metadata
  const result: ParsedTransaction = {
    type: 'content',
    author: getValue('map_author') || '',
    content: getValue('content') || '',
    postId: getValue('map_post_id') || '',
    timestamp: getValue('timestamp') || new Date().toISOString(),
    metadata: {
      version: getValue('version') || '1.0.0',
      totalOutputs: getNumberValue('map_total_outputs') || 1,
      app: getValue('app') || 'lockd.app'
    }
  };

  // Check for image
  const hasImage = data.includes('map_type=image');
  if (hasImage) {
    result.type = result.type === 'content' ? 'image' : 'mixed';
    result.image = {
      fileName: getValue('map_file_name') || '',
      fileSize: getNumberValue('map_file_size') || 0,
      mimeType: getValue('map_content_type') || 'image/png'
    };

    // Extract base64 data if available in outputs
    const imageContent = data.find(d => d.includes('CONTENT=data:'));
    if (imageContent) {
      const base64Match = imageContent.match(/base64,(.+)$/);
      if (base64Match) {
        result.image.base64Data = base64Match[1];
      }
    }
  }

  // Check for vote
  const isVote = data.includes('map_type=vote_question');
  if (isVote) {
    result.type = result.type === 'content' ? 'vote' : 'mixed';
    const optionsCount = getNumberValue('map_vote_options_count') || 0;
    const totalLock = getNumberValue('map_vote_options_total_lock') || 0;

    // Parse vote options
    const options: ParsedTransaction['vote']['options'] = [];
    for (let i = 0; i < optionsCount; i++) {
      const optionContent = data.find(d => d.startsWith(`content=`) && 
        data.some(m => m === `map_vote_option_index=${i}`));
      
      if (optionContent) {
        const optionText = optionContent.split('=')[1];
        const lockData = data.find(d => d.includes(`"optionIndex":${i}`));
        
        if (lockData) {
          try {
            const lockJson = JSON.parse(lockData.split('=')[1]);
            options.push({
              text: optionText,
              index: i,
              lockAmount: lockJson.lockAmount,
              lockDuration: lockJson.lockDuration,
              unlockHeight: lockJson.unlockHeight,
              currentHeight: lockJson.currentHeight,
              lockPercentage: parseFloat(lockJson.lockPercentage)
            });
          } catch (e) {
            console.error('Error parsing vote option lock data:', e);
          }
        }
      }
    }

    result.vote = {
      optionsCount,
      totalLockAmount: totalLock,
      options
    };
  }

  // Check for lock
  const isLocked = data.some(d => d.startsWith('map_lock_amount='));
  if (isLocked) {
    result.lock = {
      isLocked: true,
      amount: getNumberValue('map_lock_amount') || 0,
      duration: getNumberValue('map_lock_duration') || 0,
      unlockHeight: getNumberValue('map_unlock_height') || 0,
      currentHeight: getNumberValue('map_current_height') || 0
    };
  }

  return result;
}

// Example usage:
// const tx = parseMapTransaction(jungleBusTransaction.data);
// console.log(tx.type); // 'content', 'vote', 'image', or 'mixed'
// console.log(tx.image); // Image details if present
// console.log(tx.vote); // Vote details if present
// console.log(tx.lock); // Lock details if present 
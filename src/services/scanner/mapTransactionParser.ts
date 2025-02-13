import { Transaction as JungleBusTransaction } from '@gorillapool/js-junglebus';

// Core types for MAP data
interface MapMetadata {
  type: string;
  author: string;
  timestamp: string;
  version: string;
  postId: string;
  sequence: number;
  parentSequence?: number;
  app: string;
  totalOutputs: number;
}

// Vote-specific types
interface VoteOptionData {
  text: string;
  index: number;
  lockAmount: number;
  lockDuration: number;
  unlockHeight: number;
  currentHeight: number;
  lockPercentage: number;
}

interface VoteData {
  optionsCount: number;
  totalLockAmount: number;
  options: VoteOptionData[];
  questionContent: string;
}

// Image-specific types
interface ImageData {
  fileName: string;
  fileSize: number;
  mimeType: string;
  base64Data?: string;
  source: 'upload' | 'transaction';
}

// Lock data type
interface LockData {
  isLocked: boolean;
  amount: number;
  duration: number;
  unlockHeight: number;
  currentHeight: number;
}

// Main parsed transaction type
export interface ParsedTransaction {
  type: 'content' | 'vote' | 'image' | 'mixed';
  author: string;
  content: string;
  postId: string;
  timestamp: string;
  description: string;
  tags: string[];
  image?: ImageData;
  vote?: VoteData;
  lock?: LockData;
  metadata: MapMetadata;
}

// Helper function to clean content
function cleanContent(content: string): string {
  if (!content) return '';
  return content.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
}

// Helper function to parse number values safely
function parseNumberValue(value: string | undefined): number {
  if (!value) return 0;
  const num = parseInt(value, 10);
  return isNaN(num) ? 0 : num;
}

// Helper function to get MAP value from data array
function getMapValue(data: string[], key: string): string | undefined {
  const lowercaseKey = key.toLowerCase();
  const entry = data.find(d => 
    d.toLowerCase().startsWith(`map_${lowercaseKey}=`) || 
    d.toLowerCase().startsWith(`${lowercaseKey}=`)
  );
  if (!entry) return undefined;
  return entry.substring(entry.indexOf('=') + 1).trim();
}

// Helper function to parse vote options
function parseVoteOptions(data: string[], content: string): VoteData | undefined {
  const optionsCount = parseNumberValue(getMapValue(data, 'vote_options_count'));
  if (!optionsCount) return undefined;

  const options: VoteOptionData[] = [];
  for (let i = 0; i < optionsCount; i++) {
    // Find option text
    const optionText = data.find(d => {
      const isOptionText = d.toLowerCase().includes(`map_type=vote_option_text`) ||
                          d.toLowerCase().includes(`type=vote_option_text`);
      const hasIndex = d.toLowerCase().includes(`option_index=${i}`);
      return isOptionText && hasIndex;
    });

    // Find option lock data
    const lockData = data.find(d => {
      const isLockData = d.toLowerCase().includes(`map_type=vote_option_lock`) ||
                        d.toLowerCase().includes(`type=vote_option_lock`);
      const hasIndex = d.toLowerCase().includes(`option_index=${i}`);
      return isLockData && hasIndex;
    });

    if (optionText && lockData) {
      try {
        const lockJson = JSON.parse(lockData.substring(lockData.indexOf('{')));
        options.push({
          text: cleanContent(optionText.substring(optionText.indexOf('=') + 1)),
          index: i,
          lockAmount: parseNumberValue(lockJson.lockAmount || lockJson.MAP_LOCK_AMOUNT),
          lockDuration: parseNumberValue(lockJson.lockDuration || lockJson.MAP_LOCK_DURATION),
          unlockHeight: parseNumberValue(lockJson.unlockHeight || lockJson.MAP_UNLOCK_HEIGHT),
          currentHeight: parseNumberValue(lockJson.currentHeight || lockJson.MAP_CURRENT_HEIGHT),
          lockPercentage: parseFloat(lockJson.lockPercentage || lockJson.MAP_LOCK_PERCENTAGE || '0')
        });
      } catch (e) {
        console.error('Error parsing vote option:', e);
      }
    }
  }

  return {
    optionsCount,
    totalLockAmount: options.reduce((sum, opt) => sum + opt.lockAmount, 0),
    options,
    questionContent: content
  };
}

// Helper function to parse image data
function parseImageData(data: string[]): ImageData | undefined {
  const mimeType = getMapValue(data, 'content_type');
  if (!mimeType?.startsWith('image/')) return undefined;

  const base64Data = data.find(d => d.includes('CONTENT=data:'))?.match(/base64,(.+)$/)?.[1];
  
  return {
    fileName: getMapValue(data, 'file_name') || '',
    fileSize: parseNumberValue(getMapValue(data, 'file_size')),
    mimeType,
    base64Data,
    source: base64Data ? 'upload' : 'transaction'
  };
}

// Helper function to parse lock data
function parseLockData(data: string[]): LockData | undefined {
  const lockAmount = parseNumberValue(getMapValue(data, 'lock_amount'));
  if (!lockAmount) return undefined;

  return {
    isLocked: true,
    amount: lockAmount,
    duration: parseNumberValue(getMapValue(data, 'lock_duration')),
    unlockHeight: parseNumberValue(getMapValue(data, 'unlock_height')),
    currentHeight: parseNumberValue(getMapValue(data, 'current_height'))
  };
}

// Main parsing function
export function parseMapTransaction(data: string[]): ParsedTransaction {
  // Parse basic metadata
  const metadata: MapMetadata = {
    type: getMapValue(data, 'type') || 'content',
    author: getMapValue(data, 'author') || '',
    timestamp: getMapValue(data, 'timestamp') || new Date().toISOString(),
    version: getMapValue(data, 'version') || '1.0.0',
    postId: getMapValue(data, 'post_id') || '',
    sequence: parseNumberValue(getMapValue(data, 'sequence')),
    parentSequence: parseNumberValue(getMapValue(data, 'parent_sequence')),
    app: getMapValue(data, 'app') || 'lockd.app',
    totalOutputs: parseNumberValue(getMapValue(data, 'total_outputs'))
  };

  // Get base content
  const content = cleanContent(data.find(d => d.startsWith('content='))?.substring(8) || '');
  
  // Initialize result
  const result: ParsedTransaction = {
    type: 'content',
    author: metadata.author,
    content,
    postId: metadata.postId,
    timestamp: metadata.timestamp,
    description: getMapValue(data, 'description') || '',
    tags: JSON.parse(getMapValue(data, 'tags') || '[]'),
    metadata
  };

  // Check for image
  const imageData = parseImageData(data);
  if (imageData) {
    result.type = result.type === 'content' ? 'image' : 'mixed';
    result.image = imageData;
  }

  // Check for vote
  const isVote = data.some(d => 
    d.toLowerCase().includes('map_type=vote_question') || 
    d.toLowerCase().includes('type=vote_question') ||
    d.toLowerCase().includes('map_is_vote_question=true')
  );

  if (isVote) {
    result.type = result.type === 'content' ? 'vote' : 'mixed';
    result.vote = parseVoteOptions(data, content);
  }

  // Check for lock
  const lockData = parseLockData(data);
  if (lockData) {
    result.lock = lockData;
  }

  return result;
}

// Export validation function
export function validateParsedTransaction(tx: ParsedTransaction): boolean {
  // Basic validation
  if (!tx.author || !tx.postId || !tx.timestamp) {
    return false;
  }

  // Vote validation
  if (tx.vote) {
    if (!tx.vote.options || tx.vote.options.length !== tx.vote.optionsCount) {
      return false;
    }

    // Each option must have valid lock data
    for (const option of tx.vote.options) {
      if (!option.text || option.lockAmount <= 0 || option.lockDuration <= 0) {
        return false;
      }
    }

    // Validate total lock amount
    const totalLock = tx.vote.options.reduce((sum, opt) => sum + opt.lockAmount, 0);
    if (totalLock !== tx.vote.totalLockAmount) {
      return false;
    }
  }

  return true;
}

// Example usage:
// const tx = parseMapTransaction(jungleBusTransaction.data);
// console.log(tx.type); // 'content', 'vote', 'image', or 'mixed'
// console.log(tx.image); // Image details if present
// console.log(tx.vote); // Vote details if present
// console.log(tx.lock); // Lock details if present 
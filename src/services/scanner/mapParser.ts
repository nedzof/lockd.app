import { 
  MapMetadata,
  ContentOutput,
  ImageOutput,
  VoteQuestionOutput,
  VoteOptionTextOutput,
  VoteOptionLockOutput,
  TagsOutput,
  ParsedPost,
  OutputType
} from './types';

interface RawMapData {
  [key: string]: string;
}

interface TransactionOutput {
  data: RawMapData;
  content: string;
}

export interface RawTransaction {
  id: string;
  outputs: Array<{
    data: string[];
    contexts?: string[];
  }>;
}

interface VoteOption {
  text: VoteOptionTextOutput | null;
  lock: VoteOptionLockOutput | null;
}

function parseMapMetadata(data: RawMapData): MapMetadata {
  return {
    type: data.MAP_TYPE,
    contentType: data.MAP_CONTENT_TYPE,
    postId: data.MAP_POST_ID,
    sequence: parseInt(data.MAP_SEQUENCE),
    parentSequence: data.MAP_PARENT_SEQUENCE ? parseInt(data.MAP_PARENT_SEQUENCE) : undefined,
    timestamp: data.MAP_TIMESTAMP,
    version: data.MAP_VERSION,
    author: data.MAP_AUTHOR,
    description: data.MAP_DESCRIPTION,
    totalOutputs: data.MAP_TOTAL_OUTPUTS ? parseInt(data.MAP_TOTAL_OUTPUTS) : undefined
  };
}

function parseContentOutput(data: RawMapData, content: string): ContentOutput {
  const base = parseMapMetadata(data);
  const output: ContentOutput = {
    ...base,
    content
  };

  if (data.MAP_LOCK_DURATION) {
    output.lockDuration = parseInt(data.MAP_LOCK_DURATION);
    output.lockAmount = parseInt(data.MAP_LOCK_AMOUNT);
    output.unlockHeight = parseInt(data.MAP_UNLOCK_HEIGHT);
  }

  if (data.MAP_PREDICTION_DATA) {
    output.predictionData = JSON.parse(data.MAP_PREDICTION_DATA);
  }

  return output;
}

function parseImageOutput(data: RawMapData): ImageOutput {
  const base = parseMapMetadata(data);
  return {
    ...base,
    fileName: data.MAP_FILE_NAME,
    fileSize: parseInt(data.MAP_FILE_SIZE)
  };
}

function parseVoteQuestionOutput(data: RawMapData, content: string): VoteQuestionOutput {
  const base = parseMapMetadata(data);
  return {
    ...base,
    question: content,
    optionsCount: parseInt(data.MAP_VOTE_OPTIONS_COUNT),
    totalLockAmount: parseInt(data.MAP_VOTE_OPTIONS_TOTAL_LOCK)
  };
}

function parseVoteOptionTextOutput(data: RawMapData, content: string): VoteOptionTextOutput {
  const base = parseMapMetadata(data);
  return {
    ...base,
    optionText: content,
    optionIndex: parseInt(data.MAP_VOTE_OPTION_INDEX),
    questionContent: data.MAP_QUESTION_CONTENT
  };
}

function parseVoteOptionLockOutput(data: RawMapData): VoteOptionLockOutput {
  const base = parseMapMetadata(data);
  return {
    ...base,
    optionIndex: parseInt(data.MAP_VOTE_OPTION_INDEX),
    lockDuration: parseInt(data.MAP_LOCK_DURATION),
    lockAmount: parseInt(data.MAP_LOCK_AMOUNT),
    currentHeight: parseInt(data.MAP_CURRENT_HEIGHT),
    unlockHeight: parseInt(data.MAP_UNLOCK_HEIGHT),
    lockPercentage: parseFloat(data.MAP_LOCK_PERCENTAGE)
  };
}

function parseTagsOutput(data: RawMapData, content: string): TagsOutput {
  const base = parseMapMetadata(data);
  return {
    ...base,
    tags: JSON.parse(content),
    tagsCount: parseInt(data.MAP_TAGS_COUNT)
  };
}

function extractMapData(data: string[]): RawMapData {
  const mapData: RawMapData = {};
  
  data.forEach(item => {
    // Handle MAP protocol entries
    if (item.startsWith('map_')) {
      const [key, value] = item.split('=');
      mapData[key.toUpperCase()] = value;
    }
    // Handle content field
    else if (item.startsWith('content=')) {
      mapData['CONTENT'] = item.substring('content='.length);
    }
  });

  return mapData;
}

export function convertTransactionToOutputs(tx: RawTransaction): TransactionOutput[] {
  return tx.outputs
    .filter(output => output.contexts?.includes('1PuQa7K62MiKCtssSLKy1kh56WWU7MtUR5'))
    .map(output => {
      const mapData = extractMapData(output.data);
      return {
        data: mapData,
        content: mapData.CONTENT || ''
      };
    });
}

export function parseMapTransaction(txid: string, outputs: TransactionOutput[]): ParsedPost {
  const result: ParsedPost = {
    txid,
    createdAt: new Date().toISOString(),
    content: null as any,
    voteOptions: []
  };

  const voteOptionsMap = new Map<number, VoteOption>();

  // First pass: Parse all outputs
  const parsedOutputs = outputs.map(output => {
    const type = output.data.MAP_TYPE as OutputType;
    switch (type) {
      case 'content':
        return parseContentOutput(output.data, output.content);
      case 'image':
        return parseImageOutput(output.data);
      case 'vote_question':
        return parseVoteQuestionOutput(output.data, output.content);
      case 'vote_option_text':
        return parseVoteOptionTextOutput(output.data, output.content);
      case 'vote_option_lock':
        return parseVoteOptionLockOutput(output.data);
      case 'tags':
        return parseTagsOutput(output.data, output.content);
      default:
        throw new Error(`Unknown output type: ${type}`);
    }
  });

  // Second pass: Organize outputs
  parsedOutputs.forEach(output => {
    switch (output.type) {
      case 'content':
        result.content = output as ContentOutput;
        break;
      case 'image':
        result.image = output as ImageOutput;
        break;
      case 'vote_question':
        result.voteQuestion = output as VoteQuestionOutput;
        break;
      case 'vote_option_text': {
        const textOutput = output as VoteOptionTextOutput;
        const index = textOutput.optionIndex;
        let option = voteOptionsMap.get(index);
        if (!option) {
          option = { text: null, lock: null };
          voteOptionsMap.set(index, option);
        }
        option.text = textOutput;
        break;
      }
      case 'vote_option_lock': {
        const lockOutput = output as VoteOptionLockOutput;
        const index = lockOutput.optionIndex;
        let option = voteOptionsMap.get(index);
        if (!option) {
          option = { text: null, lock: null };
          voteOptionsMap.set(index, option);
        }
        option.lock = lockOutput;
        break;
      }
      case 'tags':
        result.tags = output as TagsOutput;
        break;
    }
  });

  // Convert vote options map to array
  if (voteOptionsMap.size > 0) {
    result.voteOptions = Array.from(voteOptionsMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([_, option]) => option as { text: VoteOptionTextOutput; lock: VoteOptionLockOutput });
  }

  // Set creation time from content timestamp
  result.createdAt = result.content.timestamp;

  return result;
}

export function validateParsedPost(post: ParsedPost): boolean {
  // Basic validation
  if (!post.content || !post.txid || !post.createdAt) {
    return false;
  }

  // Vote validation
  if (post.voteQuestion) {
    // Must have matching number of options
    if (!post.voteOptions || post.voteOptions.length !== post.voteQuestion.optionsCount) {
      return false;
    }

    // Each option must have both text and lock data
    for (const option of post.voteOptions) {
      if (!option.text || !option.lock) {
        return false;
      }
    }

    // Validate total lock amount
    const totalLock = post.voteOptions.reduce((sum, opt) => sum + opt.lock.lockAmount, 0);
    if (totalLock !== post.voteQuestion.totalLockAmount) {
      return false;
    }
  }

  // Tags validation
  if (post.tags && post.tags.tags.length !== post.tags.tagsCount) {
    return false;
  }

  return true;
}

/* Usage example:

const tx = {
  id: "txid123",
  outputs: [
    {
      data: [
        "map_type=content",
        "map_content_type=text/plain",
        "content=Hello World",
        // ... other MAP fields
      ],
      contexts: ["1PuQa7K62MiKCtssSLKy1kh56WWU7MtUR5"]
    }
    // ... other outputs
  ]
};

const outputs = convertTransactionToOutputs(tx);
const parsedPost = parseMapTransaction(tx.id, outputs);
const isValid = validateParsedPost(parsedPost);

*/ 
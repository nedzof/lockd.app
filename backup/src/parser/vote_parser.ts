/**
 * VoteParser: Specialized parser for vote-related content in transactions
 * 
 * This class is responsible for processing vote data from transactions, with a focus on:
 * 1. Identifying vote transactions
 * 2. Extracting vote questions and options
 * 3. Validating vote data structure and integrity
 * 4. Generating consistent vote data format for further processing
 * 5. Extracting vote metadata (post_id, timestamp, etc.)
 * 
 * This parser centralizes all vote-related functionality in one place to maintain
 * clear separation of concerns from other parsers.
 */
import { BaseParser } from './base_parser.js';
import { extract_vote_data } from './utils/helpers.js';

export class VoteParser extends BaseParser {
    constructor() {
        super();
    }
    
    /**
     * Check if a transaction is a vote transaction from raw data array
     * This method is the single point of determination for vote transactions
     * 
     * @param txData Raw transaction data array
     * @returns True if it's a vote transaction
     */
    public is_vote_transaction(txData: string[]): boolean {
        if (!Array.isArray(txData) || txData.length === 0) return false;
        
        try {
            // Log the txData for debugging
            this.logInfo('Checking for vote transaction', {
                data_length: txData.length,
                data_sample: txData.slice(0, 3)
            });
            
            // Define all vote-related indicators in one place for consistency
            const voteKeywords = [
                'vote=', 'vote_question=', 'vote_option', 'poll=', 'poll_question=',
                'options_hash=', 'vote_hash=', 'is_vote=', 'vote_options=', 'question='
            ];
            
            // Enhanced vote options detection
            let hasVoteOptions = false;
            let hasVoteIndicator = false;
            
            // Look for direct vote keywords in any field
            for (const item of txData) {
                if (typeof item !== 'string') continue;
                
                const lowerItem = item.toLowerCase();
                
                // Check for is_vote=true explicitly
                if (lowerItem === 'is_vote=true' || lowerItem === 'vote=true' || lowerItem === 'poll=true') {
                    this.logInfo('Found explicit vote indicator', { indicator: lowerItem });
                    return true;
                }
                
                // Check for vote options arrays
                if (lowerItem.startsWith('vote_options=') || lowerItem.startsWith('options=')) {
                    hasVoteOptions = true;
                    this.logInfo('Found vote options', { item: lowerItem });
                }
                
                // Check for other vote keywords
                for (const keyword of voteKeywords) {
                    if (lowerItem.startsWith(keyword)) {
                        hasVoteIndicator = true;
                        this.logInfo(`Found vote keyword: ${keyword}`, { item: lowerItem });
                        
                        // If we have both indicators, it's definitely a vote
                        if (hasVoteOptions && hasVoteIndicator) {
                            return true;
                        }
                    }
                }
            }
            
            // If we have vote options, that's a strong indicator
            if (hasVoteOptions) {
                return true;
            }
            
            // Check content fields for vote-related terminology
            const contentItems = txData.filter(item => 
                typeof item === 'string' && item.toLowerCase().startsWith('content='));
            
            for (const contentItem of contentItems) {
                const content = contentItem.substring(8).toLowerCase();
                
                // More comprehensive check for vote-related terminology
                if ((content.includes('vote') || content.includes('poll') || content.includes('question'))  && 
                    (content.includes('option') || content.includes('choice') || 
                     content.includes('ballot') || content.includes('election') || 
                     content.includes('yes') || content.includes('no'))) {
                    
                    this.logInfo('Found vote-related keywords in content', { content_preview: content.substring(0, 50) });
                    return true;
                }
                
                // Look for question mark patterns with options
                if (content.includes('?') && 
                    (content.includes('option') || content.includes('choices') || 
                     (content.includes('yes') && content.includes('no')))) {
                    
                    this.logInfo('Found question with options pattern', { content_preview: content.substring(0, 50) });
                    return true;
                }
            }
            
            // If we have a vote indicator, treat as vote even without options
            if (hasVoteIndicator) {
                return true;
            }
            
            return false;
        } catch (error) {
            this.logError('Error checking if transaction is vote', { 
                error: error instanceof Error ? error.message : String(error) 
            });
            return false;
        }
    }
    
    /**
     * Extract rich vote content and metadata from transaction data
     * 
     * This method performs specialized extraction of vote-related content including:
     * 1. Vote question extraction (with formatting preserved)
     * 2. Vote options with proper ordering
     * 3. Vote metadata (post_id, timestamp, creator, etc.)
     * 4. Protocol-specific vote data
     * 
     * @param txData Transaction data array
     * @returns Detailed vote content with metadata
     */
    public extractVoteContent(txData: string[]): {
        question: string;
        options: string[];
        post_id?: string;
        timestamp?: string;
        creator?: string;
        metadata: Record<string, any>;
    } {
        try {
            // Default result structure
            const result = {
                question: '',
                options: [] as string[],
                metadata: {} as Record<string, any>
            };
            
            if (!Array.isArray(txData) || txData.length === 0) {
                return result;
            }
            
            this.logDebug('Extracting vote content', { data_length: txData.length });
            
            // Extract question - look for explicit vote_question field first
            const questionFields = txData.filter(item => 
                typeof item === 'string' && 
                (item.startsWith('vote_question=') || item.startsWith('poll_question=')));
                
            if (questionFields.length > 0) {
                // Get the first question field
                const questionField = questionFields[0];
                result.question = questionField.includes('=') ? 
                    questionField.substring(questionField.indexOf('=') + 1) : '';
            }
            
            // If no explicit question field, look for vote= field that might contain the question
            if (!result.question) {
                const voteFields = txData.filter(item => 
                    typeof item === 'string' && item.startsWith('vote='));
                    
                if (voteFields.length > 0) {
                    result.question = voteFields[0].substring(5);
                }
            }
            
            // If still no question, try to extract from content fields
            if (!result.question) {
                const contentFields = txData.filter(item => 
                    typeof item === 'string' && item.startsWith('content='));
                    
                if (contentFields.length > 0) {
                    const content = contentFields[0].substring(8);
                    // If content contains 'vote' or 'poll', use it as the question
                    if (content.toLowerCase().includes('vote') || 
                        content.toLowerCase().includes('poll')) {
                        result.question = content;
                    }
                }
            }
            
            // Extract options - look for vote_option or option fields
            const optionPattern = /^(vote_option\d*|option\d*)=(.*)$/i;
            const optionFields = txData.filter(item => 
                typeof item === 'string' && 
                (item.match(optionPattern) || item.startsWith('option=')));
                
            if (optionFields.length > 0) {
                // Extract option values and try to order them if they have numbers
                const optionsMap: Record<string, string> = {};
                
                optionFields.forEach(field => {
                    const match = field.match(optionPattern);
                    if (match) {
                        const key = match[1].toLowerCase();
                        const value = match[2];
                        optionsMap[key] = value;
                    } else if (field.startsWith('option=')) {
                        // For simple option= fields without numbers
                        result.options.push(field.substring(7));
                    }
                });
                
                // Try to order options by their numeric suffix if present
                if (Object.keys(optionsMap).length > 0) {
                    // Create ordered options array
                    const orderedOptions: { index: number; value: string }[] = [];
                    
                    Object.entries(optionsMap).forEach(([key, value]) => {
                        const numMatch = key.match(/(\d+)$/); 
                        if (numMatch) {
                            const index = parseInt(numMatch[1], 10);
                            orderedOptions.push({ index, value });
                        } else {
                            // If no number, add to the end
                            orderedOptions.push({ index: 999, value });
                        }
                    });
                    
                    // Sort by index and add to result
                    orderedOptions.sort((a, b) => a.index - b.index);
                    const sortedOptions = orderedOptions.map(item => item.value);
                    result.options = [...result.options, ...sortedOptions];
                }
            }
            
            // Extract metadata
            txData.forEach(item => {
                if (typeof item !== 'string') return;
                
                // Extract post_id if present
                if (item.startsWith('post_id=')) {
                    result.post_id = item.substring(8);
                    result.metadata.post_id = item.substring(8);
                }
                
                // Extract timestamp
                else if (item.startsWith('timestamp=')) {
                    result.timestamp = item.substring(10);
                    result.metadata.timestamp = item.substring(10);
                }
                
                // Extract creator/author
                else if (item.startsWith('creator=') || item.startsWith('author=')) {
                    const prefix = item.startsWith('creator=') ? 'creator=' : 'author=';
                    result.creator = item.substring(prefix.length);
                    result.metadata.creator = item.substring(prefix.length);
                }
                
                // Extract any other metadata fields
                else if (item.includes('=')) {
                    const [key, value] = item.split('=');
                    if (key && value && !['content', 'vote_question', 'vote_option'].includes(key)) {
                        result.metadata[key] = value;
                    }
                }
            });
            
            return result;
        } catch (error) {
            this.logError('Error extracting vote content', {
                error: error instanceof Error ? error.message : String(error)
            });
            return {
                question: '',
                options: [],
                metadata: {}
            };
        }
    }
    /**
     * Extract and process vote data from transaction content
     * 
     * This method coordinates the vote data extraction process by:
     * 1. First checking if this is a vote transaction
     * 2. Using extractVoteContent for detailed extraction
     * 3. Validating the extracted data structure
     * 4. Normalizing the results into a consistent format
     * 
     * @param data Array of data strings from transaction
     * @returns Processed vote data object with normalized structure
     */
    public process_vote_data(data: string[]): {
        is_vote: boolean;
        question?: string;
        options?: string[];
        total_options?: number;
        options_hash?: string;
        post_id?: string;
        timestamp?: string;
        [key: string]: any; // For additional metadata
    } {
        if (!Array.isArray(data) || data.length === 0) {
            this.logWarn('Invalid or empty data array provided to process_vote_data');
            return { is_vote: false };
        }

        try {
            // First check if this is a vote transaction
            if (!this.is_vote_transaction(data)) {
                return { is_vote: false };
            }
            
            this.logDebug('Processing vote data', {
                data_length: data.length,
                first_items: data.slice(0, 3).map(item => 
                    typeof item === 'string' ? 
                        (item.length > 20 ? `${item.substring(0, 20)}...` : item) : 
                        typeof item
                )
            });
            
            // Use our specialized extraction method to get detailed vote content
            const voteContent = this.extractVoteContent(data);
            
            // Build a normalized result structure with is_vote flag
            const result: {
                is_vote: boolean;
                question?: string;
                options?: string[];
                total_options?: number;
                options_hash?: string;
                post_id?: string;
                timestamp?: string;
                [key: string]: any;
            } = {
                is_vote: true
            };
            
            // Add primary vote data
            if (voteContent.question) {
                result.question = voteContent.question;
            }
            
            if (voteContent.options && voteContent.options.length > 0) {
                result.options = voteContent.options;
                result.total_options = voteContent.options.length;
            }
            
            // Add metadata fields
            if (voteContent.post_id) result.post_id = voteContent.post_id;
            if (voteContent.timestamp) result.timestamp = voteContent.timestamp;
            
            // Look for options hash
            const hashField = data.find(item => 
                typeof item === 'string' && 
                (item.startsWith('options_hash=') || item.startsWith('vote_hash=')));
                
            if (hashField) {
                const hashValue = hashField.split('=')[1];
                if (hashValue) {
                    result.options_hash = hashValue;
                }
            }
            
            // Log the extracted vote data
            this.logDebug('Processed vote data', {
                is_vote: true,
                has_question: !!result.question,
                options_count: result.options?.length || 0,
                has_options_hash: !!result.options_hash
            });
            
            // Validate the vote data
            const validationResult = this.validate_vote_data(result);
            if (!validationResult.valid) {
                this.logWarn('Vote data validation failed', {
                    errors: validationResult.errors
                });
            }
            
            return result;
        } catch (error) {
            this.logError('Error processing vote data', {
                error: error instanceof Error ? error.message : String(error)
            });
            return { is_vote: false };
        }
    }
    
    /**
     * Validate vote data structure and content integrity
     * 
     * Performs comprehensive validation including:
     * - Checking for required fields (question, options)
     * - Validating option count consistency
     * - Identifying empty or invalid options
     * - Verifying options hash when available
     * 
     * @param voteData The vote data to validate
     * @returns Object with validation results and detailed error messages
     */
    public validate_vote_data(voteData: {
        is_vote: boolean;
        question?: string;
        options?: string[];
        total_options?: number;
        options_hash?: string;
    }): { valid: boolean; errors: string[] } {
        const result = { valid: true, errors: [] as string[] };
        
        if (!voteData.is_vote) {
            result.valid = false;
            result.errors.push('Not a vote transaction');
            return result;
        }
        
        if (!voteData.question) {
            result.valid = false;
            result.errors.push('Missing vote question');
        }
        
        if (!voteData.options || voteData.options.length === 0) {
            result.valid = false;
            result.errors.push('Missing vote options');
        } else {
            // Check for empty options
            const emptyOptions = voteData.options.filter(opt => !opt || opt.trim() === '');
            if (emptyOptions.length > 0) {
                result.valid = false;
                result.errors.push(`Found ${emptyOptions.length} empty vote options`);
            }
            
            // Check if total_options matches actual options length
            if (voteData.total_options !== undefined && 
                voteData.total_options !== voteData.options.length) {
                result.valid = false;
                result.errors.push(`Vote total_options (${voteData.total_options}) doesn't match actual options count (${voteData.options.length})`);
            }
        }
        
        // Check options hash
        if (!voteData.options_hash && voteData.options && voteData.options.length > 0) {
            result.valid = false;
            result.errors.push('Missing options hash');
        }
        
        return result;
    }
    
    /**
     * Extract vote question and options content from a transaction
     * 
     * This method combines multiple extraction strategies:
     * 1. First uses the common extract_vote_data helper function
     * 2. Falls back to specialized parsing for non-standard vote content
     * 3. Extracts additional metadata like post_id and timestamps
     * 
     * @param txData - The transaction data array containing vote information
     * @returns Object containing vote question, options and metadata
     */
    public extractVoteContent(txData: string[]): { 
        question: string;
        options: string[];
        post_id?: string;
        timestamp?: string;
        total_options?: number;
        is_locked?: boolean;
    } {
        try {
            this.logDebug('Extracting vote content', { data_length: txData.length });
            
            // Initialize result object
            const result = {
                question: '',
                options: [] as string[],
                post_id: '',
                timestamp: '',
                total_options: 0,
                is_locked: false
            };
            
            // First use the common helper to extract basic vote data
            const voteData = extract_vote_data(txData);
            
            // If we have valid vote data from the helper, use it
            if (voteData.is_vote) {
                if (voteData.question) {
                    result.question = voteData.question;
                }
                
                if (voteData.options && voteData.options.length > 0) {
                    result.options = voteData.options;
                    result.total_options = voteData.total_options || voteData.options.length;
                }
            }
            
            // If we didn't get a question from the helper, try the specialized approach
            if (!result.question) {
                // Find the vote question (content without a number prefix)
                const questionItem = txData.find(item => 
                    item.startsWith('content=') && 
                    !item.match(/content=\d+\s/)
                );
                
                if (questionItem) {
                    result.question = questionItem.replace('content=', '');
                    this.logInfo('Found vote question using specialized method', { content: result.question });
                }
            }
            
            // If we didn't get options from the helper, try the specialized approach
            if (result.options.length === 0) {
                // Find all option contents (content with a number prefix)
                const optionItems = txData.filter(item => 
                    item.startsWith('content=') && 
                    item.match(/content=\d+\s/)
                );
                
                // Match options with their indices
                optionItems.forEach((item) => {
                    const content = item.replace('content=', '');
                    // Extract the number from the beginning of the content
                    const match = content.match(/^(\d+)\s/);
                    
                    if (match) {
                        const optionNumber = parseInt(match[1], 10);
                        // Adjust for 0-based index
                        const index = optionNumber - 1;
                        
                        if (index >= 0) {
                            result.options[index] = content;
                            this.logDebug('Found vote option using specialized method', { 
                                content,
                                index
                            });
                        }
                    }
                });
                
                // Filter out any empty options and ensure the array is dense
                result.options = result.options.filter(option => option);
                result.total_options = result.options.length;
            }
            
            // Extract additional metadata
            txData.forEach(item => {
                if (item.startsWith('postid=')) {
                    result.post_id = item.replace('postid=', '');
                } else if (item.startsWith('timestamp=') && !item.includes('.922Z')) {
                    // Only take the main timestamp, not the option timestamps
                    result.timestamp = item.replace('timestamp=', '');
                } else if (item.startsWith('is_locked=')) {
                    result.is_locked = item.replace('is_locked=', '') === 'true';
                }
            });
            
            return result;
        } catch (error) {
            this.logError('Error extracting vote content', { 
                error: error instanceof Error ? error.message : String(error),
                data_length: txData?.length || 0
            });
            return { question: '', options: [] };
        }
    }
    
    /**
     * Determine if a transaction is a vote transaction
     * 
     * @param txData Transaction data to analyze
     * @returns Boolean indicating if this is a vote transaction
     */
    public is_vote_transaction(txData: string[]): boolean {
        if (!Array.isArray(txData) || txData.length === 0) {
            return false;
        }
        
        try {
            // Check for explicit vote indicators
            const hasVoteIndicator = txData.some(item => 
                item === 'is_vote=true' || 
                item === 'type=vote' ||
                item === 'vote=true'
            );
            
            if (hasVoteIndicator) {
                this.logDebug('Found explicit vote indicator');
                return true;
            }
            
            // Check for question and numbered options pattern
            const hasQuestion = txData.some(item => 
                item.startsWith('content=') && 
                !item.match(/content=\d+\s/)
            );
            
            const hasNumberedOptions = txData.some(item => 
                item.startsWith('content=') && 
                item.match(/content=\d+\s/)
            );
            
            if (hasQuestion && hasNumberedOptions) {
                this.logDebug('Found question and numbered options pattern');
                return true;
            }
            
            // Use the helper to check for vote data
            const voteData = extract_vote_data(txData);
            return voteData.is_vote;
        } catch (error) {
            this.logError('Error checking if transaction is a vote', {
                error: error instanceof Error ? error.message : String(error)
            });
            return false;
        }
    }
}

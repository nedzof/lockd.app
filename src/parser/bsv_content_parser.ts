import { logger } from '../utils/logger.js';
import { extract_vote_data } from './utils/helpers.js';

/**
 * BSV Content Parser
 * 
 * Extracts content from BSV transactions
 */
export class BsvContentParser {
    /**
     * Extract vote question content from a transaction
     * 
     * @param txData - The transaction data array
     * @returns Object containing vote question and options
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
                    logger.info('Found vote question using specialized method', { content: result.question });
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
                            logger.debug('Found vote option using specialized method', { 
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
            logger.error('Error parsing transaction data', { 
                error: error instanceof Error ? error.message : String(error)
            });
            return { question: '', options: [] };
        }
    }
}

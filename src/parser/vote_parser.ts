/**
 * VoteParser: Specialized parser for vote-related content in transactions
 */
import { BaseParser } from './base_parser.js';
import { extract_vote_data } from './utils/helpers.js';

export class VoteParser extends BaseParser {
    /**
     * Extract and process vote data from transaction content
     * @param data Array of data strings from transaction
     * @returns Processed vote data object
     */
    public process_vote_data(data: string[]): {
        is_vote: boolean;
        question?: string;
        options?: string[];
        total_options?: number;
        options_hash?: string;
    } {
        if (!Array.isArray(data) || data.length === 0) {
            return { is_vote: false };
        }

        try {
            // Use the helper function to extract vote data
            const voteData = extract_vote_data(data);
            
            // If this is a vote, generate a hash for the options if needed
            if (voteData.is_vote && voteData.options && voteData.options.length > 0 && !voteData.options_hash) {
                const optionsString = voteData.options.join('|');
                voteData.options_hash = Buffer.from(optionsString).toString('base64');
                
                this.logInfo('Generated options hash for vote', {
                    question: voteData.question,
                    options_count: voteData.options.length,
                    options_hash: voteData.options_hash
                });
            }
            
            return voteData;
        } catch (error) {
            this.logError('Error processing vote data', {
                error: error instanceof Error ? error.message : String(error)
            });
            return { is_vote: false };
        }
    }
    
    /**
     * Validate vote data structure
     * @param voteData The vote data to validate
     * @returns Object with validation results
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
}

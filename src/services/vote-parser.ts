/**
 * Vote Parser
 * 
 * Handles parsing and processing of vote transactions
 */
import logger from './logger.js';

/**
 * Parse and extract vote data from a transaction
 * 
 * @param tx - Transaction data from various sources (WoC, BMAPJS, etc.)
 * @returns Structured vote data or null if not a valid vote
 */
export async function extractVoteData(tx: any): Promise<any> {
  try {
    logger.info(`Processing vote transaction ${tx.id || tx.tx_id}`);
    
    // Extract basic data
    const txId = tx.id || tx.tx_id || tx.hash;
    const authorAddress = tx.author_address || tx.addresses?.[0] || '';
    
    // Determine transaction format
    // For newer formats, like GraphQL API or BMAPJS output
    let voteData: any = null;
    
    // Process direct vote_data field if present
    if (tx.vote_data || tx.data?.vote_data) {
      const rawVoteData = tx.vote_data || tx.data?.vote_data;
      try {
        const voteDataObj = typeof rawVoteData === 'string' ? JSON.parse(rawVoteData) : rawVoteData;
        logger.debug('Found vote_data field in transaction', voteDataObj);
        
        voteData = {
          is_vote: true,
          vote_question: voteDataObj.question || '',
          content: voteDataObj.question || '',
          author_address: authorAddress,
          vote_options: voteDataObj.options?.map((o: any) => o.text || '') || [],
          total_options: voteDataObj.options?.length || 0
        };
        
        logger.info(`Processed vote_data with ${voteData.vote_options.length} options`);
        return voteData;
      } catch (e) {
        logger.error('Error parsing vote_data', e);
      }
    }
    
    // Check for option fields directly in the data
    if (tx.data && Array.isArray(tx.data)) {
      const optionEntries = tx.data.filter((item: any) => {
        if (typeof item === 'string') {
          return item.startsWith('option') && !item.includes('_lock_');
        }
        return false;
      });
      
      if (optionEntries.length > 0) {
        logger.debug(`Found ${optionEntries.length} direct option entries in transaction data`);
        
        // This is likely the new format with embedded options
        const options: string[] = [];
        
        for (const entry of optionEntries) {
          if (typeof entry === 'string') {
            const parts = entry.split('=');
            if (parts.length === 2) {
              options.push(parts[1]);
            }
          }
        }
        
        if (options.length > 0) {
          // Find the vote question
          let question = '';
          const questionEntry = tx.data.find((item: string | any) => 
            typeof item === 'string' && (
              item.startsWith('vote_question=') || 
              item.startsWith('content=')
            )
          );
          
          if (questionEntry) {
            const parts = questionEntry.split('=');
            if (parts.length >= 2) {
              question = parts.slice(1).join('=');
            }
          }
          
          voteData = {
            is_vote: true,
            vote_question: question,
            content: question,
            author_address: authorAddress,
            vote_options: options,
            total_options: options.length
          };
          
          logger.info(`Processed direct option fields with ${options.length} options`);
          return voteData;
        }
      }
    }
    
    // Check for explicit vote flag in data
    const isVote = tx.is_vote || 
                  (tx.metadata && tx.metadata.is_vote) || 
                  (tx.data && Array.isArray(tx.data) && tx.data.some((item: string | any) => 
                    (typeof item === 'string' && (item === 'is_vote=true' || item.includes('type=vote'))) ||
                    (typeof item === 'object' && item.key === 'is_vote' && item.value === 'true')
                  ));
    
    if (isVote) {
      logger.debug('Found vote flag in transaction');
      
      // Extract question
      const question = tx.content || 
                      (tx.metadata && tx.metadata.content) || 
                      (tx.data && Array.isArray(tx.data) && tx.data.find((item: string | any) => 
                        (typeof item === 'string' && item.startsWith('content='))
                      )?.split('=').slice(1).join('=')) || '';
      
      // Extract options from various sources
      let options: string[] = [];
      
      // Direct options array
      if (tx.options) {
        options = tx.options;
      } 
      // Options in metadata
      else if (tx.metadata && tx.metadata.options) {
        options = tx.metadata.options;
      }
      // Look for options in data array
      else if (tx.data && Array.isArray(tx.data)) {
        // Look for option pattern in strings
        const optionPattern = /^option\d+=(.+)/;
        const optionStrings = tx.data
          .filter((item: any) => typeof item === 'string' && optionPattern.test(item))
          .map((item: string) => {
            const match = item.match(optionPattern);
            return match ? match[1] : null;
          })
          .filter(Boolean);
        
        if (optionStrings.length > 0) {
          options = optionStrings;
        }
      }
      
      if (options.length > 0 || question) {
        voteData = {
          is_vote: true,
          vote_question: question,
          content: question,
          author_address: authorAddress,
          vote_options: options,
          total_options: options.length
        };
        
        logger.info(`Processed vote with ${options.length} options`);
        return voteData;
      }
    }
    
    return null;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error extracting vote data: ${errorMessage}`);
    return null;
  }
} 
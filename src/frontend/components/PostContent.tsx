import React, { useEffect } from 'react';
import { HODLTransaction } from '../types';
import VoteOptionsDisplay from './VoteOptionsDisplay';

interface PostContentProps {
  transaction: HODLTransaction;
  onTotalLockedAmountChange?: (amount: number) => void;
}

const PostContent: React.FC<PostContentProps> = ({ transaction, onTotalLockedAmountChange }) => {
  useEffect(() => {
    console.log('PostContent rendered with txid:', transaction.txid);
    console.log('Content type:', transaction.content_type);
    console.log('Is vote:', transaction.is_vote);
    console.log('Metadata:', transaction.metadata);
    
    // Check if this is a vote post based on multiple criteria
    const isVotePost = transaction.is_vote || 
                      transaction.content_type === 'vote' || 
                      (transaction.metadata && 
                        (transaction.metadata.content_type === 'vote' || 
                         transaction.metadata.isVote));
    
    console.log('Is vote post (calculated):', isVotePost);
  }, [transaction]);

  // Handle vote type posts
  if (transaction.content_type === 'vote' || 
      transaction.is_vote || 
      (transaction.metadata && 
        (transaction.metadata.content_type === 'vote' || 
         transaction.metadata.isVote))) {
    console.log('Rendering VoteOptionsDisplay for vote post');
    return <VoteOptionsDisplay 
      transaction={transaction} 
      onTotalLockedAmountChange={onTotalLockedAmountChange}
    />;
  }

  // Handle regular posts
  console.log('Rendering regular post content');
  return (
    <div className="whitespace-pre-wrap break-words text-gray-900 dark:text-white">
      {transaction.content}
    </div>
  );
};

export default PostContent;
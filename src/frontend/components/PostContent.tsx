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
    console.log('Vote options:', transaction.vote_options);
  }, [transaction]);

  // Determine if this is a vote post with actual vote options
  const isVotePostWithOptions = 
    (transaction.is_vote || transaction.content_type === 'vote') && 
    transaction.vote_options && 
    transaction.vote_options.length > 0;
  
  // Handle vote type posts with actual options
  if (isVotePostWithOptions) {
    console.log('Rendering VoteOptionsDisplay for vote post with options');
    return <VoteOptionsDisplay 
      transaction={transaction} 
      onTotalLockedAmountChange={onTotalLockedAmountChange}
    />;
  }

  // Handle regular posts (including vote posts without options)
  console.log('Rendering regular post content');
  return (
    <div className="whitespace-pre-wrap break-words text-gray-900 dark:text-white">
      {transaction.content}
    </div>
  );
};

export default PostContent;
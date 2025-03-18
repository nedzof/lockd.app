import React, { useEffect, useMemo } from 'react';
import { HODLTransaction } from '../types/index';
import VoteOptionsDisplay from './VoteOptionsDisplay';
import LinkPreview from './LinkPreview';

interface PostContentProps {
  transaction: HODLTransaction;
  onTotalLockedAmountChange?: (amount: number) => void;
}

const PostContent: React.FC<PostContentProps> = ({ transaction, onTotalLockedAmountChange }) => {
  useEffect(() => {
    console.log('PostContent rendered with tx_id:', transaction.tx_id);
    console.log('Content type:', transaction.content_type);
    console.log('Is vote:', transaction.is_vote);
    console.log('Vote options:', transaction.vote_options);
  }, [transaction]);

  // Determine if this is a vote post with actual vote options
  const isVotePostWithOptions = 
    (transaction.is_vote || transaction.content_type === 'vote') && 
    transaction.vote_options && 
    transaction.vote_options.length > 0;
  
  // Extract URLs from content
  const detectedUrl = useMemo(() => {
    if (!transaction.content) return null;
    
    // URL regex pattern that matches common URL formats
    const urlRegex = /(https?:\/\/)?([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(\/[a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=%-]*)?/gi;
    
    const matches = transaction.content.match(urlRegex);
    if (!matches || matches.length === 0) return null;
    
    // Ensure the URL has a protocol
    let url = matches[0];
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    
    return url;
  }, [transaction.content]);
  
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
    <div className="text-gray-900 dark:text-white">
      <div className="whitespace-pre-wrap break-words">
        {transaction.content}
      </div>
      
      {detectedUrl && (
        <div className="transition-all duration-300 opacity-100 my-2">
          <LinkPreview url={detectedUrl} />
        </div>
      )}
    </div>
  );
};

export default PostContent;
import React, { useEffect } from 'react';
import { HODLTransaction } from '../types';
import VoteOptionsDisplay from './VoteOptionsDisplay';

interface PostContentProps {
  transaction: HODLTransaction;
}

const PostContent: React.FC<PostContentProps> = ({ transaction }) => {
  useEffect(() => {
    console.log('PostContent rendered with txid:', transaction.txid);
    console.log('Content type:', transaction.content_type);
  }, [transaction]);

  // Handle vote type posts
  if (transaction.content_type === 'vote') {
    console.log('Rendering VoteOptionsDisplay for vote post');
    return <VoteOptionsDisplay transaction={transaction} />;
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
import React from 'react';
import UnifiedLockInteraction from './UnifiedLockInteraction';

interface PostLockInteractionProps {
  postId: string;
  connected?: boolean;
  isLocking?: boolean;
  onLock?: (postId: string, amount: number, duration: number) => Promise<void>;
}

const PostLockInteraction: React.FC<PostLockInteractionProps> = ({
  postId,
  connected = false,
  isLocking = false,
  onLock = async () => {},
}) => {
  return (
    <UnifiedLockInteraction
      id={postId}
      connected={connected}
      isLocking={isLocking}
      type="post"
      modalTitle="Lock Bitcoin"
      onLock={onLock}
    />
  );
};

export default PostLockInteraction; 
import React from 'react';
import LockInteraction from './LockInteraction';

interface VoteOptionLockInteractionProps {
  optionId: string;
  connected?: boolean;
  isLocking?: boolean;
  onLock: (optionId: string, amount: number, duration: number) => Promise<void>;
}

const VoteOptionLockInteraction: React.FC<VoteOptionLockInteractionProps> = ({
  optionId,
  connected = false,
  isLocking = false,
  onLock,
}) => {
  return (
    <LockInteraction
      id={optionId}
      connected={connected}
      isLocking={isLocking}
      onLock={onLock}
      modalTitle="Lock Bitcoin on Vote"
      type="vote"
      buttonStyle="gradient"
    />
  );
};

export default VoteOptionLockInteraction;
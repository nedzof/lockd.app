import React from 'react';
import UnifiedLockInteraction from './UnifiedLockInteraction';

interface VoteOptionLockInteractionProps {
  optionId: string;
  connected?: boolean;
  isLocking?: boolean;
  onLock: (optionId: string, amount: number, duration: number) => Promise<void>;
  onCancel?: () => void;
}

const VoteOptionLockInteraction: React.FC<VoteOptionLockInteractionProps> = ({
  optionId,
  connected = false,
  isLocking = false,
  onLock,
  onCancel,
}) => {
  return (
    <UnifiedLockInteraction
      id={optionId}
      connected={connected}
      isLocking={isLocking}
      type="vote"
      modalTitle="Lock Bitcoin on Vote"
      onLock={onLock}
      onCancel={onCancel}
    />
  );
};

export default VoteOptionLockInteraction;
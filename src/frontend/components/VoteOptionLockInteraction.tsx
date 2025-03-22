import React, { useState } from 'react';
import LockInteraction from './LockInteraction';

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
  onCancel = () => {},
}) => {
  const [internalIsLocking, setInternalIsLocking] = useState(false);
  
  const handleLock = async (id: string, amount: number, duration: number) => {
    setInternalIsLocking(true);
    try {
      await onLock(id, amount, duration);
    } finally {
      setInternalIsLocking(false);
    }
  };
  
  const handleCancel = () => {
    setInternalIsLocking(false);
    onCancel();
  };
  
  return (
    <LockInteraction
      id={optionId}
      connected={connected}
      isLocking={isLocking || internalIsLocking}
      onLock={handleLock}
      onCancel={handleCancel}
      modalTitle="Lock Bitcoin on Vote"
      type="vote"
      buttonStyle="gradient"
    />
  );
};

export default VoteOptionLockInteraction;
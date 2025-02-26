import React from 'react';

interface VoteOptionLockInteractionProps {
  optionId: string;
  connected: boolean;
  onLock: (optionId: string, amount: number, duration: number) => Promise<void>;
}

const VoteOptionLockInteraction: React.FC<VoteOptionLockInteractionProps> = ({
  optionId,
  connected,
  onLock,
}) => {
  const handleLock = () => {
    if (connected) {
      onLock(optionId, 0.00001, 1000);
    }
  };

  return (
    <button
      onClick={handleLock}
      disabled={!connected}
      className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-gray-800 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
    >
      Lock BSV
    </button>
  );
};

export default VoteOptionLockInteraction;
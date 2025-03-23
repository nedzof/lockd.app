import React from 'react';
import { useYoursWallet } from 'yours-wallet-provider';
import LockInteraction from './LockInteraction';
import { useLockHandler, WalletInterface } from '../utils/walletConnectionHelpers';

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
  // Cast the wallet to our interface to ensure compatibility
  const wallet = useYoursWallet() as unknown as WalletInterface;
  
  // Use our shared lock handler hook
  const { 
    isLocking: internalIsLocking, 
    balance,
    handleRefreshBalance,
    handleConnect, 
    handleCancel, 
    handleLock 
  } = useLockHandler(wallet, connected, async () => {});
  
  // Custom lock handler that delegates to parent component
  const handleVoteLock = async (id: string, amount: number, duration: number) => {
    await handleLock(id, amount, duration, async (optionId, amount, duration) => {
      // Add any custom logic needed before delegating to the parent
      // This function is where you would put any vote-specific logic
      
      // Delegate to the parent's onLock
      await onLock(optionId, amount, duration);
    });
  };
  
  // Combine local and parent cancel handlers
  const combinedCancelHandler = () => {
    handleCancel();
    onCancel();
  };
  
  return (
    <LockInteraction
      id={optionId}
      connected={connected}
      isLocking={isLocking || internalIsLocking}
      wallet={wallet}
      balance={balance}
      refreshBalance={handleRefreshBalance}
      onLock={handleVoteLock}
      onCancel={combinedCancelHandler}
      onConnect={handleConnect}
      modalTitle="Lock Bitcoin on Vote"
      type="vote"
      buttonStyle="gradient"
    />
  );
};

export default VoteOptionLockInteraction;
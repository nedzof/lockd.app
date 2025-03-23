import React, { useState, useCallback } from 'react';
import { useYoursWallet } from 'yours-wallet-provider';
import { toast } from 'react-hot-toast';
import { API_URL } from '../config';
import LockInteraction from './LockInteraction';
import { useLockHandler, WalletInterface } from '../utils/walletConnectionHelpers';
import { useWallet } from '../providers/WalletProvider';

// Constants for wallet integration
const SATS_PER_BSV = 100000000;

interface BaseLockInteractionProps {
  id: string;
  connected?: boolean;
  isLocking?: boolean;
  type: 'post' | 'vote' | 'like';
  modalTitle: string;
  buttonStyle?: 'gradient' | 'icon';
  onCancel?: () => void;
}

// Props for post locking
interface PostLockProps extends BaseLockInteractionProps {
  type: 'post';
  onLock: (postId: string, amount: number, duration: number) => Promise<void>;
}

// Props for vote option locking
interface VoteLockProps extends BaseLockInteractionProps {
  type: 'vote';
  onLock: (optionId: string, amount: number, duration: number) => Promise<void>;
}

// Props for like locking
interface LikeLockProps extends BaseLockInteractionProps {
  type: 'like';
  posttx_id?: string;
  replytx_id?: string;
  postLockLike: (
    tx_id: string,
    amount: number,
    nLockTime: number,
    handle: string,
    posttx_id?: string,
    replytx_id?: string
  ) => Promise<any>;
}

// Union type of all possible props
type UnifiedLockInteractionProps = PostLockProps | VoteLockProps | LikeLockProps;

// Type guard functions to check prop types
const isPostLockProps = (props: UnifiedLockInteractionProps): props is PostLockProps => 
  props.type === 'post';

const isVoteLockProps = (props: UnifiedLockInteractionProps): props is VoteLockProps => 
  props.type === 'vote';

const isLikeLockProps = (props: UnifiedLockInteractionProps): props is LikeLockProps => 
  props.type === 'like';

const UnifiedLockInteraction: React.FC<UnifiedLockInteractionProps> = (props) => {
  // Common wallet setup based on type
  let wallet: WalletInterface;
  let connected: boolean;
  let balance: { bsv: number };
  let refreshWalletBalance: () => Promise<void>;

  if (isLikeLockProps(props)) {
    // For like interactions, use the WalletProvider
    const walletProvider = useWallet();
    wallet = walletProvider.wallet as unknown as WalletInterface;
    connected = walletProvider.isConnected;
    balance = walletProvider.balance;
    refreshWalletBalance = walletProvider.refreshBalance;
  } else {
    // For post and vote interactions, use the YoursWallet directly
    wallet = useYoursWallet() as unknown as WalletInterface;
    connected = props.connected || false;
    balance = { bsv: 0 }; // Will be updated by the handler
    refreshWalletBalance = async () => {};
  }

  // Use our shared lock handler hook
  const { 
    isLocking, 
    connectionInProgress,
    balance: localBalance, 
    handleRefreshBalance,
    handleConnect, 
    handleCancel, 
    handleLock 
  } = useLockHandler(wallet, connected, refreshWalletBalance);

  // Implement the appropriate lock logic based on type
  const performLock = useCallback(async (id: string, amount: number, duration: number) => {
    if (!wallet) {
      toast.error('Wallet functionality is not available');
      return;
    }

    // Get current block height for lock duration
    const currentBlockHeight = await fetch('https://api.whatsonchain.com/v1/bsv/main/chain/info')
      .then(response => response.json())
      .then(data => data.blocks)
      .catch(() => 800000); // Fallback to approximate height

    // Get user's identity address
    if (!wallet.getAddresses) {
      toast.error('Wallet get addresses functionality is not available');
      return;
    }
    
    const addresses = await wallet.getAddresses();
    if (!addresses?.identityAddress) {
      throw new Error('Could not get identity address');
    }
    
    // Calculate unlock height and satoshi amount
    const unlockHeight = currentBlockHeight + duration;
    const satoshiAmount = Math.floor(amount * SATS_PER_BSV);

    // Prepare lock params
    const locks = [
      { 
        address: addresses.identityAddress,
        blockHeight: unlockHeight,
        sats: satoshiAmount
      }
    ];

    // Call the appropriate lock method based on type
    if (isLikeLockProps(props)) {
      // Handle like locking
      const lockMethod = wallet.lock || wallet.lockBsv;
      if (!lockMethod) {
        throw new Error('No locking method available on the wallet');
      }

      const response = await lockMethod(locks);
      const txid = response?.txid || response?.tx_id;
      
      if (!txid) {
        throw new Error('Failed to create lock transaction');
      }
      
      // Call the postLockLike function from props
      await props.postLockLike(
        txid, 
        satoshiAmount, 
        unlockHeight, 
        addresses.identityAddress, 
        props.posttx_id, 
        props.replytx_id
      );
      
      toast.success(`Successfully locked ${amount} BSV for ${duration} blocks!`);
    } else if (isPostLockProps(props) || isVoteLockProps(props)) {
      // Handle post/vote locking
      const lockMethod = wallet.lock || wallet.lockBsv;
      if (!lockMethod) {
        throw new Error('No locking method available on the wallet');
      }

      const response = await lockMethod(locks);
      const txid = response?.txid || response?.tx_id;
      
      if (!txid) {
        throw new Error('Failed to create lock transaction');
      }
      
      // For post locking, we need to call the API
      if (isPostLockProps(props)) {
        // Call the API with the transaction ID for post locking
        const apiResponse = await fetch(`${API_URL}/api/lock-likes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            post_id: id,
            author_address: addresses.identityAddress,
            amount: satoshiAmount,
            lock_duration: duration,
            tx_id: txid,
          }),
        });
        
        if (!apiResponse.ok) {
          const errorText = await apiResponse.text();
          throw new Error(`API error: ${apiResponse.status} ${errorText}`);
        }
      }
      
      // Call the passed onLock function
      await props.onLock(id, amount, duration);
      
      toast.success(`Successfully locked ${amount} BSV for ${duration} blocks!`);
    }
  }, [wallet, props]);

  // Wrapper around handleLock to provide our implementation
  const handleUnifiedLock = useCallback(async (id: string, amount: number, duration: number) => {
    await handleLock(id, amount, duration, performLock);
  }, [handleLock, performLock]);

  // Combine local and parent cancel handlers
  const combinedCancelHandler = useCallback(() => {
    handleCancel();
    if (props.onCancel) props.onCancel();
  }, [handleCancel, props.onCancel]);

  return (
    <LockInteraction
      id={props.id}
      connected={connected}
      isLocking={props.isLocking || isLocking || connectionInProgress}
      wallet={wallet}
      balance={balance}
      refreshBalance={refreshWalletBalance}
      onLock={handleUnifiedLock}
      onCancel={combinedCancelHandler}
      onConnect={handleConnect}
      modalTitle={props.modalTitle}
      type={props.type}
      buttonStyle={props.buttonStyle || 'gradient'}
    />
  );
};

export default UnifiedLockInteraction; 
import React from 'react';
import { useYoursWallet } from 'yours-wallet-provider';
import { toast } from 'react-hot-toast';
import { API_URL } from '../config';
import LockInteraction from './LockInteraction';
import { useLockHandler, WalletInterface } from './WalletConnectionHelper';

// Constants for wallet integration
const SATS_PER_BSV = 100000000;

// Block height cache to prevent repeated network calls
// This caches the block height for 10 minutes (600000ms)
const BLOCK_HEIGHT_CACHE_DURATION = 600000;
let cachedBlockHeight: number | null = null;
let blockHeightCacheTime: number = 0;

// Get current block height with caching
const getBlockHeight = async (): Promise<number> => {
  const now = Date.now();
  
  // Use cached value if available and not expired
  if (cachedBlockHeight && now - blockHeightCacheTime < BLOCK_HEIGHT_CACHE_DURATION) {
    return cachedBlockHeight;
  }

  try {
    const response = await fetch('https://api.whatsonchain.com/v1/bsv/main/chain/info');
    const data = await response.json();
    
    if (data.blocks) {
      cachedBlockHeight = data.blocks;
      blockHeightCacheTime = now;
      return data.blocks;
    }
    
    throw new Error('Block height not found in API response');
  } catch (error) {
    // Fallback to approximate BSV block height if we can't get real data
    return 800000;
  }
};

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
  const wallet = useYoursWallet() as WalletInterface;
  
  // Use our shared lock handler hook
  const { 
    isLocking: internalLocking, 
    balance,
    handleRefreshBalance,
    handleConnect, 
    handleCancel, 
    handleLock 
  } = useLockHandler(wallet, connected, async () => {});
  
  // Implementation of the actual lock logic
  const performPostLock = async (id: string, amount: number, duration: number) => {
    if (!wallet) {
      toast.error('Wallet functionality is not available');
      return;
    }
    
    const getAddressesMethod = wallet.getAddresses;
    const lockBsvMethod = wallet.lockBsv;
    
    if (!getAddressesMethod || !lockBsvMethod) {
      toast.error('Wallet locking functionality is not available');
      return;
    }
    
    // Get user's identity address
    const res = await getAddressesMethod();
    
    if (!res?.identityAddress) {
      throw new Error('Could not get identity address');
    }
    
    // Use the LockInteraction's built-in block height utility, which is used internally
    const currentBlockHeight = await fetch('https://api.whatsonchain.com/v1/bsv/main/chain/info')
      .then(response => response.json())
      .then(data => data.blocks)
      .catch(() => 800000); // Fallback to approximate height
    
    // Calculate unlock height and satoshi amount
    const unlockHeight = currentBlockHeight + duration;
    const satoshiAmount = Math.floor(amount * SATS_PER_BSV);
    
    // Prepare lock params
    const locks = [
      { 
        address: res.identityAddress,
        blockHeight: unlockHeight,
        sats: satoshiAmount
      }
    ];
    
    // Call wallet lockBsv
    const response = await lockBsvMethod(locks);
    
    if (!response || !response.txid) {
      throw new Error('Missing transaction ID in response');
    }
    
    // Call the API with the transaction ID
    const apiResponse = await fetch(`${API_URL}/api/lock-likes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        post_id: id,
        author_address: res.identityAddress,
        amount: satoshiAmount,
        lock_duration: duration,
        tx_id: response.txid,
      }),
    });
    
    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      throw new Error(`API error: ${apiResponse.status} ${errorText}`);
    }
    
    // Success
    toast.success(`Successfully locked ${amount} BSV for ${duration} blocks!`);
    
    // Call the parent's onLock to update UI
    await onLock(id, amount, duration);
  };
  
  // Wrapper around handleLock to provide our implementation
  const handlePostLock = async (id: string, amount: number, duration: number) => {
    await handleLock(id, amount, duration, performPostLock);
  };
  
  return (
    <LockInteraction
      id={postId}
      connected={connected}
      isLocking={isLocking || internalLocking}
      wallet={wallet}
      balance={balance}
      refreshBalance={handleRefreshBalance}
      onLock={handlePostLock}
      onCancel={handleCancel}
      onConnect={handleConnect}
      modalTitle="Lock Bitcoin"
      type="post"
      buttonStyle="gradient"
    />
  );
};

export default PostLockInteraction; 
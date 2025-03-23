import React from 'react';
import { useWallet } from '../providers/WalletProvider';
import { toast } from 'react-hot-toast';
import { API_URL } from "../config";
import { LockLike } from '../types';
import LockInteraction from './LockInteraction';
import { useLockHandler, WalletInterface } from './WalletConnectionHelper';

interface LockLikeInteractionProps {
  posttx_id?: string;
  replytx_id?: string;
  postLockLike: (
    tx_id: string,
    amount: number,
    nLockTime: number,
    handle: string,
    posttx_id?: string,
    replytx_id?: string
  ) => Promise<LockLike>;
}

export default function LockLikeInteraction({ posttx_id, replytx_id, postLockLike }: LockLikeInteractionProps) {
  const walletProvider = useWallet();
  // Cast wallet to our interface to ensure compatibility
  const wallet = walletProvider.wallet as unknown as WalletInterface;
  const { isConnected, balance, refreshBalance } = walletProvider;
  
  // Use our shared lock handler hook
  const { 
    isLocking, 
    balance: localBalance, 
    handleConnect, 
    handleCancel, 
    handleLock 
  } = useLockHandler(wallet, isConnected, refreshBalance);
  
  // Implementation of the actual lock logic
  const performLock = async (id: string, amount: number, duration: number) => {
    if (!wallet) {
      toast.error('Wallet is not available');
      return;
    }
    
    // Check for required methods
    const getAddresses = wallet.getAddresses;
    if (!getAddresses) {
      toast.error('Wallet get addresses functionality is not available');
      return;
    }
    
    // Get current block height
    const response = await fetch('https://api.whatsonchain.com/v1/bsv/main/chain/info');
    const data = await response.json();
    const currentBlockHeight = data.blocks || 800000;
    
    // Get user's identity address
    const addresses = await getAddresses();
    
    if (!addresses?.identityAddress) {
      throw new Error('Could not get identity address');
    }
    
    // Calculate unlock height and satoshi amount
    const unlockHeight = currentBlockHeight + duration;
    const SATS_PER_BSV = 100000000;
    const satoshiAmount = Math.floor(amount * SATS_PER_BSV);
    
    // Create lock parameters
    const lockParams = [{
      address: addresses.identityAddress,
      blockHeight: unlockHeight,
      sats: satoshiAmount,
    }];
    
    // Try both methods with fallbacks
    let lockResponse;
    
    // Try using the global window.yours object directly first
    if (window.yours) {
      // Try lock method first (as in documentation)
      if (typeof (window.yours as any).lock === 'function') {
        lockResponse = await (window.yours as any).lock(lockParams);
      }
      // Fall back to lockBsv
      else if (typeof (window.yours as any).lockBsv === 'function') {
        lockResponse = await (window.yours as any).lockBsv(lockParams);
      }
      else {
        throw new Error('No lock methods available on global wallet object');
      }
    }
    // Fall back to wallet provider - we already checked wallet is defined above
    else {
      // First try the method from documentation
      const lockMethod = (wallet as any).lock;
      const lockBsvMethod = wallet.lockBsv;
      
      if (typeof lockMethod === 'function') {
        lockResponse = await lockMethod(lockParams);
      } 
      // Fall back to lockBsv if lock isn't available
      else if (typeof lockBsvMethod === 'function') {
        lockResponse = await lockBsvMethod(lockParams);
      }
      else {
        throw new Error('No locking method available on the wallet');
      }
    }
    
    // Handle both property name patterns (camelCase and snake_case)
    const anyResponse = lockResponse as any;
    const txid = anyResponse?.txid || anyResponse?.tx_id;
    
    if (!lockResponse || !txid) {
      throw new Error('Failed to create lock transaction');
    }
    
    // Call the parent component's postLockLike function
    await postLockLike(
      txid,
      satoshiAmount,
      unlockHeight,
      addresses.identityAddress,
      posttx_id,
      replytx_id
    );
    
    // Success
    toast.success(`Successfully locked ${amount} BSV for ${duration} blocks!`);
  };
  
  // Wrapper around handleLock to provide our implementation
  const onLock = async (id: string, amount: number, duration: number) => {
    await handleLock(id, amount, duration, performLock);
  };
  
  return (
    <LockInteraction
      id={posttx_id || replytx_id || ''}
      connected={isConnected}
      isLocking={isLocking}
      wallet={wallet}
      balance={balance}
      refreshBalance={refreshBalance}
      onLock={onLock}
      onCancel={handleCancel}
      onConnect={handleConnect}
      modalTitle="Lock BSV"
      type="like"
      buttonStyle="icon"
    />
  );
} 
import { useState } from 'react';
import { useWallet } from './useWallet';
import { Lock, CreateLockParams } from '../types';
import { LockupService } from '../services/lockup.service';
import { WalletError } from '../../shared/utils/errors';

export function useLockup() {
  const { wallet, isConnected } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createLock = async (params: CreateLockParams): Promise<string> => {
    if (!isConnected || !wallet) {
      throw new WalletError('Wallet not connected');
    }

    try {
      setLoading(true);
      setError(null);

      const lockupService = new LockupService(wallet);
      const txId = await lockupService.createLock(params);

      return txId;
    } catch (err) {
      const errorMessage = err instanceof WalletError ? err.message : 'Failed to create lock';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const getLocks = async (): Promise<Lock[]> => {
    if (!isConnected || !wallet) {
      throw new WalletError('Wallet not connected');
    }

    try {
      setLoading(true);
      setError(null);

      const lockupService = new LockupService(wallet);
      const locks = await lockupService.getLocks();

      return locks;
    } catch (err) {
      const errorMessage = err instanceof WalletError ? err.message : 'Failed to get locks';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const unlock = async (lockId: string): Promise<string> => {
    if (!isConnected || !wallet) {
      throw new WalletError('Wallet not connected');
    }

    try {
      setLoading(true);
      setError(null);

      const lockupService = new LockupService(wallet);
      const txId = await lockupService.unlock(lockId);

      return txId;
    } catch (err) {
      const errorMessage = err instanceof WalletError ? err.message : 'Failed to unlock';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    createLock,
    getLocks,
    unlock,
    loading,
    error
  };
} 
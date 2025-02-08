import * as React from 'react';
import { useState, useEffect } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useLockup } from '../hooks/useLockup';
import { Lock, LockStatus } from '../types';
import { WalletError } from '../../shared/utils/errors';

interface LockManagerProps {
  onSuccess?: (txId: string) => void;
  onError?: (error: Error) => void;
}

export const LockManager: React.FC<LockManagerProps> = ({ onSuccess, onError }) => {
  const [locks, setLocks] = useState<Lock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [lockHeight, setLockHeight] = useState('');

  const { wallet, isConnected } = useWallet();
  const { createLock, getLocks, unlock } = useLockup();

  useEffect(() => {
    if (isConnected) {
      loadLocks();
    }
  }, [isConnected]);

  const loadLocks = async () => {
    try {
      setLoading(true);
      const userLocks = await getLocks();
      setLocks(userLocks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load locks');
      onError?.(err instanceof Error ? err : new Error('Failed to load locks'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected) {
      setError('Wallet not connected');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const txId = await createLock({
        recipientAddress,
        amount: parseInt(amount),
        lockUntilHeight: parseInt(lockHeight)
      });

      onSuccess?.(txId);
      await loadLocks();
      
      // Reset form
      setRecipientAddress('');
      setAmount('');
      setLockHeight('');
    } catch (err) {
      const errorMessage = err instanceof WalletError ? err.message : 'Failed to create lock';
      setError(errorMessage);
      onError?.(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async (lockId: string) => {
    if (!isConnected) {
      setError('Wallet not connected');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const txId = await unlock(lockId);
      onSuccess?.(txId);
      await loadLocks();
    } catch (err) {
      const errorMessage = err instanceof WalletError ? err.message : 'Failed to unlock';
      setError(errorMessage);
      onError?.(err instanceof Error ? err : new Error(errorMessage));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lock-manager">
      <h2>Create New Lock</h2>
      <form onSubmit={handleCreateLock}>
        <div className="form-group">
          <label htmlFor="recipientAddress">Recipient Address</label>
          <input
            id="recipientAddress"
            type="text"
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            placeholder="Enter BSV address"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="amount">Amount (satoshis)</label>
          <input
            id="amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount in satoshis"
            required
            min="1"
          />
        </div>

        <div className="form-group">
          <label htmlFor="lockHeight">Lock Until Block Height</label>
          <input
            id="lockHeight"
            type="number"
            value={lockHeight}
            onChange={(e) => setLockHeight(e.target.value)}
            placeholder="Enter block height"
            required
            min="1"
          />
        </div>

        <button type="submit" disabled={loading || !isConnected}>
          {loading ? 'Creating Lock...' : 'Create Lock'}
        </button>
      </form>

      {error && <div className="error-message">{error}</div>}

      <h2>Your Locks</h2>
      <div className="locks-list">
        {locks.map((lock) => (
          <div key={lock.id} className="lock-item">
            <div className="lock-info">
              <p>TxID: {lock.txId}</p>
              <p>Amount: {lock.amount} satoshis</p>
              <p>Status: {lock.status}</p>
              <p>Locked Until: Block {lock.lockUntilHeight}</p>
            </div>
            {lock.status === LockStatus.CONFIRMED && (
              <button
                onClick={() => handleUnlock(lock.id)}
                disabled={loading}
              >
                {loading ? 'Unlocking...' : 'Unlock'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}; 
import * as React from 'react';
import { useState, useEffect } from 'react';
import { Transaction, TxType, TxStatus } from '../types';
import { WalletError } from '../../shared/utils/errors';
import { formatDate } from '../utils/date';

interface TransactionHistoryProps {
  lockId: string;
  onTransactionClick?: (transaction: Transaction) => void;
}

export const TransactionHistory: React.FC<TransactionHistoryProps> = ({
  lockId,
  onTransactionClick
}) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTransactions();
  }, [lockId]);

  const loadTransactions = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/locks/${lockId}/transactions`);
      if (!response.ok) {
        throw new WalletError(
          'Failed to load transactions',
          'API_ERROR'
        );
      }

      const data = await response.json();
      setTransactions(data);
    } catch (err) {
      const errorMessage = err instanceof WalletError ? err.message : 'Failed to load transactions';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: TxStatus): string => {
    switch (status) {
      case TxStatus.CONFIRMED:
        return 'text-green-500';
      case TxStatus.FAILED:
        return 'text-red-500';
      default:
        return 'text-yellow-500';
    }
  };

  const getTypeLabel = (type: TxType): string => {
    switch (type) {
      case TxType.LOCK:
        return 'Lock';
      case TxType.UNLOCK:
        return 'Unlock';
      default:
        return type;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-500 text-center">
        {error}
      </div>
    );
  }

  return (
    <div className="transaction-history">
      <h3 className="text-lg font-semibold mb-4">Transaction History</h3>
      
      {transactions.length === 0 ? (
        <p className="text-gray-500 text-center">No transactions found</p>
      ) : (
        <div className="space-y-4">
          {transactions.map((tx) => (
            <div
              key={tx.id}
              className="transaction-item border rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
              onClick={() => onTransactionClick?.(tx)}
            >
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-medium">{getTypeLabel(tx.type)}</span>
                  <span className="text-sm text-gray-500 ml-2">
                    {formatDate(tx.createdAt)}
                  </span>
                </div>
                <span className={`text-sm font-medium ${getStatusColor(tx.status)}`}>
                  {tx.status}
                </span>
              </div>
              
              <div className="mt-2">
                <p className="text-sm text-gray-600">
                  Amount: {tx.amount} satoshis
                </p>
                <p className="text-sm text-gray-600 font-mono">
                  TxID: {tx.txId.substring(0, 8)}...{tx.txId.substring(tx.txId.length - 8)}
                </p>
              </div>

              {tx.metadata && (
                <div className="mt-2 text-sm text-gray-500">
                  {Object.entries(tx.metadata).map(([key, value]) => (
                    <div key={key}>
                      {key}: {JSON.stringify(value)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}; 
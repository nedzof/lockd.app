export type ErrorCode = 'API_ERROR' | 'WALLET_ERROR' | 'NETWORK_ERROR';

export class WalletError extends Error {
  code: ErrorCode;

  constructor(message: string, code: ErrorCode = 'WALLET_ERROR') {
    super(message);
    this.name = 'WalletError';
    this.code = code;
  }
} 
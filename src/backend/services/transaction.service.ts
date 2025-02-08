import { bsv } from 'scrypt-ts';
import { Lock, Transaction, TxType, TxStatus } from '../../frontend/types';
import { WalletError, ErrorCodes } from '../../shared/utils/errors';
import { validateBsvAddress, validateAmount } from '../../shared/utils/validation';
import { getAddressUtxos, broadcastTransaction } from '../../shared/utils/blockchain';

export class TransactionService {
  private static readonly FEE_PER_KB = 500; // 500 sats/KB
  private static readonly DUST_LIMIT = 546; // BSV dust limit in satoshis

  /**
   * Builds a lock transaction
   */
  public async buildLockTransaction(
    senderAddress: string,
    recipientAddress: string,
    amount: number,
    lockUntilHeight: number,
    creatorPublicKey: string
  ): Promise<{ tx: bsv.Transaction; rawTx: string }> {
    // Validate addresses
    if (!validateBsvAddress(senderAddress) || !validateBsvAddress(recipientAddress)) {
      throw new WalletError(
        'Invalid address',
        ErrorCodes.INVALID_ADDRESS
      );
    }

    // Validate amount
    if (!validateAmount(amount)) {
      throw new WalletError(
        'Invalid amount',
        ErrorCodes.INVALID_AMOUNT
      );
    }

    try {
      // Get UTXOs
      const utxos = await getAddressUtxos(senderAddress);
      if (!utxos.length) {
        throw new WalletError(
          'No UTXOs available',
          ErrorCodes.TX_INSUFFICIENT_FUNDS
        );
      }

      // Create transaction
      const tx = new bsv.Transaction();

      // Add inputs
      let totalInput = 0;
      for (const utxo of utxos) {
        tx.addInput(new bsv.Transaction.Input({
          prevTxId: utxo.txid,
          outputIndex: utxo.vout,
          script: bsv.Script.buildPublicKeyHashOut(senderAddress)
        }));
        totalInput += utxo.satoshis;
        if (totalInput >= amount + this.estimateFee(tx)) {
          break;
        }
      }

      if (totalInput < amount + this.estimateFee(tx)) {
        throw new WalletError(
          'Insufficient funds',
          ErrorCodes.TX_INSUFFICIENT_FUNDS
        );
      }

      // Add lock output
      const lockScript = this.buildLockScript(recipientAddress, lockUntilHeight, creatorPublicKey);
      tx.addOutput(new bsv.Transaction.Output({
        script: lockScript,
        satoshis: amount
      }));

      // Add change output if needed
      const fee = this.estimateFee(tx);
      const change = totalInput - amount - fee;
      if (change >= TransactionService.DUST_LIMIT) {
        tx.addOutput(new bsv.Transaction.Output({
          script: bsv.Script.buildPublicKeyHashOut(senderAddress),
          satoshis: change
        }));
      }

      return {
        tx,
        rawTx: tx.toString()
      };
    } catch (error) {
      if (error instanceof WalletError) {
        throw error;
      }
      throw new WalletError(
        'Failed to build lock transaction',
        ErrorCodes.TX_BUILD_FAILED,
        undefined,
        error
      );
    }
  }

  /**
   * Builds an unlock transaction
   */
  public async buildUnlockTransaction(
    lock: Lock,
    recipientAddress: string
  ): Promise<{ tx: bsv.Transaction; rawTx: string }> {
    if (!validateBsvAddress(recipientAddress)) {
      throw new WalletError(
        'Invalid recipient address',
        ErrorCodes.INVALID_ADDRESS
      );
    }

    try {
      // Create transaction
      const tx = new bsv.Transaction();

      // Add lock input
      tx.addInput(new bsv.Transaction.Input({
        prevTxId: lock.txId,
        outputIndex: 0,
        script: bsv.Script.empty()
      }));

      // Add recipient output
      tx.addOutput(new bsv.Transaction.Output({
        script: bsv.Script.buildPublicKeyHashOut(recipientAddress),
        satoshis: lock.amount - this.estimateFee(tx)
      }));

      return {
        tx,
        rawTx: tx.toString()
      };
    } catch (error) {
      throw new WalletError(
        'Failed to build unlock transaction',
        ErrorCodes.TX_BUILD_FAILED,
        undefined,
        error
      );
    }
  }

  /**
   * Builds the lock script
   */
  private buildLockScript(
    recipientAddress: string,
    lockUntilHeight: number,
    creatorPublicKey: string
  ): bsv.Script {
    const script = new bsv.Script();
    
    // Add locktime check
    script
      .add(bsv.Opcode.OP_IF)
        // Check block height
        .add(bsv.Script.buildInt(lockUntilHeight))
        .add(bsv.Opcode.OP_CHECKLOCKTIMEVERIFY)
        .add(bsv.Opcode.OP_DROP)
        // Check recipient's signature
        .add(bsv.Script.buildPublicKeyHashOut(recipientAddress).toBuffer())
      .add(bsv.Opcode.OP_ELSE)
        // Allow creator to unlock with their signature
        .add(Buffer.from(creatorPublicKey, 'hex'))
        .add(bsv.Opcode.OP_CHECKSIG)
      .add(bsv.Opcode.OP_ENDIF);

    return script;
  }

  /**
   * Estimates transaction fee
   */
  private estimateFee(tx: bsv.Transaction): number {
    const size = tx.toBuffer().length;
    return Math.ceil(size * TransactionService.FEE_PER_KB / 1000);
  }

  /**
   * Signs and broadcasts a transaction
   */
  public async signAndBroadcast(
    tx: bsv.Transaction,
    privateKey: bsv.PrivateKey
  ): Promise<string> {
    try {
      // Sign all inputs
      tx.sign(privateKey);

      // Verify transaction
      if (!tx.verify()) {
        throw new WalletError(
          'Transaction verification failed',
          ErrorCodes.TX_VALIDATION_FAILED
        );
      }

      // Broadcast transaction
      const txid = await broadcastTransaction(tx.toString());
      return txid;
    } catch (error) {
      if (error instanceof WalletError) {
        throw error;
      }
      throw new WalletError(
        'Failed to sign and broadcast transaction',
        ErrorCodes.TX_BROADCAST_FAILED,
        undefined,
        error
      );
    }
  }
} 
import { EventEmitter } from 'events';
import {
    BasePost,
    BaseTransaction,
    TransactionOutput,
    ProtocolHandler,
    TransactionEvent,
    ProtocolError
} from '../common/types';
import { MAPProtocolHandler } from './map/mapProtocolHandler';

export class TransactionParser extends EventEmitter {
    private protocolHandlers: ProtocolHandler[];

    constructor() {
        super();
        // Initialize protocol handlers
        this.protocolHandlers = [
            new MAPProtocolHandler(),
            // Add more protocol handlers here
        ];

        // Listen for transactions from scanner
        this.on('transaction', async (event: TransactionEvent) => {
            if (event.type === 'TRANSACTION_SCANNED' && event.data) {
                const { transaction, outputs } = event.data as any;
                try {
                    const parsedPost = await this.parseTransaction(transaction, outputs);
                    if (parsedPost) {
                        this.emit('transaction', {
                            type: 'TRANSACTION_PARSED',
                            data: {
                                post: parsedPost,
                                rawTransaction: transaction
                            },
                            timestamp: new Date()
                        } as TransactionEvent);
                    }
                } catch (error) {
                    this.emit('error', error);
                }
            }
        });
    }

    async parseTransaction(
        transaction: BaseTransaction,
        outputs: TransactionOutput[]
    ): Promise<BasePost | null> {
        try {
            // Find a handler that can process this transaction
            for (const handler of this.protocolHandlers) {
                if (handler.canHandle(outputs)) {
                    const result = await handler.parseTransaction(transaction, outputs);
                    if (result) {
                        return result;
                    }
                }
            }

            console.log('No suitable protocol handler found for transaction:', transaction.id);
            return null;
        } catch (error) {
            const protocolError = new ProtocolError(
                'Error parsing transaction',
                'unknown',
                transaction.id,
                error instanceof Error ? error : undefined
            );
            this.emit('error', protocolError);
            throw protocolError;
        }
    }

    async parseBatch(
        transactions: Array<{
            transaction: BaseTransaction;
            outputs: TransactionOutput[];
        }>
    ): Promise<BasePost[]> {
        const results: BasePost[] = [];

        for (const tx of transactions) {
            try {
                const result = await this.parseTransaction(tx.transaction, tx.outputs);
                if (result) {
                    results.push(result);
                }
            } catch (error) {
                this.emit('error', error);
            }
        }

        return results;
    }
}

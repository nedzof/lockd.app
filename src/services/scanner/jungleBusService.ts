import { JungleBusClient, ControlMessageStatusCode } from "@gorillapool/js-junglebus";
import type { Transaction, ControlMessage } from './junglebus.types.js';

const client = new JungleBusClient("junglebus.gorillapool.io", {
    useSSL: true,
    protocol: "json",
    onConnected(ctx) {
        console.log("CONNECTED", ctx);
    },
    onConnecting(ctx) {
        console.log("CONNECTING", ctx);
    },
    onDisconnected(ctx) {
        console.log("DISCONNECTED", ctx);
    },
    onError(ctx) {
        console.error(ctx);
    }
});

const onPublish = function(tx: Transaction) {
    console.log("TRANSACTION DETECTED:", JSON.stringify({
        id: tx.id,
        transaction: tx.transaction,
        block_height: tx.block_height,
        block_time: tx.block_time
    }, null, 2));
};
const onStatus = function(message: ControlMessage) {
    if (message.statusCode === ControlMessageStatusCode.BLOCK_DONE) {
      console.log("BLOCK DONE", message.block);
    } else if (message.statusCode === ControlMessageStatusCode.WAITING) {
      console.log("WAITING FOR NEW BLOCK...", message);
    } else if (message.statusCode === ControlMessageStatusCode.REORG) {
      console.log("REORG TRIGGERED", message);
    } else if (message.statusCode === ControlMessageStatusCode.ERROR) {
      console.error(message);
    }
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const onError = function(error: any) {
    console.error(error);
};
const onMempool = function(tx: Transaction) {
    console.log("TRANSACTION", tx);
};

(async () => {
    await client.Subscribe("2dfb47cb42e93df9c8bbccec89425417f4e5a094c9c7d6fcda9dab12e845fd09", 883519, onPublish, onStatus, onError, onMempool);
})(); 
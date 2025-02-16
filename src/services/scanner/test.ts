import { parseMapTransaction, extractImageFromTransaction, getAddressesFromTransaction, getAuthorFromTransaction } from './mapTransactionParser';
import { processImage } from './imageProcessor';
import { JungleBusTransaction } from './types';

async function testTransactionParsing() {
    console.log('Testing transaction parsing...\n');

    // Test transaction ID
    const txId = '669b87e431c3c0338cdfd04a765eac9bfd52dd1326f1e6ba454d363fd0288751';
    console.log('🔍 Testing image extraction from transaction:', txId);

    // Create test transaction
    const transaction = {
        txid: txId,
        inputs: [
            {
                address: '1MhXkvyNFGSAc4Ph22ssAZR3vnfoyQHTtR',
                script: 'app=lockd.app,type=image,contenttype=image/jpeg,encoding=base64,filename=scholz.jpeg,filesize=257219'
            }
        ],
        outputs: [
            {
                value: 0,
                address: '1MhXkvyNFGSAc4Ph22ssAZR3vnfoyQHTtR',
                script: '0063036f7264510a746578742f706c61696e001377656e207363686f6c7a2072fc6b747269743f6876a914e30cd4433ea6448e2ea518c9d8418e481ad3c53188ac6a223150755161374b36324d694b43747373534c4b79316b683536575755374d745552350353455403617070096c6f636b642e61707007636f6e74656e741477656e207363686f6c7a2072c3bc6b747269743f06706f73744964126d37347a716575362d62773367666d3731770873657175656e6365013004746167730c5b22506f6c6974696373225d0974696d657374616d7018323032352d30322d31345431363a33363a31302e3036305a047479706507636f6e74656e7407766572'
            },
            {
                value: 0,
                address: '1MhXkvyNFGSAc4Ph22ssAZR3vnfoyQHTtR',
                script: '0063036f726451106170706c69636174696f6e2f6a736f6e000c5b22506f6c6974696373225d6876a914e30cd4433ea6448e2ea518c9d8418e481ad3c53188ac6a223150755161374b36324d694b43747373534c4b79316b683536575755374d745552350353455403617070096c6f636b642e61707007636f6e74656e740005636f756e7401310e706172656e7453657175656e6365013006706f73744964126d37347a716575362d62773367666d3731770873657175656e6365013504746167730c5b22506f6c6974696963225d0974696d657374616d7018323032352d30322d31345431363a33363a31302e3838355a04747970650474616773077665'
            },
            {
                value: 0,
                address: '1MhXkvyNFGSAc4Ph22ssAZR3vnfoyQHTtR',
                script: '/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVigAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDABQODxIPDRQSEBIXFRQdHx4eHRoaHSQtJiEyPzQ/Pj4+QEBAQHxQQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQED/2wBDAR/9k='
            }
        ]
    };

    // Test image extraction
    console.log('🔍 Parsing MAP transaction:', txId);
    console.log('🏷️ Transaction addresses:', getAddressesFromTransaction(transaction));
    console.log('👤 Author address:', getAuthorFromTransaction(transaction));

    const result = await extractImageFromTransaction(transaction);
    if (result) {
        console.log('✅ Successfully extracted image:', {
            width: result.width,
            height: result.height,
            format: result.format,
            size: result.data.length
        });
    } else {
        console.log('❌ Failed to extract image');
    }
}

// Run tests
testTransactionParsing().catch(console.error);
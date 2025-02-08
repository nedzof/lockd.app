import {
    method,
    prop,
    SmartContract,
    assert,
    PubKeyHash,
    Sig,
    PubKey,
    hash160,
    ContractTransaction,
    ByteString,
    Utils
} from 'scrypt-ts'

export class Lockup extends SmartContract {
    static readonly MIN_AMOUNT = 1000n; // 1000 satoshis minimum
    static readonly MAX_BLOCK_HEIGHT = 500000000n;
    static readonly MIN_BLOCK_HEIGHT = 1n;

    @prop(true)
    readonly lockUntilHeight: bigint

    @prop(true)
    readonly pkhash: PubKeyHash

    constructor(pkhash: PubKeyHash, lockUntilHeight: bigint) {
        super(...arguments)
        // Block height validation
        assert(lockUntilHeight > this.MIN_BLOCK_HEIGHT, 'lock height too low')
        assert(lockUntilHeight < this.MAX_BLOCK_HEIGHT, 'must use blockHeight locktime')
        
        this.lockUntilHeight = lockUntilHeight
        this.pkhash = pkhash
    }

    @method()
    public unlock(sig: Sig, pubkey: PubKey): void {
        // Block height validations
        assert(this.ctx.locktime < this.MAX_BLOCK_HEIGHT, 'must use blockHeight locktime')
        assert(this.ctx.sequence < 0xffffffffn, 'must use sequence locktime')
        assert(
            this.ctx.locktime >= this.lockUntilHeight,
            'lockUntilHeight not reached'
        )

        // Public key validation
        assert(
            hash160(pubkey) == this.pkhash,
            'public key hashes are not equal'
        )

        // Signature validation
        assert(this.checkSig(sig, pubkey), 'signature check failed')
    }

    static async buildTxForDeployment(
        pkhash: PubKeyHash,
        lockUntilHeight: bigint,
        amount: bigint,
        opReturnData?: ByteString[]
    ): Promise<ContractTransaction> {
        // Amount validation
        assert(amount >= this.MIN_AMOUNT, 'amount too low')
        
        const instance = new Lockup(pkhash, lockUntilHeight)
        return await instance.deploy(amount, { opReturnData })
    }

    static async loadFromChain(txid: string): Promise<Lockup> {
        // Validate txid format
        assert(Utils.isHex(txid) && txid.length === 64, 'invalid txid format')
        
        // Load contract state from chain
        const instance = new Lockup(
            PubKeyHash('0000000000000000000000000000000000000000'),
            0n
        )
        await instance.connect(txid)
        return instance
    }
} 
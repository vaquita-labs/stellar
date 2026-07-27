import { Address, hash } from '@stellar/stellar-sdk';

/**
 * Recompute the VaquitaPool position id the same way the contract does:
 *
 *   deposit_id = sha256( caller.to_xdr()  ||  nonce_be_u64 )
 *
 * where `caller.to_xdr()` is the XDR encoding of the `ScVal::Address` and the
 * nonce is 8 bytes big-endian. This lets the client store `deposit_id_hex`
 * immediately (matching the on-chain deposit event) without an extra RPC call.
 *
 * VERIFY ON FIRST TESTNET DEPOSIT: the derived hex must equal the `deposit_id`
 * in the emitted deposit event (and `compute_deposit_id(caller, nonce)`); if it
 * ever diverges it's a byte-layout mismatch to fix here only.
 */
export function deriveDepositId(address: string, nonce: bigint | number | string): string {
  const n = BigInt(nonce);
  if (n < 0n || n > 0xffffffffffffffffn) throw new Error('nonce out of u64 range');

  const addrXdr = new Address(address).toScVal().toXDR(); // Buffer (raw ScVal XDR)
  const nonceBe = Buffer.alloc(8);
  nonceBe.writeBigUInt64BE(n);

  return hash(Buffer.concat([addrXdr, nonceBe])).toString('hex');
}

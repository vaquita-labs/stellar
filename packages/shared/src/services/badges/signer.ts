import { createHash } from 'crypto';
import { Address, Keypair, nativeToScVal } from '@stellar/stellar-sdk';

/**
 * Builds the exact byte sequence the vaquita-badges contract hashes before verifying:
 *   sha256( wallet_xdr || badge_type_xdr || cycle_id_be4 || expiry_be8 )
 *
 * - wallet_xdr    : XDR encoding of ScVal::Address(ScAddress::Account(pubkey))
 * - badge_type_xdr: XDR encoding of ScVal::Symbol(badge_type)
 * - cycle_id_be4  : 4 big-endian bytes  (u32)
 * - expiry_be8    : 8 big-endian bytes  (u64, Unix timestamp)
 */
export function buildBadgeMessageBytes(
  wallet: string,
  badgeType: string,
  cycleId: number,
  expiry: number,
): Buffer {
  const walletXdr = new Address(wallet).toScVal().toXDR() as Buffer;
  const symXdr = nativeToScVal(badgeType, { type: 'symbol' }).toXDR() as Buffer;

  const cycleIdBuf = Buffer.alloc(4);
  cycleIdBuf.writeUInt32BE(cycleId);

  const expiryBuf = Buffer.alloc(8);
  expiryBuf.writeBigUInt64BE(BigInt(expiry));

  return Buffer.concat([walletXdr, symXdr, cycleIdBuf, expiryBuf]);
}

export function signBadgeClaim(
  wallet: string,
  badgeType: string,
  cycleId: number,
  expiry: number,
  keypair: Keypair,
): string {
  const msg = buildBadgeMessageBytes(wallet, badgeType, cycleId, expiry);
  const hash = createHash('sha256').update(msg).digest();
  return (keypair.sign(hash) as Buffer).toString('base64');
}

/** Load the badge signing keypair from BADGE_SIGNING_SEED env var (64-char hex = 32 bytes). */
export function getBadgeSigningKeypair(): Keypair {
  const seedHex = process.env.BADGE_SIGNING_SEED ?? '';
  if (seedHex.length !== 64) {
    throw new Error('BADGE_SIGNING_SEED must be a 64-char hex string (32 bytes)');
  }
  return Keypair.fromRawEd25519Seed(Buffer.from(seedHex, 'hex'));
}

/** Returns BADGE_SIGNING_SEED public key as raw 32-byte hex (for contract initialize). */
export function getBadgeSigningPublicKeyHex(): string {
  return getBadgeSigningKeypair().rawPublicKey().toString('hex');
}

export const CLAIM_WINDOW_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function makeClaimExpiry(): number {
  return Math.floor(Date.now() / 1000) + CLAIM_WINDOW_SECONDS;
}

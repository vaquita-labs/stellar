import { createHash } from 'crypto';
import { Address, Keypair, nativeToScVal } from '@stellar/stellar-sdk';

/**
 * Builds the exact byte sequence the vaquita-badges contract hashes before verifying:
 *   sha256( contract_address_xdr || wallet_xdr || badge_type_xdr || cycle_id_be4 || expiry_be8 )
 *
 * - contract_address_xdr: XDR encoding of ScVal::Address(ScAddress::Contract(hash))
 * - wallet_xdr          : XDR encoding of ScVal::Address(ScAddress::Account(pubkey))
 * - badge_type_xdr      : XDR encoding of ScVal::Symbol(badge_type)
 * - cycle_id_be4        : 4 big-endian bytes  (u32)
 * - expiry_be8          : 8 big-endian bytes  (u64, Unix timestamp)
 */
export function buildBadgeMessageBytes(
  contractAddress: string,
  wallet: string,
  badgeType: string,
  cycleId: number,
  expiry: number,
): Buffer {
  const contractXdr = new Address(contractAddress).toScVal().toXDR() as Buffer;
  const walletXdr = new Address(wallet).toScVal().toXDR() as Buffer;
  const symXdr = nativeToScVal(badgeType, { type: 'symbol' }).toXDR() as Buffer;

  const cycleIdBuf = Buffer.alloc(4);
  cycleIdBuf.writeUInt32BE(cycleId);

  const expiryBuf = Buffer.alloc(8);
  expiryBuf.writeBigUInt64BE(BigInt(expiry));

  return Buffer.concat([contractXdr, walletXdr, symXdr, cycleIdBuf, expiryBuf]);
}

/** Max length of a Soroban `Symbol` (also the cap the admin key field enforces). */
export const BADGE_SYMBOL_MAX_LEN = 32;

/**
 * Derive the on-chain Soroban Symbol for a badge from its catalog key.
 *
 * The contract indexes each mint by `Claimed(symbol, cycle_id, wallet)`, so the
 * symbol MUST be unique per badge for the "one NFT per badge" model to hold.
 * Catalog keys are kebab-case (`first-deposit`), but a Soroban Symbol only
 * allows `[a-zA-Z0-9_]` (max 32), so we map `-` → `_`. Kebab keys never contain
 * `_`, so the mapping is injective — distinct keys never collide on one slot.
 *
 * This replaced an earlier scheme (fee9152, 2026-05-20) that signed the tier
 * (`Bronze`) as the symbol. Because many badges share a tier, that collapsed
 * every same-tier badge onto a single claim slot, so a wallet could mint only
 * one badge per tier per cycle. Per-key symbols restore per-badge granularity.
 */
export function toBadgeSymbol(badgeKey: string): string {
  const symbol = badgeKey.replace(/-/g, '_');
  if (!new RegExp(`^[a-zA-Z0-9_]{1,${BADGE_SYMBOL_MAX_LEN}}$`).test(symbol)) {
    throw new Error(
      `Cannot derive a valid Soroban Symbol from badge key "${badgeKey}": ` +
        `symbols allow only [a-zA-Z0-9_] and at most ${BADGE_SYMBOL_MAX_LEN} chars.`,
    );
  }
  return symbol;
}

export function signBadgeClaim(
  contractAddress: string,
  wallet: string,
  badgeType: string,
  cycleId: number,
  expiry: number,
  keypair: Keypair,
): string {
  const msg = buildBadgeMessageBytes(contractAddress, wallet, badgeType, cycleId, expiry);
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

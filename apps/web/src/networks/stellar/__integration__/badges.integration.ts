import { Address, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { parseBadgeMintError } from '../badgeErrors';
import { buildMintBadgeArgs } from '../sorobanTx';
import { integrationEnv, simulateInvoke, simulateView } from './testnet';

/**
 * VaquitaBadges on Soroban testnet. Minting for real needs the API's signing
 * key, so the write path is exercised up to the contract's own checks: the
 * frontend's `mint_badge` payload reaches the contract, and each rejection
 * comes back through `parseBadgeMintError` as the slug the UI shows.
 */

// Badge keys are underscore symbols on-chain (see `toBadgeSymbol` in @vaquita/shared).
const BADGE_TYPE = 'first_deposit';
const CYCLE_ID = 1;
// 64 zero bytes: a well-formed BytesN<64> that no signing key produced.
const BOGUS_SIGNATURE = Buffer.alloc(64).toString('base64');

describe('VaquitaBadges testnet — read paths', () => {
  it('exposes a versioned, unpaused badge contract with a countable supply', async (ctx) => {
    const env = integrationEnv(ctx);
    if (!env) return;

    expect(Number(await simulateView(env.rpcUrl, env.badgesContractId, 'version'))).toBeGreaterThanOrEqual(1);
    expect(await simulateView(env.rpcUrl, env.badgesContractId, 'is_paused')).toBe(false);
    expect(Number(await simulateView(env.rpcUrl, env.badgesContractId, 'total_supply'))).toBeGreaterThanOrEqual(0);
  });

  it('answers ownership and claim lookups for the integration wallet', async (ctx) => {
    const env = integrationEnv(ctx);
    if (!env) return;

    const claimed = await simulateView(
      env.rpcUrl,
      env.badgesContractId,
      'has_claimed',
      new Address(env.address).toScVal(),
      xdr.ScVal.scvSymbol(BADGE_TYPE),
      nativeToScVal(CYCLE_ID, { type: 'u32' }),
    );
    expect(claimed).toBe(false);

    // u32::MAX is never a minted token id.
    const owner = await simulateView(env.rpcUrl, env.badgesContractId, 'owner_of', nativeToScVal(0xffffffff, { type: 'u32' }));
    expect(owner).toBeFalsy();
  });
});

describe('VaquitaBadges testnet — mint_badge rejections through the app mapping', () => {
  it('maps an expired claim to "claimExpired"', async (ctx) => {
    const env = integrationEnv(ctx);
    if (!env) return;

    const sim = await simulateInvoke(
      env.rpcUrl,
      env.address,
      buildMintBadgeArgs({
        address: env.address,
        badgeContractId: env.badgesContractId,
        badgeType: BADGE_TYPE,
        cycleId: CYCLE_ID,
        expiry: 1,
        signature: BOGUS_SIGNATURE,
      }),
    );
    expect(sim.ok).toBe(false);
    if (!sim.ok) {
      expect(sim.error).toMatch(/Error\(Contract, #4\)/);
      expect(parseBadgeMintError(new Error(sim.error))).toBe('claimExpired');
    }
  });

  it('refuses a claim whose signature the admin key did not produce', async (ctx) => {
    const env = integrationEnv(ctx);
    if (!env) return;

    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const sim = await simulateInvoke(
      env.rpcUrl,
      env.address,
      buildMintBadgeArgs({
        address: env.address,
        badgeContractId: env.badgesContractId,
        badgeType: BADGE_TYPE,
        cycleId: CYCLE_ID,
        expiry,
        signature: BOGUS_SIGNATURE,
      }),
    );
    expect(sim.ok).toBe(false);
    if (!sim.ok) {
      // `ed25519_verify` traps in the host, so this surfaces as a crypto host
      // error rather than a `BadgeError` — which the UI shows as the generic message.
      expect(sim.error).toMatch(/Error\(Crypto, InvalidInput\)/);
      expect(parseBadgeMintError(new Error(sim.error))).toBe('generic');
    }
  });
});

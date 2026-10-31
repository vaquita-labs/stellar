import { Account, BASE_FEE, Keypair, Networks, Operation, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// auth_challenge_nonces as Postgres keeps it: the primary key refuses a second
// redeem of the same nonce, whichever instance sends it.
const redeemed = new Map<string, { walletAddress: string; expiresAt: Date }>();
vi.mock('@vaquita/db', () => ({
  prisma: {
    authChallengeNonce: {
      create: vi.fn(async ({ data }: { data: { nonce: string; walletAddress: string; expiresAt: Date } }) => {
        if (redeemed.has(data.nonce)) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        redeemed.set(data.nonce, data);
        return data;
      }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  },
}));

const { buildAuthChallenge, verifyAuthChallenge, walletAuthDeps } = await import('./walletAuth');
// Horizon stays out of unit tests: by default the account is not on the ledger
// yet, so its master key is its only signer.
const notOnLedger = async () => null;

// STELLAR_NETWORK is 'testnet' in vitest.config.ts.
const PASSPHRASE = Networks.TESTNET;

function signed(xdr: string, ...signers: Keypair[]): string {
  const tx = new Transaction(xdr, PASSPHRASE);
  for (const signer of signers) tx.sign(signer);
  return tx.toXDR();
}

// A challenge with any nonce, shaped like the ones the API builds (AUTH_HOME_DOMAIN is 'vaquita.app').
function challengeWith(walletAddress: string, nonce: string): string {
  const now = Math.floor(Date.now() / 1000);
  return new TransactionBuilder(new Account(walletAddress, '-1'), {
    fee: BASE_FEE,
    networkPassphrase: PASSPHRASE,
    timebounds: { minTime: now, maxTime: now + 300 },
  })
    .addOperation(Operation.manageData({ name: 'vaquita.app auth', value: nonce }))
    .build()
    .toXDR();
}

function nonceOf(xdr: string): string {
  const op = new Transaction(xdr, PASSPHRASE).operations[0];
  return op?.type === 'manageData' ? (op.value?.toString('utf8') ?? '') : '';
}

beforeEach(() => {
  redeemed.clear();
  walletAuthDeps.accountSigners = notOnLedger;
});

describe('wallet challenge nonces', () => {

  it('fits the nonce in a manage_data value', () => {
    const wallet = Keypair.random();
    expect(Buffer.byteLength(nonceOf(buildAuthChallenge(wallet.publicKey()).transaction))).toBeLessThanOrEqual(64);
  });

  it('verifies a challenge without the instance that issued it holding any state', async () => {
    const wallet = Keypair.random();
    const { transaction } = buildAuthChallenge(wallet.publicKey());
    // Nothing is written when the challenge is issued: any instance can verify it.
    expect(redeemed.size).toBe(0);
    await expect(verifyAuthChallenge(signed(transaction, wallet), wallet.publicKey())).resolves.toBe(wallet.publicKey());
    expect(redeemed.size).toBe(1);
  });

  it('refuses a second redeem of the same challenge', async () => {
    const wallet = Keypair.random();
    const xdr = signed(buildAuthChallenge(wallet.publicKey()).transaction, wallet);
    await verifyAuthChallenge(xdr, wallet.publicKey());
    await expect(verifyAuthChallenge(xdr, wallet.publicKey())).rejects.toThrow('already used');
  });

  it('refuses a nonce sealed for another wallet', async () => {
    const wallet = Keypair.random();
    const other = Keypair.random();
    const otherNonce = nonceOf(buildAuthChallenge(other.publicKey()).transaction);
    const xdr = signed(challengeWith(wallet.publicKey(), otherNonce), wallet);
    await expect(verifyAuthChallenge(xdr, wallet.publicKey())).rejects.toThrow('not issued here');
    expect(redeemed.size).toBe(0);
  });

  it('refuses a nonce whose tag was not made with the session secret', async () => {
    const wallet = Keypair.random();
    const [id, expiry] = nonceOf(buildAuthChallenge(wallet.publicKey()).transaction).split('.');
    const forged = `${id}.${expiry}.${Buffer.alloc(16).toString('base64url')}`;
    const xdr = signed(challengeWith(wallet.publicKey(), forged), wallet);
    await expect(verifyAuthChallenge(xdr, wallet.publicKey())).rejects.toThrow('not issued here');
    expect(redeemed.size).toBe(0);
  });

  it('refuses a nonce whose expiry was pushed out', async () => {
    const wallet = Keypair.random();
    const [id, expiry, tag] = nonceOf(buildAuthChallenge(wallet.publicKey()).transaction).split('.');
    const extended = `${id}.${Number(expiry) + 3600}.${tag}`;
    const xdr = signed(challengeWith(wallet.publicKey(), extended), wallet);
    await expect(verifyAuthChallenge(xdr, wallet.publicKey())).rejects.toThrow('not issued here');
  });

  it('does not burn the challenge on a bad signature', async () => {
    const wallet = Keypair.random();
    const { transaction } = buildAuthChallenge(wallet.publicKey());
    await expect(verifyAuthChallenge(signed(transaction, Keypair.random()), wallet.publicKey())).rejects.toThrow();
    expect(redeemed.size).toBe(0);
    await expect(verifyAuthChallenge(signed(transaction, wallet), wallet.publicKey())).resolves.toBe(wallet.publicKey());
  });
});

describe('wallet challenge signers', () => {
  it('accepts the signer of a co-signed wallet whose master key weighs 0', async () => {
    const wallet = Keypair.random();
    const turnkey = Keypair.random();
    walletAuthDeps.accountSigners = async () => ({
      signers: [
        { key: turnkey.publicKey(), weight: 1 },
        { key: wallet.publicKey(), weight: 0 },
      ],
      threshold: 1,
    });
    const xdr = signed(buildAuthChallenge(wallet.publicKey()).transaction, turnkey);
    await expect(verifyAuthChallenge(xdr, wallet.publicKey())).resolves.toBe(wallet.publicKey());
  });

  it('refuses the master key once it weighs 0', async () => {
    const wallet = Keypair.random();
    walletAuthDeps.accountSigners = async () => ({
      signers: [
        { key: Keypair.random().publicKey(), weight: 1 },
        { key: wallet.publicKey(), weight: 0 },
      ],
      threshold: 1,
    });
    const xdr = signed(buildAuthChallenge(wallet.publicKey()).transaction, wallet);
    await expect(verifyAuthChallenge(xdr, wallet.publicKey())).rejects.toThrow('not signed by the wallet');
  });

  it('refuses a key that is not one of the account signers', async () => {
    const wallet = Keypair.random();
    walletAuthDeps.accountSigners = async () => ({ signers: [{ key: wallet.publicKey(), weight: 1 }], threshold: 1 });
    const xdr = signed(buildAuthChallenge(wallet.publicKey()).transaction, Keypair.random());
    await expect(verifyAuthChallenge(xdr, wallet.publicKey())).rejects.toThrow('not signed by the wallet');
  });

  it('needs the signatures of a multisig wallet to reach its threshold', async () => {
    const wallet = Keypair.random();
    const a = Keypair.random();
    const b = Keypair.random();
    walletAuthDeps.accountSigners = async () => ({
      signers: [
        { key: a.publicKey(), weight: 1 },
        { key: b.publicKey(), weight: 1 },
        { key: wallet.publicKey(), weight: 0 },
      ],
      threshold: 2,
    });
    const { transaction } = buildAuthChallenge(wallet.publicKey());
    await expect(verifyAuthChallenge(signed(transaction, a), wallet.publicKey())).rejects.toThrow('not signed by the wallet');
    await expect(verifyAuthChallenge(signed(transaction, a, b), wallet.publicKey())).resolves.toBe(wallet.publicKey());
  });

  it('accepts the master key of an account with its default signers', async () => {
    const wallet = Keypair.random();
    walletAuthDeps.accountSigners = async () => ({ signers: [{ key: wallet.publicKey(), weight: 1 }], threshold: 0 });
    const xdr = signed(buildAuthChallenge(wallet.publicKey()).transaction, wallet);
    await expect(verifyAuthChallenge(xdr, wallet.publicKey())).resolves.toBe(wallet.publicKey());
  });

  it('refuses the login and keeps the challenge when Horizon fails', async () => {
    const wallet = Keypair.random();
    walletAuthDeps.accountSigners = async () => {
      throw new Error('Horizon unavailable');
    };
    const { transaction } = buildAuthChallenge(wallet.publicKey());
    await expect(verifyAuthChallenge(signed(transaction, wallet), wallet.publicKey())).rejects.toThrow('Horizon unavailable');
    expect(redeemed.size).toBe(0);
    walletAuthDeps.accountSigners = notOnLedger;
    await expect(verifyAuthChallenge(signed(transaction, wallet), wallet.publicKey())).resolves.toBe(wallet.publicKey());
  });
});

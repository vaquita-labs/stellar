import {
  Account,
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  NotFoundError,
  Operation,
  StrKey,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { RequestHandler } from 'express';
import { prisma } from '@vaquita/db';
import { resolveNetworkPassphrase, sendError } from '@vaquita/shared';
import { apiEnv } from '../config/env';
import { logger } from './logger';

/**
 * Wallet-session authentication (SEP-10 inspired).
 *
 * The API historically trusted the `walletAddress` in the URL ("wallet-trust"),
 * which let anyone mutate anyone else's profile. This module closes that hole:
 *
 *  1. POST /auth/challenge  → we build a challenge transaction for the claimed
 *     wallet, its nonce sealed with an HMAC so any API instance can check it.
 *  2. The client signs it with a key the wallet's account accepts (Pollar
 *     signTx routes this to Freighter/xBull for external wallets, to Pollar's
 *     custodial signer, or to the Turnkey signer of a co-signed wallet).
 *  3. POST /auth/verify     → we check the nonce's HMAC and expiry, the
 *     wallet's signature, redeem the nonce once (auth_challenge_nonces) and
 *     issue a short-lived HMAC session token (JWT, HS256).
 *  4. Mutating routes use `requireWalletSession`, which matches the token's
 *     wallet against the `:walletAddress` route param.
 *
 * NOT stock SEP-10: Pollar's custodial signer refuses any transaction whose
 * source is not the user's own account ("tx.source debe coincidir con
 * publicKey"), and SEP-10 puts the SERVER account as tx.source. So the
 * challenge uses the USER's wallet as source with sequence number 0 — real
 * account sequences start at ledgerSeq<<32, so a seq-0 transaction can never
 * be executed on-chain; it is only ever a signature carrier. Authenticity of
 * the challenge comes from the nonce's HMAC (we only accept challenges we
 * minted) and its redeem row (once), which is what the server signature
 * provides in stock SEP-10.
 *
 * Env (all required, validated at startup):
 *  - AUTH_SESSION_SECRET     HMAC key for session tokens and challenge
 *                            nonces (apiEnv, min 32 chars). Fixed across PM2
 *                            instances so what one instance issues verifies
 *                            on another.
 *  - AUTH_HOME_DOMAIN        manage_data key label (apiEnv).
 *  - STELLAR_NETWORK         mainnet|testnet; the passphrase is derived from
 *                            it. The API refuses to start if it is unset (see
 *                            resolveNetworkPassphrase) so it can never
 *                            silently verify mainnet signatures against the
 *                            testnet hash.
 *  - WALLET_AUTH_ENFORCE     'false' logs instead of rejecting (escape hatch
 *                            while rolling out, e.g. if a wallet type turns
 *                            out unable to sign challenges).
 */

const CHALLENGE_TIMEOUT_SECONDS = 300;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const HOME_DOMAIN = apiEnv.AUTH_HOME_DOMAIN;
// Resolved at module load: a misconfigured network throws here, failing API
// startup with a clear error instead of silently defaulting to testnet.
const NETWORK_PASSPHRASE = resolveNetworkPassphrase();

export const isWalletAuthEnforced = apiEnv.WALLET_AUTH_ENFORCE === 'true';

const sessionSecret = Buffer.from(apiEnv.AUTH_SESSION_SECRET, 'utf8');

export function isValidWalletAddress(value: unknown): value is string {
  return typeof value === 'string' && StrKey.isValidEd25519PublicKey(value);
}

const MANAGE_DATA_KEY = `${HOME_DOMAIN} auth`;

// The API runs as several PM2 instances and /challenge and /verify can land on
// different ones, so the nonce cannot live in one process's memory: a Map here
// fails every login whose two calls hit different instances. The nonce is
// `<id>.<expiry>.<tag>`, the tag an HMAC over the wallet, id and expiry, so any
// instance can tell it was minted here, for that wallet, and when it expires.
// It fits manage_data's 64-byte value: 16 + 1 + 10 + 1 + 22 characters.
const NONCE_TAG_BYTES = 16;

function nonceTag(walletAddress: string, id: string, expiresAt: number): Buffer {
  return createHmac('sha256', sessionSecret)
    .update(`challenge:${walletAddress}.${id}.${expiresAt}`)
    .digest()
    .subarray(0, NONCE_TAG_BYTES);
}

function sealNonce(walletAddress: string, expiresAt: number): string {
  const id = randomBytes(12).toString('base64url');
  return `${id}.${expiresAt}.${nonceTag(walletAddress, id, expiresAt).toString('base64url')}`;
}

/** The nonce's id and expiry (unix seconds) when its tag is ours for this wallet, else null. */
function openNonce(nonce: string, walletAddress: string): { id: string; expiresAt: number } | null {
  const [id = '', expiry = '', tag = '', ...rest] = nonce.split('.');
  if (rest.length > 0 || !id || !/^\d+$/.test(expiry)) return null;
  const expiresAt = Number(expiry);
  const provided = Buffer.from(tag, 'base64url');
  const expected = nonceTag(walletAddress, id, expiresAt);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  return { id, expiresAt };
}

const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';

/**
 * Redeem the nonce once. The insert is the single-use rule on every instance:
 * the second redeem of the same id fails the primary key.
 */
async function redeemNonce(id: string, walletAddress: string, expiresAt: number): Promise<void> {
  try {
    await prisma.authChallengeNonce.create({
      data: { nonce: id, walletAddress, expiresAt: new Date(expiresAt * 1000) },
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new Error('Challenge was already used');
    throw err;
  }
  void prisma.authChallengeNonce
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch((err: unknown) => logger.warn({ err }, 'Could not prune expired auth challenge nonces'));
}

const horizon = new Horizon.Server(
  NETWORK_PASSPHRASE === Networks.PUBLIC ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org',
);

type AccountSigners = { signers: { key: string; weight: number }[]; threshold: number };

export const walletAuthDeps = {
  /**
   * The account's ed25519 signers and the weight a login needs (its medium
   * threshold), or null when the account is not on the ledger yet. Any other
   * Horizon failure throws: a login is refused rather than decided without
   * the signers.
   */
  accountSigners: async (walletAddress: string): Promise<AccountSigners | null> => {
    try {
      const account = await horizon.loadAccount(walletAddress);
      return {
        signers: account.signers
          .filter((s) => s.type === 'ed25519_public_key')
          .map((s) => ({ key: s.key, weight: s.weight })),
        threshold: account.thresholds.med_threshold,
      };
    } catch (err) {
      if (err instanceof NotFoundError) return null;
      throw err;
    }
  },
};

export function buildAuthChallenge(walletAddress: string): { transaction: string; networkPassphrase: string } {
  const now = Math.floor(Date.now() / 1000);
  const nonce = sealNonce(walletAddress, now + CHALLENGE_TIMEOUT_SECONDS);

  // Sequence "-1" makes the transaction's own sequence 0: no Stellar account
  // can ever reach it (sequences start at ledgerSeq<<32), so the signed result
  // is unsubmittable by construction — exactly like a SEP-10 challenge.
  const account = new Account(walletAddress, '-1');
  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
    timebounds: { minTime: now, maxTime: now + CHALLENGE_TIMEOUT_SECONDS },
  })
    .addOperation(Operation.manageData({ name: MANAGE_DATA_KEY, value: nonce }))
    .build();

  return { transaction: transaction.toXDR(), networkPassphrase: NETWORK_PASSPHRASE };
}

/** Verify a signed challenge and return the authenticated wallet, or throw. */
export async function verifyAuthChallenge(signedXdr: string, expectedWallet: string): Promise<string> {
  const tx = new Transaction(signedXdr, NETWORK_PASSPHRASE);

  if (tx.source !== expectedWallet) {
    throw new Error('Challenge was issued for a different wallet');
  }
  if (tx.sequence !== '0') {
    throw new Error('Challenge must have sequence number 0');
  }

  const op = tx.operations[0];
  if (tx.operations.length !== 1 || !op || op.type !== 'manageData' || op.name !== MANAGE_DATA_KEY) {
    throw new Error('Challenge has an unexpected shape');
  }
  const nonce = openNonce(op.value?.toString('utf8') ?? '', expectedWallet);
  if (!nonce) throw new Error('Challenge was not issued here for this wallet');
  if (nonce.expiresAt <= Math.floor(Date.now() / 1000)) throw new Error('Challenge expired');

  // The account's signers decide, not its master key: a co-signed or multisig
  // wallet signs with another key while its master key weighs 0, so checking
  // the master key alone refuses every login of those wallets.
  const hash = tx.hash();
  const signedBy = (key: string) => {
    const keypair = Keypair.fromPublicKey(key);
    return tx.signatures.some((sig) => keypair.verify(hash, sig.signature()));
  };
  const account = await walletAuthDeps.accountSigners(expectedWallet);
  // An account not on the ledger yet has its master key as its only signer.
  const signers = account?.signers ?? [{ key: expectedWallet, weight: 1 }];
  const threshold = Math.max(account?.threshold ?? 0, 1);
  const weight = signers.filter((s) => s.weight > 0 && signedBy(s.key)).reduce((sum, s) => sum + s.weight, 0);
  if (weight < threshold) {
    throw new Error('Challenge is not signed by the wallet');
  }

  // Redeemed only after every check passed: a bad signature must not burn it.
  await redeemNonce(nonce.id, expectedWallet, nonce.expiresAt);
  return expectedWallet;
}

// ── Session tokens (compact HS256 JWT, no external deps) ────────────────────

const base64url = (input: Buffer | string): string =>
  Buffer.from(input).toString('base64url');

const JWT_HEADER = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

export function issueSessionToken(walletAddress: string): { token: string; expiresAt: number } {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + SESSION_TTL_SECONDS;
  const payload = base64url(JSON.stringify({ sub: walletAddress, iat: now, exp: expiresAt }));
  const signature = createHmac('sha256', sessionSecret).update(`${JWT_HEADER}.${payload}`).digest('base64url');
  return { token: `${JWT_HEADER}.${payload}.${signature}`, expiresAt };
}

/** Returns the wallet address the token authenticates, or null. */
export function verifySessionToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header = '', payload = '', signature = ''] = parts;
  const expected = createHmac('sha256', sessionSecret).update(`${header}.${payload}`).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub?: unknown;
      exp?: unknown;
    };
    if (typeof claims.sub !== 'string' || typeof claims.exp !== 'number') return null;
    if (claims.exp <= Math.floor(Date.now() / 1000)) return null;
    return claims.sub;
  } catch {
    return null;
  }
}

/**
 * Route middleware for endpoints keyed by `:walletAddress` or `:wallet`: the
 * request must carry `Authorization: Bearer <session token>` whose wallet
 * matches the route param.
 */
const requireWalletSessionForParam =
  (paramName: 'walletAddress' | 'wallet'): RequestHandler =>
  (req, res, next) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  const wallet = verifySessionToken(token);
  const routeWallet = req.params[paramName];

  if (wallet && wallet === routeWallet) return next();

  if (!isWalletAuthEnforced) {
    req.log.warn(
      { walletAddress: routeWallet, hasToken: Boolean(token), tokenWallet: wallet },
      'WALLET_AUTH_ENFORCE=false — letting unauthenticated mutation through',
    );
    return next();
  }

  if (!wallet) {
    sendError(res, 'Authentication required.', null, 401);
    return;
  }
  req.log.warn({ tokenWallet: wallet, walletAddress: routeWallet }, 'Session wallet does not match route wallet');
  sendError(res, 'You are not allowed to modify this profile.', null, 403);
};

export const requireWalletSession: RequestHandler<{ walletAddress: string }> =
  requireWalletSessionForParam('walletAddress');

/**
 * Route middleware for endpoints that carry NO wallet in the URL: the caller's
 * identity comes only from the session token, and the resolved wallet is stashed
 * on `res.locals.sessionWallet` for the handler.
 *
 * Unlike `requireWalletSession`, `WALLET_AUTH_ENFORCE=false` is NOT an escape
 * hatch here. That flag exists to keep serving requests whose subject is already
 * named in the URL; with no route param there is no subject to fall back to, so
 * an unauthenticated request has no identity to act on and must be rejected.
 */
export const requireSessionWallet: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  const wallet = verifySessionToken(token);

  if (!wallet) {
    sendError(res, 'Authentication required.', null, 401);
    return;
  }

  res.locals.sessionWallet = wallet;
  return next();
};

/** Reads the wallet `requireSessionWallet` authenticated for this request. */
export const getSessionWallet = (res: { locals: Record<string, unknown> }): string =>
  String(res.locals.sessionWallet ?? '');

export const requireWalletParamSession: RequestHandler<{ wallet: string }> =
  requireWalletSessionForParam('wallet');

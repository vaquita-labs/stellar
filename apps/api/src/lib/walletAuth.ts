import {
  Account,
  BASE_FEE,
  Keypair,
  Operation,
  StrKey,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { RequestHandler } from 'express';
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
 *     wallet and remember its one-shot nonce server-side.
 *  2. The client signs it with the wallet's key (Pollar signTx routes this to
 *     Freighter/xBull for external wallets or to Pollar's custodial signer).
 *  3. POST /auth/verify     → we check the wallet's signature + the nonce and
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
 * the challenge comes from the server-side nonce store (we only accept
 * challenges we minted, once), which is what the server signature provides in
 * stock SEP-10.
 *
 * Env (todas requeridas, validadas con zod al arrancar):
 *  - AUTH_SESSION_SECRET     HMAC key for session tokens (apiEnv, min 32
 *                            chars). Fixed across PM2 instances so tokens
 *                            issued by one instance verify on another.
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

// One-shot nonces: a challenge is only accepted if WE minted it, for THAT
// wallet, within its lifetime — and verifying consumes it, so a captured
// signed challenge can't be replayed to mint a second token. In-memory is
// enough for a single API process.
const pendingNonces = new Map<string, { walletAddress: string; expiresAt: number }>();

function pruneNonces(): void {
  const now = Date.now();
  for (const [nonce, entry] of pendingNonces) {
    if (entry.expiresAt <= now) pendingNonces.delete(nonce);
  }
}

export function buildAuthChallenge(walletAddress: string): { transaction: string; networkPassphrase: string } {
  pruneNonces();
  const nonce = randomBytes(32).toString('base64');
  const now = Math.floor(Date.now() / 1000);

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

  pendingNonces.set(nonce, {
    walletAddress,
    expiresAt: (now + CHALLENGE_TIMEOUT_SECONDS) * 1000,
  });
  return { transaction: transaction.toXDR(), networkPassphrase: NETWORK_PASSPHRASE };
}

/** Verify a signed challenge and return the authenticated wallet, or throw. */
export function verifyAuthChallenge(signedXdr: string, expectedWallet: string): string {
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
  const nonce = op.value?.toString('utf8') ?? '';
  const entry = pendingNonces.get(nonce);
  if (!entry || entry.walletAddress !== expectedWallet || entry.expiresAt <= Date.now()) {
    throw new Error('Unknown, expired or already-used challenge');
  }

  const hash = tx.hash();
  const keypair = Keypair.fromPublicKey(expectedWallet);
  const signedByWallet = tx.signatures.some((sig) => keypair.verify(hash, sig.signature()));
  if (!signedByWallet) {
    throw new Error('Challenge is not signed by the wallet');
  }

  pendingNonces.delete(nonce); // consume only after every check passed
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

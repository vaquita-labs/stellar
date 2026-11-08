import { isWalletNotReady } from '@pollar/core';
import { clientEnv } from '@/core-ui/config/clientEnv';
import { getPollarBinding } from './wallet/adapters/pollar-adapter';
import {
  ensureWalletAddress,
  isWalletRecoveryRequired,
  waitForWalletReady,
  WalletNotReadyError,
  WalletRecoveryRequiredError,
} from './walletReady';

/**
 * Wallet-session tokens for the Vaquita API.
 *
 * Mutating profile endpoints require `Authorization: Bearer <token>`. The
 * token is obtained once per wallet via a SEP-10 style challenge: the API
 * hands out a challenge transaction, the wallet signs it (through Pollar —
 * external wallets pop their extension, custodial wallets sign server-side
 * with no UI), and the API exchanges the signature for a session token that
 * lives for days. Cached in localStorage; renewed transparently on expiry
 * or on a 401/403.
 */

const STORAGE_KEY = 'vaquita-wallet-session';
// Renew slightly early so a token never expires mid-request.
const EXPIRY_MARGIN_SECONDS = 60;

type StoredSession = { walletAddress: string; token: string; expiresAt: number };

function readStoredToken(walletAddress: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as StoredSession;
    if (session.walletAddress !== walletAddress) return null;
    if (session.expiresAt - EXPIRY_MARGIN_SECONDS <= Date.now() / 1000) return null;
    return session.token;
  } catch {
    return null;
  }
}

/**
 * Whether a usable token is already cached for this wallet.
 *
 * For callers that must not provoke a signature prompt: `authFetch` logs in
 * transparently when there is no token, which pops the wallet. Background work
 * (a balance refresh on app open, say) has to stay silent, so it checks this
 * first and skips itself rather than interrupting the user.
 */
export function hasWalletSession(walletAddress: string): boolean {
  return readStoredToken(walletAddress) !== null;
}

export function clearWalletSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}

// An extension prompt that never shows up (blocked, hidden behind the window,
// locked wallet) leaves signTx pending forever. Because login is single-flight,
// that one hung promise would stall every authenticated request until a reload.
const SIGN_TIMEOUT_MS = 2 * 60 * 1000;

function withSignTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('The wallet did not respond to the signature request')), SIGN_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function loginWithWallet(walletAddress: string): Promise<string> {
  const base = clientEnv.NEXT_PUBLIC_SERVICES_URL;
  const binding = getPollarBinding();
  if (!binding) {
    throw new Error('Wallet is not connected');
  }
  const client = binding.client;

  // A new email account can exist in Pollar before its Stellar account does
  // (`NONE` with no address, or `CREATING`). Signing then returns
  // SDK_WALLET_NOT_READY, the nickname call goes out with no token, and the
  // API answers "Authentication required."
  await ensureWalletAddress(client);

  for (let attempt = 0; attempt < 2; attempt += 1) {

    const challengeRes = await fetch(`${base}/api/v1/auth/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress }),
    });
    const challengeData = await challengeRes.json();
    const transaction = challengeData?.data?.transaction as string | undefined;
    if (!challengeRes.ok || !transaction) {
      throw new Error(challengeData?.message || 'Could not get an authentication challenge');
    }

    const outcome = await withSignTimeout(client.signTx(transaction));
    if (outcome.status === 'signed' && outcome.signedXdr) {
      const verifyRes = await fetch(`${base}/api/v1/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, signedXdr: outcome.signedXdr }),
      });
      const verifyData = await verifyRes.json();
      const token = verifyData?.data?.token as string | undefined;
      const expiresAt = verifyData?.data?.expiresAt as number | undefined;
      if (!verifyRes.ok || !token || !expiresAt) {
        throw new Error(verifyData?.message || 'Could not verify the wallet signature');
      }

      if (typeof window !== 'undefined') {
        const session: StoredSession = { walletAddress, token, expiresAt };
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      }
      return token;
    }

    if (attempt === 0 && isWalletNotReady(outcome)) {
      await waitForWalletReady(client);
      continue;
    }

    // A first account has no recovery method yet. Signing is refused on purpose
    // and the recovery screen is the next step, not a failed vaquitag.
    if (isWalletRecoveryRequired(outcome)) throw new WalletRecoveryRequiredError();

    throw new Error(('details' in outcome && outcome.details) || 'The wallet did not sign the authentication challenge');
  }

  throw new Error('The wallet did not sign the authentication challenge');
}

// Single-flight: concurrent mutations while logged out trigger ONE challenge
// signature, not one wallet popup per request.
let loginPromise: Promise<string> | null = null;

export async function getWalletSessionToken(walletAddress: string): Promise<string> {
  const cached = readStoredToken(walletAddress);
  if (cached) return cached;
  if (!loginPromise) {
    loginPromise = loginWithWallet(walletAddress).finally(() => {
      loginPromise = null;
    });
  }
  return loginPromise;
}

/**
 * fetch() with the wallet-session Authorization header. On 401/403 the cached
 * token is dropped and the request retried once with a fresh login.
 *
 * Never throws because of the login flow itself (e.g. the user dismissed the
 * wallet's signature prompt): in that case the request goes out without a
 * token and callers see the API's regular 401 JSON error — the same
 * `success: false` path they already handle — instead of an unhandled
 * rejection.
 */
export async function authFetch(url: string, init: RequestInit, walletAddress: string): Promise<Response> {
  const attempt = async (token: string | null) =>
    fetch(
      url,
      token
        ? { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` } }
        : init,
    );

  let token: string | null = null;
  let loginError: Error | null = null;
  try {
    token = await getWalletSessionToken(walletAddress);
  } catch (err) {
    loginError = err instanceof Error ? err : new Error(String(err));
    console.warn('[walletSession] could not obtain a session token:', err);
  }

  // The recovery screen is already opening. Posting the nickname without a
  // session only produces "Authentication required."
  if (loginError instanceof WalletRecoveryRequiredError) {
    return new Response(JSON.stringify({ status: 'error', message: loginError.message }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let response = await attempt(token);

  // The request went out without a token because the login flow itself failed
  // (signing rejected, Pollar error, …). The server's plain "Authentication
  // required." hides the real cause — surface it in the JSON the caller toasts.
  if (!token && loginError && (response.status === 401 || response.status === 403)) {
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    // A wallet that is still being created has not failed authentication. The
    // server's "Authentication required." hides that, and the vaquitag screen
    // was reporting it as if the name could not be saved.
    const serverMessage = typeof body.message === 'string' ? body.message : 'Authentication required.';
    const message =
      loginError instanceof WalletNotReadyError ? loginError.message : `${serverMessage} — ${loginError.message}`;
    return new Response(JSON.stringify({ ...body, message }), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (token && (response.status === 401 || response.status === 403)) {
    clearWalletSession();
    try {
      token = await getWalletSessionToken(walletAddress);
    } catch (err) {
      console.warn('[walletSession] re-login after 401/403 failed:', err);
      return response;
    }
    response = await attempt(token);
  }
  return response;
}

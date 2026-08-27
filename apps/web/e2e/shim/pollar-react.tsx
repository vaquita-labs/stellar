'use client';

/**
 * Drop-in for `@pollar/react` used only by the end-to-end suite.
 *
 * `next.config.ts` aliases `@pollar/react` to this file when `E2E_TEST_SIGNER=1`
 * is set at build/dev time. Every export is the real package's — the module
 * below is imported straight from `node_modules` — except `PollarProvider`,
 * which is wrapped to:
 *
 *  1. register a `LocalKeyAdapter` (a Stellar keypair that signs anything the
 *     SDK asks it to) next to the wallet adapters the app already configures;
 *  2. log in through that adapter as soon as the client has restored (or found
 *     no) session, so the app lands authenticated without Pollar's hosted modal.
 *
 * Nothing else changes: the same `PollarClient` talks to the same Pollar
 * backend, builds and submits the same transactions, and the app's hooks
 * (`usePollar`, `PollarBridge`, `walletSession.ts`, …) run untouched.
 *
 * Without the env flag this file is never resolved, so production bundles are
 * identical with or without it in the tree.
 */

import { PollarClient, type PollarClientConfig } from '@pollar/core';
import { useEffect, useState, type ComponentProps } from 'react';
import * as real from '../../node_modules/@pollar/react/dist/index.mjs';
import { E2E_ADAPTER_ID, LocalKeyAdapter, readE2ESecret } from './local-key-adapter';

export * from '../../node_modules/@pollar/react/dist/index.mjs';

type ProviderProps = ComponentProps<typeof real.PollarProvider>;

/** Clients whose auto-login already started; keyed by instance so StrictMode's double effect stays idempotent. */
const started = new WeakSet<object>();

/** How many times a failed connection is retried before the spec is told the login failed. */
const LOGIN_RETRIES = 3;
/** Multiplied by the attempt number, so the waits grow 1s, 2s, 3s. */
const LOGIN_RETRY_BACKOFF_MS = 1_000;

function E2EAutoLogin() {
  const { getClient, login } = real.usePollar();

  useEffect(() => {
    const client = getClient();
    let cancelled = false;
    void client.ready().then(() => {
      if (cancelled || started.has(client)) return;
      if (client.getWallet()) {
        started.add(client);
        return;
      }
      if (!readE2ESecret()) {
        console.info('[e2e-signer] no secret provided; the app stays logged out');
        return;
      }
      started.add(client);
      let attempt = 0;
      const unsubscribe = client.onAuthStateChange((state) => {
        if (state.step === 'authenticated') {
          console.info('[e2e-signer] logged in as', state.session.wallet?.address);
          unsubscribe();
        } else if (state.step === 'error') {
          // Connecting to Pollar fails intermittently (`WALLET_CONNECT_FAILED`)
          // when a run opens many sessions in a row. Retrying the connection is
          // far cheaper than letting the spec fail and having Playwright replay
          // the whole test, which would resubmit its on-chain transactions.
          // The failure line is only emitted once the retries are spent, so a
          // genuinely broken login still fails the spec.
          if (attempt < LOGIN_RETRIES && !cancelled) {
            attempt += 1;
            console.info('[e2e-signer] login attempt failed, retrying:', state.errorCode);
            setTimeout(() => {
              if (!cancelled) login({ provider: E2E_ADAPTER_ID });
            }, attempt * LOGIN_RETRY_BACKOFF_MS);
            return;
          }
          console.error('[e2e-signer] login failed:', state.errorCode, state.message);
          unsubscribe();
        }
      });
      login({ provider: E2E_ADAPTER_ID });
    });
    return () => {
      cancelled = true;
    };
  }, [getClient, login]);

  return null;
}

/**
 * One client per API key, for the lifetime of the page.
 *
 * Handing the provider a config makes it construct (and later destroy) a client
 * per mount, so React's StrictMode double mount in dev leaves two clients live
 * on the same key. They share one persisted session, and the single-use
 * refresh-token rotation then trips the server's reuse detection and logs both
 * out mid-test. Passing a prebuilt instance instead means every mount reuses
 * the same client and the provider never owns (or destroys) it.
 */
const clients = new Map<string, PollarClient>();

function sharedClient(client: ProviderProps['client']): PollarClient {
  if (client instanceof PollarClient) return client;
  const config = client as PollarClientConfig;
  const existing = clients.get(config.apiKey);
  if (existing) return existing;
  const created = new PollarClient({
    ...config,
    walletAdapters: [...(config.walletAdapters ?? []), new LocalKeyAdapter()],
  });
  clients.set(config.apiKey, created);
  return created;
}

export function PollarProvider({ client, children, ...rest }: ProviderProps) {
  // The real provider locks the client at first render; the instance is shared across mounts.
  const [wired] = useState(() => sharedClient(client));
  return (
    <real.PollarProvider client={wired} {...rest}>
      <E2EAutoLogin />
      {children}
    </real.PollarProvider>
  );
}

'use client';

import * as Ably from 'ably';
import { AblyProvider as Provider, useAbly, useConnectionStateListener } from 'ably/react';
import { ReactNode, useEffect, useState } from 'react';
import { v4 } from 'uuid';
import { clientEnv } from '../../config/clientEnv';

let client: Ably.Realtime | null = null;

/**
 * Lazily creates a single Ably Realtime client using token auth. The Ably API
 * key stays on the server — the browser only ever receives short-lived token
 * requests from `GET /api/v1/ably/token`. Created lazily so importing this
 * module never opens a realtime connection (and never runs under SSR).
 */
function getAblyClient(): Ably.Realtime {
  if (!client) {
    client = new Ably.Realtime({
      authUrl: `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/ably/token`,
      authMethod: 'GET',
    });
  }
  return client;
}

const idRef = { current: v4() };

export const AblyProvider = ({ children }: { children: ReactNode }) => {
  const [ably] = useState(getAblyClient);
  return (
    <Provider client={ably}>
      <RegisterUser />
      {children}
    </Provider>
  );
};

/**
 * Stellar public keys (G…, 56 chars) and secret seeds (S…). Console output in
 * this app routinely carries wallet addresses inside transaction XDR, error
 * strings and object dumps, and the diagnostics stream is not the place for
 * them: the Privacy Policy commits to collecting diagnostics, not to shipping
 * an identifiable transaction log off the device.
 */
const STELLAR_KEY_RE = /\b([GS])[A-Z2-7]{55}\b/g;

/** Anything that looks like a JWT — the wallet session token is one. */
const JWT_RE = /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g;

/**
 * Redacts identifiers from a serialized console argument before it leaves the
 * browser. Addresses keep their first four characters so a log line is still
 * correlatable with what the user saw on screen, without being an identifier.
 */
const redact = (text: string): string =>
  text
    .replace(JWT_RE, '[redacted-token]')
    .replace(STELLAR_KEY_RE, (match, prefix: string) =>
      prefix === 'S' ? '[redacted-secret]' : `${match.slice(0, 4)}…[redacted]`,
    );

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendLogToAbly(level: 'log' | 'info' | 'error' | 'warn', args: any[]) {
  try {
    const logChannel = getAblyClient().channels.get('logs');
    const message = {
      sessionId: idRef.current,
      level,
      args: args.map((arg) => {
        try {
          return redact(JSON.stringify(arg, null, 2));
        } catch (e) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return redact(String((e as any)?.message || arg));
        }
      }),
      timestamp: new Date().toISOString(),
    };
    await logChannel.publish(level, message);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e) {}
}

/**
 * Publishes one session-registration event so the admin dashboard can see live
 * sessions. It publishes only — it deliberately does NOT use `useChannel`,
 * which would attach a subscriber and let any client read every other client's
 * registration events (user agent, platform, language). The public Ably token
 * no longer grants `subscribe` on this channel either; the two changes go
 * together.
 */
export const RegisterUser = () => {
  const ably = useAbly();
  const [connected, setConnected] = useState(false);
  useConnectionStateListener('connected', () => {
    setConnected(true);
  });
  const sessionId = idRef.current;

  useEffect(() => {
    if (!connected) return;
    void ably.channels.get('register-customer').publish('start', {
      sessionId,
      origin: window.location.origin,
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      timestamp: new Date().toISOString(),
    });
  }, [ably, connected, sessionId]);

  return null;
};

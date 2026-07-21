'use client';

import * as Ably from 'ably';
import { AblyProvider as Provider, ChannelProvider, useChannel, useConnectionStateListener } from 'ably/react';
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
      <ChannelProvider channelName="register-customer">
        <RegisterUser />
      </ChannelProvider>
      {children}
    </Provider>
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendLogToAbly(level: 'log' | 'info' | 'error' | 'warn', args: any[]) {
  try {
    const logChannel = getAblyClient().channels.get('logs');
    const message = {
      sessionId: idRef.current,
      level,
      args: args.map((arg) => {
        try {
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (e as any)?.message || arg;
        }
      }),
      timestamp: new Date().toISOString(),
    };
    await logChannel.publish(level, message);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e) {}
}

export const RegisterUser = () => {
  const [connected, setConnected] = useState(false);
  useConnectionStateListener('connected', () => {
    setConnected(true);
  });
  const sessionId = idRef.current;
  const { channel } = useChannel('register-customer', 'start');

  useEffect(() => {
    if (connected) {
      void channel.publish('start', {
        sessionId,
        origin: window.location.origin,
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,
        timestamp: new Date().toISOString(),
      });
    }
  }, [channel, connected, sessionId]);

  return null;
};

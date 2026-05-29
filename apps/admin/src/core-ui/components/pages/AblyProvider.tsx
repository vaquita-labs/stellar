'use client';

import * as Ably from 'ably';
import {
  AblyProvider as Provider,
  ChannelProvider,
  useChannel,
  useConnectionStateListener,
} from 'ably/react';
import { ReactNode, useEffect, useState } from 'react';
import { v4 } from 'uuid';
import { clientEnv } from '../../config/clientEnv';

const realtimeClient = new Ably.Realtime({
  key: clientEnv.NEXT_PUBLIC_ABLY_KEY,
});

const idRef = { current: v4() };

export const AblyProvider = ({ children }: { children: ReactNode }) => {
  return (
    <Provider client={realtimeClient}>
      <ChannelProvider channelName="register-customer">
        <RegisterUser />
      </ChannelProvider>
      {children}
    </Provider>
  );
};

const logChannel = realtimeClient.channels.get('logs');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendLogToAbly(level: 'log' | 'info' | 'error' | 'warn', args: any[]) {
  if (!logChannel) return;
  try {
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

import { Realtime } from 'ably';

export const ably = new Realtime({
  key: process.env.ABLY_KEY!,
});

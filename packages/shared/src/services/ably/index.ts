import { Realtime } from 'ably';
import { env } from '../../config/env';

export const ably = new Realtime({
  key: env.ABLY_KEY,
});

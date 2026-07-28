import { Realtime } from 'ably';
import { apiServicesEnv } from '../../config/apiServicesEnv';

export const ably = new Realtime({
  key: apiServicesEnv.ABLY_KEY,
});

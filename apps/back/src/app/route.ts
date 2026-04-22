import type { API } from 'types';
import { routerGetEnvs, routerGetNodeEnv, routerGetPing, routerGetStatus, routerGetVersion } from './controller';

export default (api: API) => {
  
  api.get('/ping', routerGetPing);
  api.get('/version', routerGetVersion);
  api.get('/node-env', routerGetNodeEnv);
  api.get('/status', routerGetStatus);
  api.get('/envs', routerGetEnvs);
  
}

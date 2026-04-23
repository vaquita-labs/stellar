require('dotenv').config();
import { LogLevel } from '@juki-team/commons';
import { dbClientConnect } from 'services/database';
import { log } from 'services/log';

(async () => {
  await dbClientConnect();
  log(LogLevel.INFO)(`mongo client connected`);
})();

import apiV1GroupRouter from 'app/group/route';
import apiV1PoolRouter from 'app/pool/route';
import apiV1Router from 'app/route';
import type { APIGatewayEvent, Context } from 'aws-lambda';
import { NODE_ENV, ORIGINS, VERSION } from 'config/settings';
import { logApiLambdaHandler, shouldDisplayLog } from 'helpers';
import createAPI from 'lambda-api';
import {
  errorLoggerHandler,
  failSafeHandler,
  loggerAllRequestHandler,
  loggerRequestTimeHandler,
  notFoundResponse,
  responsesMiddleware,
  setCompany,
} from 'middlewares';
import { dbClientConnect } from 'services/database';
import { log, logService } from 'services/log';
import { LogLevel } from 'types';

const runtimeId = process.env.AWS_LAMBDA_LOG_STREAM_NAME?.split(']').pop() || '-';
logService.setHeader(`API express lambda Vaquita 0.3 (${runtimeId})`);
const upDate = new Date();
log(LogLevel.INFO)(`API express lambda Vaquita starting at: ${upDate.toLocaleDateString()} ${upDate.toLocaleTimeString()}`);

const api = createAPI({ version: 'v2.0', base: 'v2/vaquita' });

log(LogLevel.INFO)('starting initial express set up', { NODE_ENV, VERSION, ORIGINS });
if (shouldDisplayLog(LogLevel.DEBUG)) {
  api.use(loggerAllRequestHandler);
} else if (shouldDisplayLog(LogLevel.INFO)) {
  api.use(loggerRequestTimeHandler);
}

api.use(responsesMiddleware);
log(LogLevel.INFO)('completed express set up');
log(LogLevel.INFO)('starting finish express set up');
api.use(errorLoggerHandler);
api.use(failSafeHandler);
log(LogLevel.INFO)('completed finish express set up');

const routes = [
  '/group', '/group/*',
  '/pool', '/pool/*',
];
api.use(routes, setCompany());

api.register(apiV1Router, { prefix: '/' });
api.register(apiV1GroupRouter, { prefix: '/group' });
api.register(apiV1PoolRouter, { prefix: '/pool' });

api.use(notFoundResponse);

if (shouldDisplayLog(LogLevel.DEBUG)) {
  api.routes(true);
}

log(LogLevel.INFO)('completed finish express set up');

void dbClientConnect();

export const handler = async (event: APIGatewayEvent, context: Context) => {
  return await logApiLambdaHandler(event, context, 'api express lambda vaquita', upDate, async () => {
    return await api.run(event, context);
  });
};

exports.handler = handler;

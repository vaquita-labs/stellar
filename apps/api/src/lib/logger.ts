import { pino, type LoggerOptions } from 'pino';

const isProd = process.env.NODE_ENV === 'production';

// Field names that must never reach a log sink in cleartext. Each is redacted
// both at the top level and one level deep (the shapes we actually log), so
// `{ apiKey }` and `{ config: { apiKey } }` are both censored.
const SENSITIVE_KEYS = [
  // auth / sessions
  'authorization',
  'cookie',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'sessionToken',
  'jwt',
  // API keys
  'apiKey',
  'api_key',
  'apikey',
  // signing / secrets
  'secret',
  'sessionSecret',
  'authSessionSecret',
  'signingSeed',
  'signingKey',
  'privateKey',
  'private_key',
  'serverPrivateKey',
  // seed phrases
  'seed',
  'seedPhrase',
  'mnemonic',
  // DB / connection strings
  'databaseUrl',
  'database_url',
  'connectionString',
  // webhooks
  'webhookToken',
  'webhook_token',
  // raw on-chain transaction envelopes — never log
  'transactionRaw',
  'transactionEventRaw',
  'transaction_event_raw',
];

export const REDACT_PATHS = [
  ...SENSITIVE_KEYS.flatMap((key) => [key, `*.${key}`]),
  // explicit header paths (defense-in-depth; the req serializer omits headers)
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-webhook-token"]',
  'req.headers["x-api-key"]',
];

export interface ReqLogShape {
  id?: unknown;
  method?: string;
  url?: string;
  params?: unknown;
  query?: unknown;
}

// Request serializer for pino-http. Logs the route path only — the query string
// is stripped and the raw `query` object is dropped so tokens/secrets passed as
// query params never reach the logs. Route params (e.g. :wallet) may stay in
// the log body; they must never become Loki labels (that is enforced in Alloy).
export const serializeReq = (req: ReqLogShape) => ({
  id: req.id,
  method: req.method,
  url: typeof req.url === 'string' ? req.url.split('?')[0] : req.url,
  params: req.params,
});

const options: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
  base: { service: '@vaquita/api' },
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  },
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname,service',
            singleLine: false,
          },
        },
      }),
};

export const logger = pino(options);
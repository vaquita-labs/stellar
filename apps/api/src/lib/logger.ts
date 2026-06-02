import { pino, type LoggerOptions } from 'pino';

const isProd = process.env.NODE_ENV === 'production';

const options: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
  base: { service: '@vaquita/api' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-webhook-token"]',
      '*.password',
      '*.token',
      '*.privateKey',
      '*.private_key',
      '*.serverPrivateKey',
    ],
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
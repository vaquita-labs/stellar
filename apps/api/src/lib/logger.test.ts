import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { REDACT_PATHS, serializeReq } from './logger';

// Build a logger with the production redaction config writing to an in-memory
// buffer, so we can assert what actually reaches the log sink.
const captureLogger = () => {
  const lines: string[] = [];
  const stream = {
    write: (chunk: string) => {
      lines.push(chunk);
    },
  };
  const log = pino({ redact: { paths: REDACT_PATHS, censor: '[REDACTED]' } }, stream as never);
  return { log, output: () => lines.join('') };
};

describe('logger redaction — secrets in log bodies', () => {
  it('redacts auth material, API keys, JWTs, DB URLs, seeds and signing material', () => {
    const { log, output } = captureLogger();

    log.info({
      apiKey: 'ak_live_SECRET',
      user: { sessionToken: 'jwt.SECRET.value', jwt: 'ey.SECRET' },
      databaseUrl: 'postgres://user:SECRET@host:5432/db',
      seed: 'seed-SECRET',
      mnemonic: 'twelve words SECRET here',
      signingSeed: 'sign-SECRET',
      config: { apiKey: 'nested_SECRET' },
    });

    const out = output();
    expect(out).not.toContain('SECRET');
    expect(out).toContain('[REDACTED]');
  });

  it('never logs transactionRaw or transactionEventRaw in cleartext', () => {
    const { log, output } = captureLogger();

    log.info({
      transactionRaw: 'AAAA_SECRET_XDR',
      deposit: { transactionEventRaw: 'EVENT_SECRET' },
    });

    const out = output();
    expect(out).not.toContain('SECRET');
    expect(out).toContain('[REDACTED]');
  });
});

describe('serializeReq', () => {
  it('logs the path without the query string or raw query object, keeping bounded fields', () => {
    const out = serializeReq({
      id: 'req-1',
      method: 'GET',
      url: '/api/v1/wallets/GABC/badges?token=SECRET&debug=1',
      params: { wallet: 'GABC' },
      query: { token: 'SECRET', debug: '1' },
    });

    expect(out).toEqual({
      id: 'req-1',
      method: 'GET',
      url: '/api/v1/wallets/GABC/badges',
      params: { wallet: 'GABC' },
    });
    expect(JSON.stringify(out)).not.toContain('SECRET');
  });
});

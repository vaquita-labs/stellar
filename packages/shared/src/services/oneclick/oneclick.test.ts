import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BASE_USDC,
  STELLAR_USDC,
  assetsForDirection,
  getStatus,
  humanToBaseUnits,
  isTerminalStatus,
  requestQuote,
  submitDepositTx,
  type OneClickConfig,
} from './index';

const config: OneClickConfig = { baseUrl: 'https://1click.example', timeoutMs: 50 };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Captures the single request the client makes, so the body can be asserted. */
const captureFetch = (response: Response) => {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(response);
  });
  return calls;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('humanToBaseUnits', () => {
  it('scales by the asset decimals', () => {
    expect(humanToBaseUnits('10', 6)).toBe('10000000');
    expect(humanToBaseUnits('10', 7)).toBe('100000000');
    expect(humanToBaseUnits('0.5', 6)).toBe('500000');
  });

  // Rounding UP would quote more than the user typed, and the deposit would
  // then fall short of the quote.
  it('truncates extra fractional digits rather than rounding', () => {
    expect(humanToBaseUnits('1.9999999', 6)).toBe('1999999');
  });

  it('rejects anything that is not a plain decimal', () => {
    expect(humanToBaseUnits('1e6', 6)).toBeNull();
    expect(humanToBaseUnits('-1', 6)).toBeNull();
    expect(humanToBaseUnits('', 6)).toBeNull();
  });
});

describe('assetsForDirection', () => {
  it('maps each direction to its origin and destination', () => {
    expect(assetsForDirection('evm_to_stellar')).toEqual({ origin: BASE_USDC, destination: STELLAR_USDC });
    expect(assetsForDirection('stellar_to_evm')).toEqual({ origin: STELLAR_USDC, destination: BASE_USDC });
  });
});

describe('isTerminalStatus', () => {
  it('is true only for statuses that will not change again', () => {
    expect(isTerminalStatus('SUCCESS')).toBe(true);
    expect(isTerminalStatus('REFUNDED')).toBe(true);
    expect(isTerminalStatus('FAILED')).toBe(true);
    expect(isTerminalStatus('PENDING_DEPOSIT')).toBe(false);
    expect(isTerminalStatus('PROCESSING')).toBe(false);
  });
});

describe('requestQuote', () => {
  it('returns the quote and sends the fields 1Click requires', async () => {
    const calls = captureFetch(
      json({ correlationId: 'c1', signature: 'sig', quote: { depositAddress: '0xabc', amountOut: '9969800' } }),
    );

    const result = await requestQuote(config, {
      direction: 'evm_to_stellar',
      amountRaw: '10000000',
      recipient: 'GDESTINATION',
      refundTo: '0xrefund',
      dry: false,
    });

    expect(result).toEqual({
      ok: true,
      data: { correlationId: 'c1', signature: 'sig', quote: { depositAddress: '0xabc', amountOut: '9969800' } },
    });

    const body = JSON.parse(String(calls[0]?.init.body));
    // We charge nothing. (1Click still injects its own 10 bps referral fee for
    // unauthenticated callers — see the note in requestQuote.)
    expect(body.appFees).toEqual([]);
    // Required, and 1Click 400s without it even though its SDK types say otherwise.
    expect(Date.parse(body.deadline)).not.toBeNaN();
    expect(body.originAsset).toBe(BASE_USDC.assetId);
    expect(body.destinationAsset).toBe(STELLAR_USDC.assetId);
    expect(body.dry).toBe(false);
  });

  it('asks for a memo deposit when the origin is Stellar, and a plain one otherwise', async () => {
    const outbound = captureFetch(json({ quote: {} }));
    await requestQuote(config, {
      direction: 'stellar_to_evm',
      amountRaw: '100000000',
      recipient: '0xdest',
      refundTo: 'GREFUND',
      dry: true,
    });
    expect(JSON.parse(String(outbound[0]?.init.body)).depositMode).toBe('MEMO');

    vi.unstubAllGlobals();
    const inbound = captureFetch(json({ quote: {} }));
    await requestQuote(config, {
      direction: 'evm_to_stellar',
      amountRaw: '10000000',
      recipient: 'GDEST',
      refundTo: '0xrefund',
      dry: true,
    });
    expect(JSON.parse(String(inbound[0]?.init.body)).depositMode).toBe('SIMPLE');
  });

  it('surfaces the 4xx message instead of swallowing it', async () => {
    // What a Stellar recipient without a USDC trustline actually gets back.
    captureFetch(json({ message: 'Recipient does not have a trustline for the destination asset' }, 400));

    const result = await requestQuote(config, {
      direction: 'evm_to_stellar',
      amountRaw: '10000000',
      recipient: 'GNOTRUST',
      refundTo: '0xrefund',
      dry: true,
    });

    expect(result).toEqual({ ok: false, reason: 'Recipient does not have a trustline for the destination asset' });
  });

  it('reports a timeout rather than throwing', async () => {
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }),
    );

    const result = await requestQuote(config, {
      direction: 'evm_to_stellar',
      amountRaw: '10000000',
      recipient: 'GDEST',
      refundTo: '0xrefund',
      dry: true,
    });

    expect(result).toEqual({ ok: false, reason: '1Click request timed out' });
  });

  it('reports a malformed body rather than throwing', async () => {
    captureFetch(new Response('<html>gateway</html>', { status: 200 }));

    const result = await requestQuote(config, {
      direction: 'evm_to_stellar',
      amountRaw: '10000000',
      recipient: 'GDEST',
      refundTo: '0xrefund',
      dry: true,
    });

    expect(result).toEqual({ ok: false, reason: 'malformed response from 1Click' });
  });

  it('sends no Authorization header when no JWT is configured', async () => {
    const calls = captureFetch(json({ quote: {} }));
    await requestQuote(config, {
      direction: 'evm_to_stellar',
      amountRaw: '10000000',
      recipient: 'GDEST',
      refundTo: '0xrefund',
      dry: true,
    });
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

describe('getStatus', () => {
  it('includes the memo in the query when there is one', async () => {
    const calls = captureFetch(json({ status: 'PENDING_DEPOSIT' }));
    await getStatus(config, 'GDEPOSIT', '171511223');
    expect(calls[0]?.url).toContain('depositAddress=GDEPOSIT');
    expect(calls[0]?.url).toContain('depositMemo=171511223');
  });

  it('omits the memo when there is none', async () => {
    const calls = captureFetch(json({ status: 'PROCESSING' }));
    await getStatus(config, '0xdeposit');
    expect(calls[0]?.url).not.toContain('depositMemo');
  });
});

describe('submitDepositTx', () => {
  it('posts the hash and the address', async () => {
    const calls = captureFetch(json({ status: 'KNOWN_DEPOSIT_TX' }));
    await submitDepositTx(config, { txHash: 'abc', depositAddress: 'GDEPOSIT', memo: '171511223' });

    const body = JSON.parse(String(calls[0]?.init.body));
    expect(body).toEqual({ txHash: 'abc', depositAddress: 'GDEPOSIT', memo: '171511223' });
  });
});

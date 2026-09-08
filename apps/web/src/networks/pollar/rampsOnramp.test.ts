import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/networks/stellar/kit', () => ({ getHorizonUrl: () => 'https://horizon.test' }));

import { creditedUsdcFor } from './rampsOnramp';

const ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const ACCOUNT = 'GBISWVQ6IY5MJIUTS256LZBYMBUB7J5B2H7K5ZSLAGYA424IJFS26IZK';
const HASH = 'ab12';

const payment = (over: Record<string, unknown> = {}) => ({
  to: ACCOUNT,
  asset_code: 'USDC',
  asset_issuer: ISSUER,
  amount: '10.0000000',
  ...over,
});

const found = (records: unknown[]) => ({ ok: true, json: async () => ({ _embedded: { records } }) });
/** Horizon's answer for a transaction it has not ingested yet. */
const notYet = { ok: false, status: 404, json: async () => ({}) };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('creditedUsdcFor', () => {
  it('suma todos los pagos de USDC a la cuenta, no sólo el primero', async () => {
    fetchMock.mockResolvedValue(found([payment({ amount: '10.0000000' }), payment({ amount: '4.3100000' })]));

    await expect(creditedUsdcFor(HASH, ACCOUNT, ISSUER)).resolves.toBeCloseTo(14.31, 7);
  });

  it('ignora los pagos de otro asset, de otro emisor o hacia otra cuenta', async () => {
    fetchMock.mockResolvedValue(
      found([
        payment({ asset_code: 'XLM' }),
        payment({ asset_issuer: 'GOTHERISSUER' }),
        payment({ to: 'GSOMEONEELSE' }),
        payment({ amount: '7.5000000' }),
      ]),
    );

    await expect(creditedUsdcFor(HASH, ACCOUNT, ISSUER)).resolves.toBeCloseTo(7.5, 7);
  });

  it('espera a que Horizon indexe la transacción en vez de rendirse en el 404', async () => {
    vi.useFakeTimers();
    // El proveedor publica el hash apenas firma, así que el primer intento suele
    // caer antes de que el ledger esté indexado.
    fetchMock
      .mockResolvedValueOnce(notYet)
      .mockResolvedValueOnce(notYet)
      .mockResolvedValue(found([payment()]));

    const read = creditedUsdcFor(HASH, ACCOUNT, ISSUER);
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(read).resolves.toBeCloseTo(10, 7);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('devuelve null cuando se agota la ventana sin ver la transacción', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(notYet);

    const read = creditedUsdcFor(HASH, ACCOUNT, ISSUER, { timeoutMs: 20_000 });
    await vi.advanceTimersByTimeAsync(60_000);

    await expect(read).resolves.toBeNull();
  });

  it('para de preguntar en cuanto quien llama se va', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(notYet);
    let gone = false;

    const read = creditedUsdcFor(HASH, ACCOUNT, ISSUER, { shouldStop: () => gone });
    await vi.advanceTimersByTimeAsync(6_000);
    gone = true;
    await vi.advanceTimersByTimeAsync(30_000);

    await expect(read).resolves.toBeNull();
    // Se cortó dentro de la ventana, no al agotarla.
    expect(fetchMock.mock.calls.length).toBeLessThan(4);
  });

  it('una transacción sin pagos de USDC a la cuenta se responde de una vez', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(found([payment({ to: 'GSOMEONEELSE' })]));

    const read = creditedUsdcFor(HASH, ACCOUNT, ISSUER);
    await vi.advanceTimersByTimeAsync(60_000);

    // Los pagos de una transacción ya incluida no cambian: insistir no la haría
    // aparecer, así que el 200 es la respuesta completa.
    await expect(read).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

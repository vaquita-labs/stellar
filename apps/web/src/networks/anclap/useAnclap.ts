'use client';

import { getHorizonUrl } from '@/networks/stellar/kit';
import { usePollar } from '@pollar/react';
import { useCallback } from 'react';

// El proxy responde siempre { url, method, status, ok, body } (UpstreamResult).
export interface Upstream {
  url: string;
  method: string;
  status: number;
  ok: boolean;
  body: unknown;
}

export class AnclapError extends Error {}

// Forma de la transacción SEP-24 que nos interesa para el seguimiento.
export interface SepTransaction {
  id: string;
  kind?: string;
  status?: string;
  amount_in?: string;
  amount_out?: string;
  amount_fee?: string;
  message?: string;
  more_info_url?: string;
  [k: string]: unknown;
}

// Estados terminales "buenos" / "malos" del flujo SEP-24.
const COMPLETED = 'completed';
const FAILED_STATES = new Set(['error', 'refunded', 'expired', 'no_market', 'too_small', 'too_large']);

// Representación de asset que espera Pollar (buildTx) y Horizon (paths).
export type StellarAsset =
  | { type: 'native' }
  | { type: 'credit_alphanum4' | 'credit_alphanum12'; code: string; issuer: string };

export function assetParam(code: string, issuer?: string): StellarAsset {
  if (!issuer || code.toUpperCase() === 'XLM' || code.toLowerCase() === 'native') return { type: 'native' };
  return { type: code.length <= 4 ? 'credit_alphanum4' : 'credit_alphanum12', code, issuer };
}

function recordToAsset(r: { asset_type: string; asset_code?: string; asset_issuer?: string }): StellarAsset {
  if (r.asset_type === 'native') return { type: 'native' };
  return {
    type: r.asset_type === 'credit_alphanum12' ? 'credit_alphanum12' : 'credit_alphanum4',
    code: r.asset_code ?? '',
    issuer: r.asset_issuer ?? '',
  };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Primitivas del flujo Anclap (off/on-ramp) sobre los Route Handlers de
 * `/api/anclap/*`. La firma del challenge SEP-10 se hace con la wallet del
 * usuario vía Pollar (`signTx`), igual que el resto de la app. Pensado para que
 * tanto el off-ramp (withdraw) como el on-ramp (deposit) lo reutilicen.
 */
export function useAnclap() {
  const { signTx, setTrustline, buildAndSignAndSubmitTx } = usePollar();

  // Llama a un Route Handler propio y devuelve el sobre Upstream; tira
  // AnclapError con el detalle si el proxy o Anclap responden mal.
  const callProxy = useCallback(
    async (
      method: 'GET' | 'POST',
      path: string,
      opts: { body?: unknown; jwt?: string | null } = {},
    ): Promise<Upstream> => {
      const headers: Record<string, string> = {};
      if (opts.body) headers['Content-Type'] = 'application/json';
      if (opts.jwt) headers['Authorization'] = `Bearer ${opts.jwt}`;

      const res = await fetch(path, {
        method,
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      const data = (await res.json().catch(() => ({}))) as Upstream | { error?: string };
      if (!res.ok || 'error' in data) {
        const detail = 'error' in data && data.error ? data.error : `HTTP ${res.status}`;
        throw new AnclapError(detail);
      }
      return data as Upstream;
    },
    [],
  );

  // ----- SEP-10 -----
  const requestChallenge = useCallback(
    async (account: string): Promise<string> => {
      const data = await callProxy('GET', `/api/anclap/sep10/challenge?account=${encodeURIComponent(account)}`);
      const xdr = (data.body as { transaction?: string } | undefined)?.transaction;
      if (!xdr) throw new AnclapError('Anclap no devolvió el challenge (transaction).');
      return xdr;
    },
    [callProxy],
  );

  const signChallenge = useCallback(
    async (challengeXdr: string): Promise<string> => {
      const outcome = await signTx(challengeXdr);
      if (outcome.status !== 'signed') {
        throw new AnclapError(outcome.details ?? 'No se pudo firmar el challenge.');
      }
      return outcome.signedXdr;
    },
    [signTx],
  );

  const fetchJwt = useCallback(
    async (signedChallengeXdr: string): Promise<string> => {
      const data = await callProxy('POST', '/api/anclap/sep10/token', { body: { transaction: signedChallengeXdr } });
      const token = (data.body as { token?: string } | undefined)?.token;
      if (!token) throw new AnclapError('Anclap no devolvió el JWT (token).');
      return token;
    },
    [callProxy],
  );

  /** Atajo: challenge -> firmar (wallet) -> JWT. `onStep` reporta cada subpaso. */
  const authenticate = useCallback(
    async (account: string, onStep?: (step: 'challenge' | 'sign' | 'token') => void): Promise<string> => {
      onStep?.('challenge');
      const challengeXdr = await requestChallenge(account);
      onStep?.('sign');
      const signed = await signChallenge(challengeXdr);
      onStep?.('token');
      return fetchJwt(signed);
    },
    [requestChallenge, signChallenge, fetchJwt],
  );

  // ----- SEP-24 (off/on-ramp interactivo) -----
  const startInteractive = useCallback(
    async (
      kind: 'deposit' | 'withdraw',
      jwt: string,
      payload: { asset_code: string; account: string; amount?: string },
    ): Promise<{ id: string; url: string }> => {
      const data = await callProxy('POST', `/api/anclap/sep24/${kind}`, { body: payload, jwt });
      const body = data.body as { id?: string; url?: string } | undefined;
      if (!body?.url) throw new AnclapError('Anclap no devolvió la URL interactiva.');
      return { id: body.id ?? '', url: body.url };
    },
    [callProxy],
  );

  // ----- Trustlines -----
  // Se consulta Horizon directamente (no el `walletBalance` de Pollar) porque
  // ese estado queda viejo dentro del mismo handler async y haría que la
  // trustline existente no se detecte y se vuelva a pedir activación cada vez.
  const accountHasTrustline = useCallback(async (account: string, code: string, issuer: string): Promise<boolean> => {
    const res = await fetch(`${getHorizonUrl()}/accounts/${encodeURIComponent(account)}`, { cache: 'no-store' });
    if (res.status === 404) return false; // cuenta sin fondear: no tiene trustlines
    if (!res.ok) throw new AnclapError(`No se pudo leer la cuenta en Horizon (HTTP ${res.status}).`);
    const data = (await res.json()) as { balances?: Array<{ asset_code?: string; asset_issuer?: string }> };
    return (data.balances ?? []).some(
      (b) => b.asset_code?.toUpperCase() === code.toUpperCase() && b.asset_issuer === issuer,
    );
  }, []);

  /** Crea la trustline del asset si falta. Tira AnclapError si Pollar falla. */
  const ensureTrustline = useCallback(
    async (account: string, code: string, issuer: string): Promise<void> => {
      if (await accountHasTrustline(account, code, issuer)) return;
      const outcome = await setTrustline({ code, issuer });
      if (outcome.status === 'error') {
        throw new AnclapError(outcome.details ?? `No se pudo activar la trustline de ${code}.`);
      }
    },
    [accountHasTrustline, setTrustline],
  );

  // ----- Seguimiento de la transacción SEP-24 -----
  const getTransaction = useCallback(
    async (id: string, jwt: string): Promise<SepTransaction | undefined> => {
      const data = await callProxy('GET', `/api/anclap/sep24/transaction/${encodeURIComponent(id)}`, { jwt });
      return (data.body as { transaction?: SepTransaction } | undefined)?.transaction;
    },
    [callProxy],
  );

  /**
   * Hace polling de la transacción hasta que Anclap la marca `completed`
   * (los ARS ya están on-chain) o cae en un estado terminal de error.
   * `shouldStop` permite abortar (ej. el modal se cerró). `onStatus` reporta
   * cada lectura para refrescar la UI.
   */
  const waitForCompletion = useCallback(
    async (
      id: string,
      jwt: string,
      opts: {
        onStatus?: (status: string | undefined, tx: SepTransaction | undefined) => void;
        shouldStop?: () => boolean;
        intervalMs?: number;
        timeoutMs?: number;
      } = {},
    ): Promise<SepTransaction> => {
      const { onStatus, shouldStop, intervalMs = 6000, timeoutMs = 15 * 60 * 1000 } = opts;
      const start = Date.now();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (shouldStop?.()) throw new AnclapError('Seguimiento cancelado.');
        const tx = await getTransaction(id, jwt);
        onStatus?.(tx?.status, tx);
        if (tx?.status === COMPLETED) return tx;
        if (tx?.status && FAILED_STATES.has(tx.status)) {
          throw new AnclapError(tx.message ?? `La transacción terminó en estado "${tx.status}".`);
        }
        if (Date.now() - start > timeoutMs) {
          throw new AnclapError('Se agotó el tiempo esperando la acreditación. Volvé a intentar más tarde.');
        }
        await sleep(intervalMs);
      }
    },
    [getTransaction],
  );

  // ----- Swap on-chain (path payment strict send) vía Pollar -----
  /** Cotiza cuánto `dest` se recibe enviando `sendAmount` de `send` (Horizon). */
  const quoteStrictSend = useCallback(
    async (args: { send: StellarAsset; sendAmount: string; dest: StellarAsset }): Promise<{ destAmount: string; path: StellarAsset[] }> => {
      const { send, sendAmount, dest } = args;
      const p = new URLSearchParams();
      p.set('source_asset_type', send.type);
      if (send.type !== 'native') {
        p.set('source_asset_code', send.code);
        p.set('source_asset_issuer', send.issuer);
      }
      p.set('source_amount', sendAmount);
      p.set('destination_assets', dest.type === 'native' ? 'native' : `${dest.code}:${dest.issuer}`);

      const res = await fetch(`${getHorizonUrl()}/paths/strict-send?${p.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new AnclapError(`No se pudo cotizar el swap (HTTP ${res.status}).`);
      const data = (await res.json()) as {
        _embedded?: { records?: Array<{ destination_amount: string; path?: Array<{ asset_type: string; asset_code?: string; asset_issuer?: string }> }> };
      };
      const records = data._embedded?.records ?? [];
      if (!records.length) throw new AnclapError('No hay ruta de swap disponible (sin liquidez).');
      const best = records.reduce((a, b) => (Number(b.destination_amount) > Number(a.destination_amount) ? b : a));
      return { destAmount: best.destination_amount, path: (best.path ?? []).map(recordToAsset) };
    },
    [],
  );

  /**
   * Swap `send` -> `dest` mandándolo a la propia cuenta. Cotiza, aplica
   * slippage para el `destMin`, y construye/firma/envía con Pollar.
   */
  const swap = useCallback(
    async (args: {
      account: string;
      send: StellarAsset;
      sendAmount: string;
      dest: StellarAsset;
      slippagePct?: number;
    }): Promise<{ hash?: string; quotedOut: string; destMin: string }> => {
      const { account, send, sendAmount, dest, slippagePct = 1 } = args;
      const quote = await quoteStrictSend({ send, sendAmount, dest });
      const destMin = (Number(quote.destAmount) * (1 - slippagePct / 100)).toFixed(7);

      const outcome = await buildAndSignAndSubmitTx('path_payment_strict_send', {
        destination: account,
        sendAsset: send,
        sendAmount,
        destAsset: dest,
        destMin,
        path: quote.path,
      });
      if (outcome.status === 'error') {
        throw new AnclapError(outcome.details ?? outcome.resultCode ?? 'El swap falló.');
      }
      return { hash: outcome.hash, quotedOut: quote.destAmount, destMin };
    },
    [quoteStrictSend, buildAndSignAndSubmitTx],
  );

  return {
    callProxy,
    requestChallenge,
    signChallenge,
    fetchJwt,
    authenticate,
    startInteractive,
    accountHasTrustline,
    ensureTrustline,
    getTransaction,
    waitForCompletion,
    quoteStrictSend,
    swap,
  };
}

/** Query param for DeFindex HTTP API (`GET /vault/:address/apy?network=...`). */
export type DefindexHttpNetwork = 'testnet' | 'mainnet';

export function stellarNetworkNameToDefindexHttpNetwork(networkName: string): DefindexHttpNetwork | null {
  if (networkName === 'Stellar Testnet') return 'testnet';
  if (networkName === 'Stellar') return 'mainnet';
  return null;
}

type FetchDefindexVaultApyParams = {
  host: string;
  apiKey: string;
  vaultAddress: string;
  network: DefindexHttpNetwork;
  /** ms */
  timeoutMs?: number;
};

/**
 * DeFindex UX API: 7-day annualized vault APY.
 * GET `{host}/vault/{vaultAddress}/apy?network=testnet|mainnet` with Bearer token.
 */
export async function fetchDefindexVaultApy(params: FetchDefindexVaultApyParams): Promise<number | null> {
  const base = params.host.replace(/\/+$/, '');
  const url = `${base}/vault/${encodeURIComponent(params.vaultAddress)}/apy?network=${params.network}`;
  const timeoutMs = params.timeoutMs ?? 15_000;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[defindexApy] request failed', res.status, text.slice(0, 200));
      return null;
    }
    const body = (await res.json()) as { apy?: number };
    if (typeof body.apy !== 'number' || Number.isNaN(body.apy)) {
      console.warn('[defindexApy] invalid apy in body', body);
      return null;
    }
    return body.apy;
  } catch (e) {
    console.warn('[defindexApy] fetch error', e);
    return null;
  } finally {
    clearTimeout(t);
  }
}

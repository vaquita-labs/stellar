// ============================================================================
// Capa API: cliente puro de los endpoints de Anclap / SEP (MAINNET).
// Sin UI, sin React. Lo consumen exclusivamente los Route Handlers (server-side)
// para resolver CORS hacia Anclap. No guarda secretos: el JWT viaja en cada
// request desde el cliente (header Authorization: Bearer ...).
// Portado del POC tmp/poc-anclap/lib/anclap.ts.
// ============================================================================

export const ANCLAP_HOME = 'https://api.anclap.com';
export const TOML_URL = `${ANCLAP_HOME}/.well-known/stellar.toml`;

// MAINNET. La cuenta conectada debe existir en la red real.
export const NETWORK_PASSPHRASE = 'Public Global Stellar Network ; September 2015';
export const HORIZON_URL = 'https://horizon.stellar.org';

// Endpoints SEP del stellar.toml de Anclap (confirmados via SEP-1).
export const WEB_AUTH_ENDPOINT = `${ANCLAP_HOME}/auth`; // SEP-10
export const TRANSFER24 = `${ANCLAP_HOME}/transfer24`; // SEP-24
export const KYC_SERVER = `${ANCLAP_HOME}/kycserver12`; // SEP-12

// Assets habilitados (live) en Anclap mainnet — destino del off-ramp / fuente
// del on-ramp. USDC (Circle) es el asset que el usuario tiene en la app y que
// se swapea hacia/desde ARS antes/después del flujo Anclap.
export const ASSETS: Record<string, { issuer: string; name: string }> = {
  ARS: {
    issuer: 'GCYE7C77EB5AWAA25R5XMWNI2EDOKTTFTTPZKM2SR5DI4B4WFD52DARS',
    name: 'Peso Digital',
  },
  PEN: {
    issuer: 'GA4TDPNUCZPTOHB3TKUYMDCRVATXKEADH7ZEYEBWJKQKE2UBFCYNBPEN',
    name: 'Sol Digital',
  },
  USDC: {
    issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    name: 'USD Coin',
  },
};

// ----------------------------------------------------------------------------
// Resultado uniforme de cada llamada upstream. Los Route Handlers lo reenvían
// al cliente para que la UI muestre status + body + URL real de Anclap.
// ----------------------------------------------------------------------------
export interface UpstreamResult {
  url: string;
  method: string;
  status: number;
  ok: boolean;
  /** JSON parseado si la respuesta era JSON; si no, el texto crudo. */
  body: unknown;
}

async function call(url: string, init: RequestInit & { method?: string } = {}): Promise<UpstreamResult> {
  const method = init.method ?? 'GET';
  const res = await fetch(url, { ...init, cache: 'no-store' });
  const text = await res.text();
  let body: unknown = text;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { url, method, status: res.status, ok: res.ok, body };
}

function bearer(jwt?: string | null): Record<string, string> {
  return jwt ? { Authorization: `Bearer ${jwt}` } : {};
}

// ----------------------------------------------------------------------------
// SEP-1 — stellar.toml
// ----------------------------------------------------------------------------
export async function getToml(): Promise<UpstreamResult> {
  const res = await fetch(TOML_URL, { cache: 'no-store' });
  const text = await res.text();
  return {
    url: TOML_URL,
    method: 'GET',
    status: res.status,
    ok: res.ok,
    body: res.ok ? parseToml(text) : text,
  };
}

// ----------------------------------------------------------------------------
// SEP-10 — Web Auth
// ----------------------------------------------------------------------------
export function getChallenge(account: string): Promise<UpstreamResult> {
  const url = `${WEB_AUTH_ENDPOINT}?account=${encodeURIComponent(account)}`;
  return call(url, { method: 'GET' });
}

export function postToken(signedTxXdr: string): Promise<UpstreamResult> {
  return call(WEB_AUTH_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: signedTxXdr }),
  });
}

// ----------------------------------------------------------------------------
// SEP-24 — Transfer
// ----------------------------------------------------------------------------
export function getInfo(): Promise<UpstreamResult> {
  return call(`${TRANSFER24}/info`, { method: 'GET' });
}

export function postInteractive(
  kind: 'deposit' | 'withdraw',
  jwt: string,
  payload: { asset_code: string; account: string; amount?: string },
): Promise<UpstreamResult> {
  return call(`${TRANSFER24}/transactions/${kind}/interactive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...bearer(jwt) },
    body: JSON.stringify(payload),
  });
}

export function getTransaction(id: string, jwt: string): Promise<UpstreamResult> {
  const url = `${TRANSFER24}/transaction?id=${encodeURIComponent(id)}`;
  return call(url, { method: 'GET', headers: bearer(jwt) });
}

export function getTransactions(assetCode: string, jwt: string): Promise<UpstreamResult> {
  const url = `${TRANSFER24}/transactions?asset_code=${encodeURIComponent(assetCode)}`;
  return call(url, { method: 'GET', headers: bearer(jwt) });
}

// ----------------------------------------------------------------------------
// Parser TOML mínimo, suficiente para un stellar.toml (SEP-1):
// claves de primer nivel `key = value`, secciones `[SECTION]` y arrays de
// tablas `[[CURRENCIES]]`. No pretende cubrir el spec TOML completo.
// ----------------------------------------------------------------------------
type TomlValue = string | number | boolean | TomlValue[];
export type TomlObject = { [k: string]: TomlValue | TomlObject | TomlObject[] };

function parseScalar(raw: string): TomlValue {
  const v = raw.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(',')
      .map((s) => parseScalar(s.trim()))
      .filter((s) => s !== '');
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

export function parseToml(text: string): TomlObject {
  const root: TomlObject = {};
  let current: TomlObject = root;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;

    // Array de tablas: [[CURRENCIES]]
    const arr = line.match(/^\[\[(.+)\]\]$/);
    if (arr) {
      const key = arr[1].trim();
      const obj: TomlObject = {};
      if (!Array.isArray(root[key])) root[key] = [] as TomlObject[];
      (root[key] as TomlObject[]).push(obj);
      current = obj;
      continue;
    }

    // Sección: [DOCUMENTATION]
    const sec = line.match(/^\[(.+)\]$/);
    if (sec) {
      const key = sec[1].trim();
      const obj: TomlObject = {};
      root[key] = obj;
      current = obj;
      continue;
    }

    // key = value
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = parseScalar(line.slice(eq + 1));
    current[key] = value;
  }

  return root;
}

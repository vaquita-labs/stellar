import { RequestType } from '@blend-capital/blend-sdk';
import {
  Address,
  Contract,
  nativeToScVal,
  rpc,
  scValToNative,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { clientEnv } from '@/core-ui/config/clientEnv';
import i18n from '@/core-ui/i18n';
import { useConfigStore } from '@/core-ui/stores';
import type { NetworkResponseDTO } from '@/core-ui/types';
import { getNetworkPassphrase, getRpcUrl } from './kit';
import { submitAndSettle } from './pollarError';
import { readTransferCredit } from './txCredit';
import { getPollarBinding } from './wallet/adapters/pollar-adapter';

export interface BlendConfig {
  poolId: string;
  usdcId: string;
  /** Issuer (G-address) of the USDC Blend accepts. Tells it apart from other
   *  USDC assets from different issuers (relevant on testnet). */
  usdcIssuer: string;
  feeStroops: string;
}

/**
 * Blend pool, the USDC it accepts and its issuer come from the token row of
 * the project config (DB → API → config store), same source as the Vaquita
 * pool and the DeFindex vault. Null while the config has not loaded or when
 * the token has no Blend pool configured (Admin → Tokens → Edit).
 */
export const blendConfigForToken = (
  token: NetworkResponseDTO['tokens'][number] | null,
): BlendConfig | null => {
  if (!token?.blendPoolContractAddress || !token.contractAddress || !token.issuer) return null;
  return {
    poolId: token.blendPoolContractAddress,
    usdcId: token.contractAddress,
    usdcIssuer: token.issuer,
    feeStroops: clientEnv.NEXT_PUBLIC_BLEND_FEE_STROOPS,
  };
};

/**
 * Non-reactive read of the ACTIVE token's Blend config, for imperative call
 * sites (transaction submission, balance reads). React code must derive it
 * from the store subscription instead: `blendConfigForToken(useConfigStore(s => s.token))`.
 */
export const getBlendConfig = (): BlendConfig | null =>
  blendConfigForToken(useConfigStore.getState().token);

const toBaseUnits = (input: string, decimals: number): bigint => {
  const [wholeRaw = '0', fractionalRaw = ''] = input.trim().split('.');
  const whole = wholeRaw.replace(/^0+/, '') || '0';
  const fractional = fractionalRaw.slice(0, decimals).padEnd(decimals, '0');
  const combined = `${whole}${fractional}`;
  if (!/^\d+$/.test(combined)) throw new Error('Invalid amount');
  return BigInt(combined);
};

// Sentinel "retirá todo": Blend interpreta un monto ≥ posición como "hasta el
// máximo disponible", así que al retirar el total pasamos i128::MAX y el pool
// saca capital + interés sin dejar polvo por lo que se devengó entre teclear y
// firmar. (i128 max = 2^127 − 1.)
const I128_MAX = (1n << 127n) - 1n;

/**
 * Codifica el `Request` de Blend (`{ address, amount, request_type }`) como el
 * ScVal-map que entiende `/tx/build` de Pollar. Las claves van en orden
 * alfabético porque un SCMap de Soroban debe estar ordenado por clave.
 */
const encodeBlendRequest = (usdcId: string, requestType: RequestType, rawAmount: bigint) => ({
  type: 'map' as const,
  value: [
    { key: { type: 'symbol', value: 'address' }, val: { type: 'address', value: usdcId } },
    { key: { type: 'symbol', value: 'amount' }, val: { type: 'i128', value: rawAmount.toString() } },
    { key: { type: 'symbol', value: 'request_type' }, val: { type: 'u32', value: requestType } },
  ],
});

/**
 * Manda un `submit` de Blend con un único request sobre el USDC de la red activa.
 * `directBlendSupply` / `directBlendWithdraw` son wrappers sobre esto; comparten
 * resolución de pool/USDC/fee.
 *
 * La operación la ARMA POLLAR: le pasamos la intención (`invoke_contract` +
 * contrato + método + args) y su backend hace build → simulate → firma → submit
 * en un solo round-trip (`/tx/build-sign-submit`), así el fee y los recursos
 * Soroban los calcula el server contra el estado real de la red en vez de que el
 * browser los estime.
 *
 * Quién paga ese fee es una decisión aparte y también del server: el patrocinio
 * se aplica al FIRMAR, por fee-bump, sobre cualquier XDR — venga de `/tx/build`
 * o del cliente — y está prendido por default salvo que la config de la app diga
 * lo contrario (`skipSponsorship` es el opt-out). Por eso `directUsdcTransfer`
 * puede armar la suya en el browser sin dejar al custodial sin XLM afuera.
 *
 * Devuelve el hash SOLO cuando el ledger confirmó (`submitAndSettle`), así el
 * paso siguiente de un retiro en dos saltos no sale antes de que la plata esté.
 */
const submitBlendRequest = async (
  requestType: RequestType,
  {
    address,
    amount,
    decimals,
    max,
  }: { address: string; amount: string; decimals: number; max?: boolean },
): Promise<{ hash: string }> => {
  const config = getBlendConfig();
  if (!config) throw new Error('Blend pool is not configured for this token');
  if (!address) throw new Error('No connected address');

  const binding = getPollarBinding();
  if (!binding) throw new Error('Pollar adapter is not bound yet. Connect your wallet first.');

  const rawAmount = max ? I128_MAX : toBaseUnits(amount, decimals);
  if (rawAmount <= 0n) throw new Error('Amount must be greater than zero');

  return submitAndSettle(
    binding.client,
    () =>
      binding.client.buildAndSignAndSubmitTx('invoke_contract', {
        contractId: config.poolId,
        method: 'submit',
        // submit(from, spender, to, requests): las tres direcciones son el usuario
        // (deposita lo suyo y recibe lo suyo), y el pool cobra/paga vía el USDC.
        args: [
          { type: 'address', value: address },
          { type: 'address', value: address },
          { type: 'address', value: address },
          { type: 'vec', value: [encodeBlendRequest(config.usdcId, requestType, rawAmount)] },
        ],
      }),
    'Blend transaction failed',
  );
};

/**
 * Deposita (SupplyCollateral) USDC directo al pool de Blend de la red activa,
 * sin lock de Vaquita. Funciona en cualquier red que tenga un pool configurado.
 */
export const directBlendSupply = (input: {
  address: string;
  amount: string;
  decimals: number;
}): Promise<{ hash: string }> => submitBlendRequest(RequestType.SupplyCollateral, input);

/**
 * Retira (WithdrawCollateral) el USDC que el usuario tiene puesto directo en
 * Blend. El pool paga a la misma dirección (`to = address`). Con `withdrawAll`
 * saca la posición entera (capital + interés) usando el sentinel i128::MAX.
 */
export const directBlendWithdraw = ({
  address,
  amount,
  decimals,
  withdrawAll,
}: {
  address: string;
  amount: string;
  decimals: number;
  withdrawAll?: boolean;
}): Promise<{ hash: string }> =>
  submitBlendRequest(RequestType.WithdrawCollateral, { address, amount, decimals, max: withdrawAll });

/**
 * Transfiere USDC (el SAC de la red activa) de una cuenta a otra vía un `transfer`
 * Soroban, firmado y enviado por Pollar (`signAndSubmitTx`). Se usa como salto 2
 * del retiro social (custodial → wallet externa): a diferencia de `sendPayment`
 * (pago clásico, NO patrocinado), esta vía Soroban SÍ la patrocina Pollar, así que
 * funciona con 0 XLM. El destino debe tener trustline al USDC para recibir.
 */
export const directUsdcTransfer = async ({
  from,
  to,
  amount,
  decimals,
}: {
  from: string;
  to: string;
  amount: string;
  decimals: number;
}): Promise<{ hash: string }> => {
  const config = getBlendConfig();
  if (!config) throw new Error('Blend pool is not configured for this token');

  const binding = getPollarBinding();
  if (!binding) throw new Error('Pollar adapter is not bound yet. Connect your wallet first.');

  const rawAmount = toBaseUnits(amount, decimals);
  if (rawAmount <= 0n) throw new Error('Amount must be greater than zero');

  const usdc = new Contract(config.usdcId);
  const transferOp = usdc.call(
    'transfer',
    Address.fromString(from).toScVal(),
    Address.fromString(to).toScVal(),
    nativeToScVal(rawAmount, { type: 'i128' }),
  );

  const server = new rpc.Server(getRpcUrl());
  const account = await server.getAccount(from);
  const transaction = new TransactionBuilder(account, {
    fee: config.feeStroops,
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(transferOp)
    .setTimeout(60)
    .build();

  const prepared = await server.prepareTransaction(transaction);
  return submitAndSettle(
    binding.client,
    () => binding.client.signAndSubmitTx(prepared.toXDR()),
    'USDC transfer failed',
  );
};

/** Memo opcional de un pago clásico: texto (≤28 bytes) o id numérico (uint64). */
export type StellarMemo = { type: 'text' | 'id'; value: string };

const MEMO_TEXT_MAX_BYTES = 28;
const MEMO_ID_MAX = (1n << 64n) - 1n; // uint64 máx

/** ¿El string es un entero que entra en un uint64? Entonces es un MEMO_ID. */
const isNumericMemoId = (v: string): boolean => {
  if (!/^\d+$/.test(v)) return false;
  try {
    return BigInt(v) <= MEMO_ID_MAX;
  } catch {
    return false;
  }
};

/**
 * Auto-detecta el tipo de memo de Stellar a partir de un string, sin pedirle al
 * usuario que elija: un número que entra en uint64 → `id` (lo que piden casi todos
 * los exchanges: "memo/tag" numérico); cualquier otra cosa → `text`. Devuelve
 * `null` si está vacío (memo opcional) o si no es un memo válido (texto > 28 bytes).
 * Compartido entre el Send de la wallet y el retiro a una wallet externa.
 */
export const resolveMemo = (raw: string | null | undefined): StellarMemo | null => {
  const v = (raw ?? '').trim();
  if (!v) return null;
  if (isNumericMemoId(v)) return { type: 'id', value: v };
  if (new TextEncoder().encode(v).length <= MEMO_TEXT_MAX_BYTES) return { type: 'text', value: v };
  return null;
};

/**
 * Envía USDC (el de la red activa) a otra cuenta con un PAGO CLÁSICO de Stellar
 * (`Operation.payment`), construido/firmado/enviado por Pollar (`buildAndSignAndSubmitTx`)
 * y por eso PATROCINADO: funciona con 0 XLM, igual que el swap y `directUsdcTransfer`.
 *
 * A diferencia del `transfer` del SAC de Soroban, un pago clásico es el que los
 * EXCHANGES detectan y acreditan —con su memo— y también lo lee cualquier wallet o
 * el balance del SAC (para una cuenta G el saldo clásico y el del SAC son el mismo).
 * Por eso es la vía universal para "Enviar": cubre exchanges Y wallets con un solo
 * camino. El destino debe tener trustline al USDC para recibir.
 *
 * `memo` es opcional pero clave para depósitos a exchanges: `text` (≤28 bytes) o
 * `id` (entero uint64), según lo pida el exchange. El monto va en unidades humanas
 * (string), como el resto de los builds de Pollar.
 */
export const sponsoredUsdcPayment = async ({
  to,
  amount,
  memo,
}: {
  to: string;
  amount: string;
  memo?: StellarMemo;
}): Promise<{ hash: string }> => {
  const config = getBlendConfig();
  if (!config) throw new Error('Blend pool is not configured for this token');

  const binding = getPollarBinding();
  if (!binding) throw new Error('Pollar adapter is not bound yet. Connect your wallet first.');

  if (!(Number(amount) > 0)) throw new Error('Amount must be greater than zero');

  return submitAndSettle(
    binding.client,
    () =>
      binding.client.sendPayment({
        destination: to,
        amount, // decimal string en unidades humanas (lo que espera Pollar)
        // USDC son 4 caracteres → alphanum4. El issuer sale del token activo.
        asset: { type: 'credit_alphanum4', code: 'USDC', issuer: config.usdcIssuer },
        options: memo ? { memo } : undefined,
      }),
    'USDC payment failed',
  );
};

/**
 * Lee el saldo USDC de una cuenta en unidades humanas simulando `balance()` del
 * SAC. Tira si no puede leerlo: quien mide un movimiento con esto necesita
 * distinguir "no tiene nada" de "no pude preguntar", porque tratar el segundo
 * como cero convierte todo el saldo ocioso de la wallet en un falso ingreso.
 */
export const readUsdcBalance = async (address: string, decimals: number): Promise<number> => {
  const config = getBlendConfig();
  if (!config) throw new Error('Blend pool is not configured for this token');
  if (!address) throw new Error('No connected address');

  const server = new rpc.Server(getRpcUrl());
  const usdc = new Contract(config.usdcId);
  const account = await server.getAccount(address);
  const tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(usdc.call('balance', Address.fromString(address).toScVal()))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim) || !sim.result) throw new Error('USDC balance simulation failed');
  const raw = scValToNative(sim.result.retval) as bigint;
  return Number(raw) / 10 ** decimals;
};

/**
 * Lee (read-only) el saldo del USDC de Blend de una cuenta, en unidades humanas.
 * Devuelve 0 ante cualquier error: es la variante para MOSTRAR un saldo, donde un
 * RPC caído no debe romper la pantalla. Para medir un movimiento usá
 * `readUsdcBalance` / `awaitUsdcCredit`.
 */
export const getBlendUsdcBalance = async (address: string, decimals: number): Promise<number> => {
  try {
    return await readUsdcBalance(address, decimals);
  } catch {
    return 0;
  }
};

// Cuánto esperamos a que el RPC refleje un movimiento que el ledger ya confirmó.
// El nodo que consultamos acá no es el mismo que confirmó la transacción, así que
// puede ir unos ledgers atrás (~5s cada uno).
const CREDIT_POLL_INTERVAL_MS = 2_000;
const CREDIT_MAX_POLLS = 10;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Devuelve, en unidades base, cuánto subió el saldo que devuelve `read` respecto
 * de `balanceBefore`, esperando a que lo refleje.
 *
 * Es la medición que decide cuánta plata mueve el paso siguiente de un retiro en
 * dos saltos, así que no puede adivinar: una lectura fallida se reintenta (nunca
 * cuenta como saldo cero) y, si el ingreso nunca aparece, tira en vez de devolver
 * 0 — la plata está en la wallet y el usuario tiene que enterarse, no ver un
 * "listo" que no movió nada.
 */
export const awaitCredit = async (
  read: () => Promise<number>,
  decimals: number,
  balanceBefore: number,
  options: { intervalMs?: number; maxPolls?: number } = {},
): Promise<bigint> => {
  const intervalMs = options.intervalMs ?? CREDIT_POLL_INTERVAL_MS;
  const maxPolls = options.maxPolls ?? CREDIT_MAX_POLLS;
  const factor = 10 ** decimals;

  for (let i = 0; i < maxPolls; i += 1) {
    if (i > 0) await sleep(intervalMs);
    try {
      const balance = await read();
      const credited = Math.floor((balance - balanceBefore) * factor);
      if (credited > 0) return BigInt(credited);
    } catch {
      // RPC hiccup: reintentamos. Nunca se interpreta como "no entró nada".
    }
  }
  throw new Error(
    i18n.t(
      'errors.transfer.creditNotVisible',
      "We can't see the funds in your wallet yet. They're safe — check your balance in a minute and finish the deposit.",
    ),
  );
};

/**
 * Cuánto USDC recibió `address` por el movimiento que se acaba de confirmar.
 *
 * Con `hash`, lo lee de los eventos `transfer` de esa transacción: es el monto
 * exacto y no hay ventana en la que una transferencia entrante ajena se sume al
 * total. Cuando eso no da una respuesta — la transacción todavía no llegó a este
 * RPC, o el meta no trae los eventos — cae a medir por diferencia de saldo, que
 * es aproximado pero nunca deja el flujo trabado.
 */
export const awaitUsdcCredit = async (
  address: string,
  decimals: number,
  balanceBefore: number,
  options: { hash?: string; intervalMs?: number; maxPolls?: number } = {},
): Promise<bigint> => {
  const { hash, ...pollOptions } = options;
  const config = getBlendConfig();

  if (hash && config) {
    const credited = await readTransferCredit(hash, config.usdcId, address);
    if (credited !== null && credited > 0n) return credited;
  }
  return awaitCredit(() => readUsdcBalance(address, decimals), decimals, balanceBefore, pollOptions);
};

/**
 * @deprecated Usar `directBlendSupply`. Alias de compatibilidad: el nombre
 * "Mainnet" quedó obsoleto cuando el depósito pasó a resolverse por red.
 */
export const directBlendMainnetSupply = directBlendSupply;

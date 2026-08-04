import { rpc, scValToNative, StrKey, xdr } from '@stellar/stellar-sdk';
import { getRpcUrl } from './kit';

/**
 * Cuánto de `tokenId` le entró a `to` en la transacción `hash`, en unidades base.
 *
 * Es la alternativa exacta a medir un movimiento restando saldos: la transacción
 * YA dice cuánto movió, en sus eventos `transfer`, así que no hay ventana en la
 * que una transferencia entrante ajena se cuele en la cuenta. También evita la
 * espera: el meta está disponible apenas la transacción confirma.
 *
 * Devuelve `null` cuando no se puede afirmar nada — la transacción todavía no
 * está en este RPC, el meta no trae eventos, o ninguno matchea. `null` significa
 * "no sé", NUNCA "no entró nada": el caller cae a medir por saldo.
 */
export const readTransferCredit = async (
  hash: string,
  tokenId: string,
  to: string,
  options: { rpcUrl?: string } = {},
): Promise<bigint | null> => {
  if (!hash || !tokenId || !to) return null;
  try {
    const server = new rpc.Server(options.rpcUrl ?? getRpcUrl());
    const tx = await server.getTransaction(hash);
    if (tx.status !== rpc.Api.GetTransactionStatus.SUCCESS) return null;

    // `contractEventsXdr` viene agrupado por operación; las nuestras son de una
    // sola, pero recorrer todo mantiene esto correcto si alguna deja de serlo.
    let total = 0n;
    let matched = false;
    for (const group of tx.events?.contractEventsXdr ?? []) {
      for (const event of group) {
        const credited = transferAmountTo(event, tokenId, to);
        if (credited === null) continue;
        matched = true;
        total += credited;
      }
    }
    return matched ? total : null;
  } catch {
    return null;
  }
};

/**
 * Monto de un evento `transfer` de `tokenId` cuyo destino es `to`, o `null` si el
 * evento es otra cosa.
 *
 * Filtra por contrato Y por destino: una transacción puede mover el token varias
 * veces (el vault cobra de sus estrategias antes de pagarle al usuario), y solo
 * las patas que terminan en `to` son lo que el usuario recibió. Varias que sí
 * terminan ahí se suman: son partes del mismo movimiento.
 *
 * Los topics son los de SEP-41, que el SAC de Stellar también emite:
 * `["transfer", from, to]`, con el asset agregado como cuarto desde protocolo 22.
 */
const transferAmountTo = (event: xdr.ContractEvent, tokenId: string, to: string): bigint | null => {
  const contractId = event.contractId();
  if (!contractId) return null;
  // `contractId()` se declara `xdr.Hash` pero en runtime es el Buffer de 32 bytes
  // que `encodeContract` espera (mismo cast que en shared/services/stellar/events).
  if (StrKey.encodeContract(contractId as unknown as Buffer) !== tokenId) return null;

  const body = event.body().v0();
  const topics = body.topics();
  if (topics.length < 3) return null;
  if (scValToNative(topics[0]) !== 'transfer') return null;
  if (String(scValToNative(topics[2])) !== to) return null;

  const amount = scValToNative(body.data());
  return typeof amount === 'bigint' ? amount : null;
};

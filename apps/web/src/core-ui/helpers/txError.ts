import type { TFunction } from 'i18next';
import { isTxPendingError } from '@/networks/stellar/pollarError';
import { isVaultContractError } from '@/networks/stellar/vaultError';
import { isWithdrawPaymentError } from '@/networks/stellar/withdrawError';

export interface HumanTxError {
  /** Mensaje corto y legible para mostrar arriba (una frase). */
  title: string;
  /** El texto crudo del error, para el botón de copiar / "ver detalles". */
  raw: string;
  /**
   * La transacción salió a la red y todavía puede confirmar. La UI no debe
   * ofrecer un reintento acá: la primera puede llegar igual y el usuario pagaría
   * dos veces.
   */
  pending?: boolean;
  /** Hash de la transacción en vuelo, para linkear al explorador. */
  hash?: string;
}

// Errores de contrato conocidos → explicación humana y accionable (qué pasó +
// qué hacer). Los códigos son los que devuelven el SAC de Stellar / el pool de
// Blend (Error(Contract, #N)).
const CONTRACT_ERROR_KEYS: Record<number, { key: string; fallback: string }> = {
  10: {
    key: 'txError.contract.10',
    fallback: "You don't have enough USDC in your wallet to cover this amount. Add funds and try again.",
  },
  13: {
    key: 'txError.contract.13',
    fallback: 'Your wallet needs to enable USDC first. Add the USDC trustline and try again.',
  },
};

/**
 * Convierte un error de transacción (que puede venir como un `HostError` enorme
 * con todo el event log, o un genérico tipo "Pollar withdraw failed") en un
 * mensaje corto, legible y accionable para el usuario final. Nunca muestra el
 * texto crudo: ante cualquier forma desconocida cae a un genérico amable. El
 * `raw` se conserva solo para logging/telemetría, no para la UI. `t` es opcional
 * (si no se pasa, usa los textos en inglés).
 */
export const humanizeTxError = (
  error: unknown,
  t?: TFunction,
): HumanTxError => {
  const raw =
    typeof error === 'string'
      ? error
      : (error as { message?: string })?.message ?? String(error ?? '');
  // Sin `t` el fallback se interpola a mano: devolverlo crudo dejaría un
  // `{{destination}}` literal en pantalla en los mensajes que llevan datos.
  const tr = (key: string, fallback: string, opts?: Record<string, unknown>) =>
    t
      ? t(key, fallback, opts)
      : opts
        ? fallback.replace(/\{\{(\w+)\}\}/g, (match, name) => String(opts[name] ?? match))
        : fallback;
  const generic = tr('txError.generic', "We couldn't complete the transaction. Please try again in a moment.");

  // Salió a la red pero todavía no confirmó. No es un fallo, y decirle "probá de
  // nuevo" sería invitarlo a mandar la misma plata dos veces.
  if (isTxPendingError(error)) {
    return {
      title: tr(
        'txError.pending',
        'Your transaction was sent and is still confirming. Check your balance in a minute before trying again.',
      ),
      raw,
      pending: true,
      hash: error.hash,
    };
  }

  // El vault ya nos dijo el motivo y lo trae tipado. Va ANTES de la escalera de
  // regex a propósito: el `message` de este error es nuestra propia traducción,
  // así que matchearlo por texto funcionaría en inglés y se rompería en cuanto
  // el usuario tenga la app en español.
  if (isVaultContractError(error)) {
    return { title: tr(error.i18nKey, error.fallback), raw: error.raw };
  }

  // El retiro sacó la plata de Blend y falló al pagarla: la escalera de regex de
  // abajo miraría el error del pago y diría "no pudimos completar la
  // transacción", que acá es falso — una parte SÍ se completó. Va antes por lo
  // mismo que el del vault: el `message` ya es nuestra propia traducción.
  if (isWithdrawPaymentError(error)) {
    return {
      title: tr(error.i18nKey, error.fallback, { destination: error.destination }),
      raw: error.raw,
    };
  }

  if (!raw) return { title: generic, raw };

  // El usuario canceló/rechazó la firma en su wallet: no es un fallo real. Cada
  // wallet lo reporta distinto, así que cubrimos los textos habituales:
  //  - externas (Freighter/xBull/Albedo): "user declined/rejected", "denied"…
  //  - smart/passkey (WebAuthn): DOMException NotAllowedError, "operation either
  //    timed out or was not allowed", AbortError → "aborted".
  if (
    /declin|reject|denied|cancell?ed|user cancel|dismiss|not allowed|notallowed|was not allowed|abort|user closed|closed the (popup|window|modal)|operation either timed out/i.test(
      raw,
    )
  ) {
    return { title: tr('txError.rejected', 'You cancelled the signature. No changes were made.'), raw };
  }

  // Error(Contract, #N): el motivo de rechazo del contrato.
  const contractMatch = raw.match(/Error\(Contract,\s*#(\d+)\)/);
  if (contractMatch) {
    const code = Number(contractMatch[1]);
    const known = CONTRACT_ERROR_KEYS[code];
    if (known) return { title: tr(known.key, known.fallback), raw };
    return {
      title: tr('txError.contractGeneric', 'The network rejected the transaction. Please try again.'),
      raw,
    };
  }

  if (/trustline/i.test(raw)) {
    return { title: tr('txError.trustline', 'Your wallet needs to enable USDC first. Add the USDC trustline and try again.'), raw };
  }
  if (/insufficient|not within the allowed range|balance|underfunded/i.test(raw)) {
    return { title: tr('txError.balance', "You don't have enough balance to cover this transaction and its network fee."), raw };
  }
  if (/network|fetch|connection|offline|econn|dns|failed to fetch/i.test(raw)) {
    return { title: tr('txError.network', "We couldn't reach the network. Check your connection and try again."), raw };
  }
  // Un texto de timeout puede venir de antes de firmar (reintentar es gratis) o
  // de una tx ya enviada (reintentar la duplica). Sin saber cuál es, el mensaje
  // manda a mirar el saldo primero en vez de prometer que es seguro repetir.
  if (/timeout|timed out|deadline|expired|too long/i.test(raw)) {
    return {
      title: tr('txError.timeout', 'The network is taking longer than usual. Check your balance before trying again.'),
      raw,
    };
  }

  // Sin patrón conocido (incluye genéricos del SDK tipo "Pollar withdraw
  // failed"): nunca volcamos el crudo al usuario, mostramos el genérico amable.
  return { title: generic, raw };
};

import type { TFunction } from 'i18next';

export interface HumanTxError {
  /** Mensaje corto y legible para mostrar arriba (una frase). */
  title: string;
  /** El texto crudo del error, para el botón de copiar / "ver detalles". */
  raw: string;
}

// Errores de contrato conocidos → explicación humana. Los códigos son los que
// devuelven el SAC de Stellar / el pool de Blend (Error(Contract, #N)).
const CONTRACT_ERROR_KEYS: Record<number, { key: string; fallback: string }> = {
  10: {
    key: 'txError.contract.10',
    fallback: "You don't have enough of the accepted USDC in your wallet for this amount.",
  },
  13: {
    key: 'txError.contract.13',
    fallback: 'Your wallet is missing the trustline for this asset.',
  },
};

/**
 * Convierte un error de transacción (que puede venir como un `HostError` enorme
 * con todo el event log) en un mensaje corto y legible, conservando el texto
 * crudo aparte para copiarlo. Nunca tira: ante cualquier forma rara cae a un
 * genérico. `t` es opcional (si no se pasa, usa los textos en inglés).
 */
export const humanizeTxError = (
  error: unknown,
  t?: TFunction,
): HumanTxError => {
  const raw =
    typeof error === 'string'
      ? error
      : (error as { message?: string })?.message ?? String(error ?? '');
  const tr = (key: string, fallback: string, opts?: Record<string, unknown>) =>
    t ? t(key, fallback, opts) : fallback;

  if (!raw) return { title: tr('txError.generic', 'Something went wrong.'), raw };

  // Error(Contract, #N): el motivo de rechazo del contrato.
  const contractMatch = raw.match(/Error\(Contract,\s*#(\d+)\)/);
  if (contractMatch) {
    const code = Number(contractMatch[1]);
    const known = CONTRACT_ERROR_KEYS[code];
    if (known) return { title: tr(known.key, known.fallback), raw };
    return {
      title: tr('txError.contractGeneric', 'The transaction was rejected by the contract (code #{{code}}).', {
        code,
      }),
      raw,
    };
  }

  if (/trustline/i.test(raw)) {
    return { title: tr('txError.trustline', 'Your wallet is missing the trustline for this asset.'), raw };
  }
  if (/insufficient|not within the allowed range|balance/i.test(raw)) {
    return { title: tr('txError.balance', "You don't have enough balance for this transaction."), raw };
  }
  if (/user (declined|rejected)|denied|cancell?ed/i.test(raw)) {
    return { title: tr('txError.rejected', 'The signature was cancelled.'), raw };
  }

  // Sin patrón conocido: primera línea recortada, para no volcar un párrafo.
  const firstLine = raw.split('\n')[0].trim().slice(0, 140);
  return { title: firstLine || tr('txError.generic', 'Something went wrong.'), raw };
};

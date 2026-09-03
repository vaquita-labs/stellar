import i18n from '@/core-ui/i18n';

// DeFindex vault ContractError code → i18n key (+ English fallback). Subset the
// UI can actually hit on deposit/withdraw (the vault's full Errors enum is much
// larger — governance/rebalance codes never reach an end user). Same shape and
// per-call translation as POOL_ERROR_KEYS in poolQueries.ts.
const VAULT_ERROR_KEYS: Record<number, { key: string; fallback: string }> = {
  412: { key: 'errors.vault.insufficientBalance', fallback: 'Not enough balance' },
  124: { key: 'errors.vault.amountOverTotalSupply', fallback: 'Amount exceeds the vault supply, please retry' },
  114: { key: 'errors.vault.insufficientManagedFunds', fallback: "The vault can't cover this right now, please retry" },
  451: { key: 'errors.vault.amountBelowMinDust', fallback: 'Amount is too small' },
  452: { key: 'errors.vault.underlyingAmountBelowMin', fallback: 'Price moved past your limit, please retry' },
  453: { key: 'errors.vault.bTokensAmountBelowMin', fallback: 'Price moved past your limit, please retry' },
  410: { key: 'errors.vault.negativeNotAllowed', fallback: 'Invalid amount' },
  417: { key: 'errors.vault.onlyPositiveAmount', fallback: 'Amount must be greater than zero' },
  401: { key: 'errors.vault.notInitialized', fallback: 'Vault is not ready' },
  418: { key: 'errors.vault.notAuthorized', fallback: 'Not authorized' },
  130: { key: 'errors.vault.unauthorized', fallback: 'Not authorized' },
};

/**
 * Un rechazo del vault que SÍ dice por qué.
 *
 * Antes traducíamos el código a una frase y tirábamos un `Error` pelado con ese
 * texto. El código se perdía ahí, y `humanizeTxError` —que matchea contra el
 * `Error(Contract, #N)` literal— no tenía con qué reconocerlo: todos los códigos
 * del vault terminaban en el genérico "no pudimos completar la transacción".
 * Llevando el código y la key adentro del error, el motivo real sobrevive hasta
 * la pantalla.
 */
export class VaultContractError extends Error {
  readonly code: number;
  readonly i18nKey: string;
  readonly fallback: string;
  /** El texto original del contrato, para logs y "ver detalles". */
  readonly raw: string;

  constructor(code: number, i18nKey: string, fallback: string, raw: string, options?: { cause?: unknown }) {
    super(i18n.t(i18nKey, fallback), options);
    this.name = 'VaultContractError';
    this.code = code;
    this.i18nKey = i18nKey;
    this.fallback = fallback;
    this.raw = raw;
  }
}

/** True cuando `error` es un rechazo reconocido del vault. */
export const isVaultContractError = (error: unknown): error is VaultContractError => error instanceof VaultContractError;

/**
 * Parsea un error de contrato del vault (ej. "Error(Contract, #412)") a un
 * `VaultContractError`. Devuelve null cuando no es un error de vault conocido,
 * así el que llama puede dejar pasar el error original.
 */
export function parseVaultError(err: unknown): VaultContractError | null {
  const str = err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err ?? '');
  const match = /Error\(Contract,\s*#(\d+)\)/.exec(str);
  if (!match || !match[1]) return null;
  const code = parseInt(match[1], 10);
  const entry = VAULT_ERROR_KEYS[code];
  return entry ? new VaultContractError(code, entry.key, entry.fallback, str, { cause: err }) : null;
}

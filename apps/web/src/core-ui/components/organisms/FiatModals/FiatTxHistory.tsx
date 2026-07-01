'use client';

import { useAnclapAuthStore } from '@/networks/anclap/anclapAuth';
import { AnclapError, SepTransaction, useAnclap } from '@/networks/anclap/useAnclap';
import { Spinner } from '@heroui/react';
import { usePollar } from '@pollar/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronDown, FiChevronRight, FiRefreshCw } from 'react-icons/fi';

interface FiatTxHistoryProps {
  assetCode: string;
  /**
   * Filtra el historial a un tipo: cada modal muestra sólo sus operaciones.
   * Valores SEP-24: 'deposit' | 'withdrawal' (ojo: Anclap usa "withdrawal").
   */
  kind?: 'deposit' | 'withdrawal';
  /** JWT del flujo en curso del modal; si falta, se usa el del store global. */
  jwt?: string | null;
  /**
   * Al tocar una transacción se la "sube" al modal principal para continuar
   * donde quedó (reabrir Anclap, reanudar el polling y terminar el swap).
   * Recibe la tx con el estado más fresco y el JWT con el que se leyó.
   */
  onResume?: (tx: SepTransaction, jwt: string) => void;
}

const FAILED = new Set(['error', 'refunded', 'expired', 'no_market', 'too_small', 'too_large']);

function statusColor(status?: string): string {
  if (status === 'completed') return 'text-success';
  if (status && FAILED.has(status)) return 'text-danger';
  return 'text-amber-600';
}

function fmtDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

function looksLikeAuthError(msg: string): boolean {
  return /401|jwt|unauthor|forbidden|token/i.test(msg);
}

/**
 * Historial SEP-24 (deposit + withdraw) del asset. Usa el JWT compartido
 * ({@link useAnclapAuthStore}) para que aparezca en ambos modales una vez que
 * cualquier flujo autenticó; si no hay JWT, el botón autentica (una firma).
 * Tocar una transacción la carga en el modal principal para continuarla.
 */
export function FiatTxHistory({ assetCode, kind, jwt: jwtProp, onResume }: FiatTxHistoryProps) {
  const { t } = useTranslation();
  const { walletAddress } = usePollar();
  const { authenticate, getTransaction, getTransactions } = useAnclap();
  const { jwt: storeJwt, setJwt, clearJwt } = useAnclapAuthStore();

  const effectiveJwt = jwtProp ?? storeJwt;

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SepTransaction[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Evita re-cargar en loop por el mismo token cuando una carga falla.
  const autoTriedFor = useRef<string | null>(null);

  // Transacción cuyo estado se está leyendo antes de subirla al modal.
  const [selectingId, setSelectingId] = useState<string | null>(null);

  // Lee el estado más reciente de la tx y la entrega al modal para continuarla.
  const selectRow = async (listTx: SepTransaction) => {
    if (!onResume || !effectiveJwt || selectingId) return;
    setSelectingId(listTx.id);
    let fresh: SepTransaction | undefined;
    try {
      fresh = await getTransaction(listTx.id, effectiveJwt);
    } catch {
      /* si falla, usamos el dato de la lista como fallback */
    } finally {
      setSelectingId(null);
    }
    onResume(fresh ?? listTx, effectiveJwt);
  };

  const load = async (opts: { authIfMissing?: boolean } = {}) => {
    if (!walletAddress || loading) return;
    setLoading(true);
    setError(null);
    try {
      let token = effectiveJwt;
      if (!token) {
        if (!opts.authIfMissing) return;
        token = await authenticate(walletAddress);
        setJwt(token);
      }
      const txs = await getTransactions(assetCode, token);
      txs.sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? ''));
      setItems(txs);
    } catch (e) {
      const msg = e instanceof AnclapError || e instanceof Error ? e.message : String(e);
      setError(msg);
      // Si el JWT compartido caducó, lo descartamos para que el próximo
      // "Actualizar" vuelva a autenticar.
      if (!jwtProp && looksLikeAuthError(msg)) clearJwt();
    } finally {
      setLoading(false);
    }
  };

  // Carga automática (sin pedir firma) cuando hay un JWT disponible y todavía
  // no intentamos con ese token.
  useEffect(() => {
    if (effectiveJwt && autoTriedFor.current !== effectiveJwt) {
      autoTriedFor.current = effectiveJwt;
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveJwt]);

  // Cada modal muestra sólo sus operaciones (deposit en receive, withdraw en send).
  const visibleItems = items === null ? null : kind ? items.filter((tx) => tx.kind === kind) : items;
  const count = visibleItems?.length ?? 0;

  return (
    <div className={`rounded-lg border border-black border-b-2 ${open ? 'bg-[#F5FBFF]' : 'bg-white'}`}>
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-2 text-left text-sm font-semibold text-black"
        >
          <FiChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
          {t('wallet.fiat.history.title', 'Transaction history')}
          {items !== null ? ` (${count})` : ''}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            void load({ authIfMissing: true });
          }}
          className="flex items-center gap-1 text-xs font-normal text-gray-500 hover:text-black"
        >
          {loading ? <Spinner size="sm" color="current" /> : <FiRefreshCw className="h-3.5 w-3.5" />}
          {t('wallet.fiat.history.refresh', 'Refresh')}
        </button>
      </div>

      {open && (
      <div className="flex flex-col gap-2 border-t border-gray-200 p-3">
        {!walletAddress && <p className="text-xs text-gray-500">{t('wallet.fiat.history.connect', 'Connect your wallet first.')}</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
        {visibleItems === null && !loading && walletAddress && (
          <p className="text-xs text-gray-500">{t('wallet.fiat.history.empty', 'No history loaded yet — tap Refresh.')}</p>
        )}
        {visibleItems !== null && visibleItems.length === 0 && (
          <p className="text-xs text-gray-500">{t('wallet.fiat.history.none', 'No transactions yet.')}</p>
        )}
        {visibleItems !== null && visibleItems.length > 0 && (
          <p className="text-[11px] text-gray-500">
            {t('wallet.fiat.history.resumeHint', 'Tap a transaction to continue where you left off.')}
          </p>
        )}
        {visibleItems?.map((tx) => {
          const busyRow = selectingId === tx.id;
          return (
            <button
              key={tx.id}
              type="button"
              onClick={() => void selectRow(tx)}
              disabled={!onResume || !effectiveJwt || selectingId !== null}
              className="flex w-full items-start justify-between gap-3 rounded-md border border-gray-200 px-2.5 py-2 text-left transition hover:bg-[#F5FBFF] disabled:cursor-default disabled:opacity-60"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-black">
                  {tx.kind === 'deposit'
                    ? t('wallet.fiat.history.deposit', 'Deposit')
                    : t('wallet.fiat.history.withdraw', 'Withdraw')}{' '}
                  <span className="text-gray-500">
                    {tx.amount_in ?? tx.amount_out ?? '—'} {assetCode}
                  </span>
                </p>
                <p className="text-[11px] text-gray-400">{fmtDate(tx.started_at)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`text-[11px] font-semibold ${statusColor(tx.status)}`}>{tx.status ?? '—'}</span>
                {busyRow ? (
                  <Spinner size="sm" color="current" />
                ) : (
                  <FiChevronRight className="h-3.5 w-3.5 text-gray-400" />
                )}
              </div>
            </button>
          );
        })}
      </div>
      )}
    </div>
  );
}
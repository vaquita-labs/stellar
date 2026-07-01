'use client';

import { useAnclapAuthStore } from '@/networks/anclap/anclapAuth';
import { AnclapError, SepTransaction, useAnclap } from '@/networks/anclap/useAnclap';
import { Spinner } from '@heroui/react';
import { usePollar } from '@pollar/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next';
import { FiChevronDown, FiExternalLink, FiRefreshCw } from 'react-icons/fi';
import { FiatStep, FiatStepList } from './FiatStepList';

interface FiatTxHistoryProps {
  assetCode: string;
  /**
   * Filtra el historial a un tipo: cada modal muestra sólo sus operaciones.
   * Valores SEP-24: 'deposit' | 'withdrawal' (ojo: Anclap usa "withdrawal").
   */
  kind?: 'deposit' | 'withdrawal';
  /** JWT del flujo en curso del modal; si falta, se usa el del store global. */
  jwt?: string | null;
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

// Mapea el status SEP-24 a una de las 4 fases del ciclo de vida.
const PHASE_ORDER = ['started', 'userTransfer', 'processing', 'completed'] as const;
type Phase = (typeof PHASE_ORDER)[number];
const STATUS_PHASE: Record<string, Phase> = {
  incomplete: 'started',
  pending_user_transfer_start: 'userTransfer',
  pending_user_transfer_complete: 'userTransfer',
  pending_anchor: 'processing',
  pending_external: 'processing',
  pending_stellar: 'processing',
  pending_trust: 'processing',
  pending_receiver: 'processing',
  pending_sender: 'processing',
  completed: 'completed',
  // terminales con error
  error: 'processing',
  refunded: 'processing',
  expired: 'started',
  no_market: 'started',
  too_small: 'started',
  too_large: 'started',
};

// Construye el stepper de fases para una transacción, marcando dónde quedó.
function phaseSteps(status: string | undefined, t: TFunction): FiatStep[] {
  const labels: Record<Phase, string> = {
    started: t('wallet.fiat.history.phase.started', 'Started'),
    userTransfer: t('wallet.fiat.history.phase.userTransfer', 'User transfer'),
    processing: t('wallet.fiat.history.phase.processing', 'Anchor processing'),
    completed: t('wallet.fiat.history.phase.completed', 'Completed'),
  };
  const failed = status ? FAILED.has(status) : false;
  const idx = PHASE_ORDER.indexOf((status && STATUS_PHASE[status]) || 'started');
  return PHASE_ORDER.map((key, i) => ({
    key,
    label: labels[key],
    implemented: true,
    status:
      i < idx ? 'done' : i === idx ? (failed ? 'error' : status === 'completed' ? 'done' : 'running') : 'idle',
  }));
}

function looksLikeAuthError(msg: string): boolean {
  return /401|jwt|unauthor|forbidden|token/i.test(msg);
}

/**
 * Historial SEP-24 (deposit + withdraw) del asset. Usa el JWT compartido
 * ({@link useAnclapAuthStore}) para que aparezca en ambos modales una vez que
 * cualquier flujo autenticó; si no hay JWT, el botón autentica (una firma).
 */
export function FiatTxHistory({ assetCode, kind, jwt: jwtProp }: FiatTxHistoryProps) {
  const { t } = useTranslation();
  const { walletAddress } = usePollar();
  const { authenticate, getTransaction, getTransactions } = useAnclap();
  const { jwt: storeJwt, setJwt, clearJwt } = useAnclapAuthStore();

  const effectiveJwt = jwtProp ?? storeJwt;

  const [items, setItems] = useState<SepTransaction[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Evita re-cargar en loop por el mismo token cuando una carga falla.
  const autoTriedFor = useRef<string | null>(null);

  // Detalle de una transacción expandida (status/fases al día).
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, SepTransaction>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);

  const toggleRow = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    // Refresca esa transacción para ver el estado más reciente.
    if (effectiveJwt) {
      setDetailLoadingId(id);
      try {
        const fresh = await getTransaction(id, effectiveJwt);
        if (fresh) setDetail((d) => ({ ...d, [id]: fresh }));
      } catch {
        /* dejamos el dato de la lista como fallback */
      } finally {
        setDetailLoadingId(null);
      }
    }
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
    <details className="rounded-lg border border-black border-b-2 bg-white">
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-black">
        <span>
          {t('wallet.fiat.history.title', 'Transaction history')}
          {items !== null ? ` (${count})` : ''}
        </span>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.preventDefault();
            void load({ authIfMissing: true });
          }}
          className="flex items-center gap-1 text-xs font-normal text-gray-500 hover:text-black"
        >
          {loading ? <Spinner size="sm" color="current" /> : <FiRefreshCw className="h-3.5 w-3.5" />}
          {t('wallet.fiat.history.refresh', 'Refresh')}
        </span>
      </summary>

      <div className="flex flex-col gap-2 border-t border-gray-200 p-3">
        {!walletAddress && <p className="text-xs text-gray-500">{t('wallet.fiat.history.connect', 'Connect your wallet first.')}</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
        {visibleItems === null && !loading && walletAddress && (
          <p className="text-xs text-gray-500">{t('wallet.fiat.history.empty', 'No history loaded yet — tap Refresh.')}</p>
        )}
        {visibleItems !== null && visibleItems.length === 0 && (
          <p className="text-xs text-gray-500">{t('wallet.fiat.history.none', 'No transactions yet.')}</p>
        )}
        {visibleItems?.map((listTx) => {
          const tx = detail[listTx.id] ?? listTx;
          const expanded = expandedId === tx.id;
          return (
            <div key={tx.id} className="rounded-md border border-gray-200">
              <button
                type="button"
                onClick={() => void toggleRow(tx.id)}
                className="flex w-full items-start justify-between gap-3 px-2.5 py-2 text-left hover:bg-[#F5FBFF] transition"
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
                  <FiChevronDown className={`h-3.5 w-3.5 text-gray-400 transition ${expanded ? 'rotate-180' : ''}`} />
                </div>
              </button>

              {expanded && (
                <div className="flex flex-col gap-2 border-t border-gray-200 p-2.5">
                  {detailLoadingId === tx.id && (
                    <p className="flex items-center gap-1 text-[11px] text-gray-500">
                      <Spinner size="sm" color="current" /> {t('wallet.fiat.history.refreshing', 'Refreshing…')}
                    </p>
                  )}
                  <FiatStepList steps={phaseSteps(tx.status, t)} />
                  {tx.message && <p className="text-[11px] text-gray-500">{tx.message}</p>}
                  {tx.more_info_url && (
                    <a
                      href={tx.more_info_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-black"
                    >
                      <FiExternalLink className="h-3 w-3" />
                      {t('wallet.fiat.history.details', 'Details')}
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}

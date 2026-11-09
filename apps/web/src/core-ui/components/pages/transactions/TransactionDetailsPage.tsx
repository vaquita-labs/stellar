'use client';

import {
  addSuccessToast,
  PageLayout,
  WithHydrated,
  formatTransactionTime,
  useActivityMeta,
} from '@/core-ui/components/molecules';
import { formatTimeDeposit } from '@/core-ui/helpers';
import type { ActivityItem } from '@/core-ui/helpers/activity';
import { formatTokenPrecise } from '@/core-ui/helpers/numbers';
import {
  activityStatus,
  AppTransaction,
  buildTransactions,
  findTransactionFor,
  TransactionStatus,
} from '@/core-ui/helpers/transactions';
import { useCryptoMode, useDepositsComplete, useWalletActivity } from '@/core-ui/hooks';
import { useConfigStore } from '@/core-ui/stores';
import { stellarExpertTxUrl } from '@/networks/stellar/helpers';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronDown, FiCopy, FiExternalLink, FiShare2 } from 'react-icons/fi';

const STATUS_CLASSES: Record<TransactionStatus, string> = {
  completed: 'bg-success text-white border-black',
  pending: 'bg-primary text-black border-black',
  failed: 'bg-red-500 text-white border-black',
};

const shortHash = (hash: string) => (hash.length > 14 ? `${hash.slice(0, 6)}…${hash.slice(-6)}` : hash);

/** Fila etiqueta/valor de los bloques de datos. */
function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-2">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm text-black text-right min-w-0">{children}</span>
    </div>
  );
}

function DataBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-black border-b-2 bg-white">
      {children}
    </div>
  );
}

function DetailsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 py-4">
        <span className="h-9 w-40 rounded bg-default-100 animate-pulse" />
        <span className="h-4 w-24 rounded bg-default-100 animate-pulse" />
      </div>
      {[3, 4].map((rows) => (
        <div key={rows} className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-black border-b-2 bg-white">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3">
              <span className="h-3.5 w-20 rounded bg-default-100 animate-pulse" />
              <span className="h-3.5 w-28 rounded bg-default-100 animate-pulse" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Los ids de la API (`d-12`, `w-12-3`); cualquier otro es del historial on-chain. */
const isAppTransactionId = (id: string) => /^[dw]-\d/.test(id);

/** Pantalla propia en /transactions/[id]: no es una capa sobre la lista ni un
 *  modal, así que se llega igual desde la lista, una notificación o un link.
 *  El id es el de un movimiento de la API o el de un registro del historial
 *  on-chain de la billetera; si ese registro es una posición a plazo que la API
 *  conoce, se muestra con el detalle de la API (plazo, recompensas). */
export function TransactionDetailsPage({ transactionId }: { transactionId: string }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { walletAddress, network } = useConfigStore();
  const { data, isLoading } = useDepositsComplete(walletAddress);
  // Todo lo on-chain de esta pantalla —el hash, copiarlo, el explorador y
  // compartir— vive detrás de "Sé de cripto". Para el resto, el movimiento se
  // explica solo con monto, origen, destino y estado; el hash sólo agrega una
  // cadena de 64 caracteres que no significa nada y un link que se abre a una
  // pantalla en inglés llena de jerga.
  const cryptoMode = useCryptoMode();
  // Colapsado por defecto: la mayoría de las veces alcanza con el estado.
  const [showHistory, setShowHistory] = useState(false);

  const activity = useWalletActivity();
  const describeActivity = useActivityMeta();
  const fromApp = isAppTransactionId(transactionId);

  const transactions = useMemo(() => buildTransactions(data?.deposits ?? []), [data]);
  const activityItem: ActivityItem | undefined = fromApp
    ? undefined
    : activity.data?.find((item) => item.id === transactionId);
  const transaction: AppTransaction | undefined = fromApp
    ? transactions.find((item) => item.id === transactionId)
    : activityItem
      ? findTransactionFor(transactions, activityItem)
      : undefined;

  const depositsLoading = isLoading && !data;
  const loading = fromApp
    ? depositsLoading
    : activityItem
      ? // A term movement may still turn out to be one the API knows in full.
        depositsLoading && (activityItem.kind === 'lockedIn' || activityItem.kind === 'lockedOut')
      : // Not among what is loaded so far: it may be further back in the history.
        !activity.isError && (activity.isPending || activity.isPlaceholderData);

  const hash = transaction?.transactionHash || activityItem?.hash || '';
  const showHash = cryptoMode && !!hash;
  const explorerUrl = showHash ? stellarExpertTxUrl(hash, network?.type) : '';

  const copyHash = async () => {
    if (!hash) return;
    await navigator.clipboard.writeText(hash);
    addSuccessToast(t('transactions.details.hashCopied', 'Transaction ID copied'));
  };

  const share = async () => {
    if (!explorerUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: t('transactions.details.title', 'Transaction details'), url: explorerUrl });
        return;
      } catch {
        // El usuario canceló el diálogo nativo: no es un error que mostrar.
        return;
      }
    }
    await navigator.clipboard.writeText(explorerUrl);
    addSuccessToast(t('transactions.details.linkCopied', 'Link copied'));
  };

  // Se llega desde la lista, desde una notificación o desde el home, así que el
  // back vuelve por el historial. Con un link directo (pestaña nueva) no hay a
  // dónde volver: ahí cae en la lista en vez de salir de la app.
  const goBack = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.replace('/transactions');
    }
  };

  const kind = transaction?.kind;
  const term = transaction ? formatTimeDeposit(transaction.lockPeriod) : '';
  const title = !transaction
    ? t('transactions.details.title', 'Transaction details')
    : kind === 'deposit'
      ? t('transactions.kind.deposit', 'Deposit')
      : kind === 'move'
        ? t('transactions.kind.move', 'Transfer to position')
        : transaction.early
          ? t('transactions.kind.withdrawEarly', 'Early withdrawal')
          : t('transactions.kind.withdraw', 'Withdrawal');
  // A transfer keeps the money inside Vaquita: no sign, neutral color.
  const sign = kind === 'withdraw' ? '+' : kind === 'deposit' ? '−' : '';
  const walletLabel = t('transactions.details.wallet', 'Your wallet');
  const savingsLabel = t('transactions.details.savings', 'Savings');
  const positionLabel = t('transactions.details.position', '{{term}} position', { term });
  const from = kind === 'deposit' ? walletLabel : kind === 'move' ? savingsLabel : positionLabel;
  const to = kind === 'move' ? positionLabel : savingsLabel;

  const hashRow = showHash && (
    <DataRow label={t('transactions.details.transactionId', 'Transaction ID')}>
      <span className="inline-flex items-center gap-2">
        <span className="font-mono text-xs">{shortHash(hash)}</span>
        <button type="button" onClick={copyHash} aria-label={t('transactions.details.transactionId', 'Transaction ID')}>
          <FiCopy className="h-4 w-4 text-gray-500 hover:text-black" />
        </button>
      </span>
    </DataRow>
  );

  const statusBlock = (status: TransactionStatus) => (
    <DataBlock>
      <DataRow label={t('transactions.details.status', 'Status')}>
        <span
          className={'inline-block rounded-full border border-b-2 px-2.5 py-0.5 text-xs font-bold ' + STATUS_CLASSES[status]}
        >
          {t(`transactions.status.${status}`)}
        </span>
      </DataRow>
    </DataBlock>
  );

  // mt-auto: explorador y compartir son el pie de la pantalla, no un bloque más
  // de la lista; con poco contenido quedan abajo igual.
  const explorerFooter = explorerUrl && (
    <div className="mt-auto flex gap-2 pt-2">
      <a
        href={explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-black border-b-3 bg-white px-3 py-2 text-xs font-semibold text-black transition hover:-translate-y-0.5"
      >
        <FiExternalLink className="h-3.5 w-3.5 shrink-0" />
        {t('transactions.details.viewOnExplorer', 'View on explorer')}
      </a>
      <button
        type="button"
        onClick={share}
        className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-black border-b-3 bg-primary px-3 py-2 text-xs font-semibold text-black transition hover:-translate-y-0.5 hover:bg-primary/80"
      >
        <FiShare2 className="h-3.5 w-3.5 shrink-0" />
        {t('transactions.details.share', 'Share')}
      </button>
    </div>
  );

  // Un movimiento del historial on-chain que la API no conoce: envíos, ahorros
  // flexibles, insignias. Se cuenta con lo que el registro trae.
  const activityView = (item: ActivityItem) => {
    const { Icon, title: name, subtitle, sign: itemSign, box } = describeActivity(item);
    const failed = item.status === 'FAILED';
    const flexibleLabel = t('dashboard.activity.flexible', 'Flexible savings');
    const lockedLabel = t('dashboard.activity.locked', 'Term savings');
    const other = item.counterparty ?? '';
    const route: [string, string] | null =
      item.kind === 'sent'
        ? [walletLabel, other]
        : item.kind === 'received'
          ? [other, walletLabel]
          : item.kind === 'flexibleIn'
            ? [walletLabel, flexibleLabel]
            : item.kind === 'flexibleOut'
              ? [flexibleLabel, walletLabel]
              : item.kind === 'lockedIn'
                ? [walletLabel, lockedLabel]
                : item.kind === 'lockedOut'
                  ? [lockedLabel, walletLabel]
                  : null;
    return (
      <>
        <div className="flex flex-col items-center gap-1.5 py-7 text-center">
          {item.amount !== null ? (
            <p
              className={
                'text-4xl font-bold tabular-nums leading-tight ' +
                (failed ? 'text-gray-400 line-through' : itemSign === '+' ? 'text-success' : 'text-black')
              }
            >
              {failed ? '' : itemSign === '-' ? '−' : itemSign}
              {formatTokenPrecise(item.amount, 2)}
              {item.asset && <span className="ml-1 text-lg font-semibold">{item.asset}</span>}
            </p>
          ) : (
            <span className={`flex h-14 w-14 items-center justify-center rounded-xl border border-black border-b-2 text-black ${box}`}>
              <Icon className="h-6 w-6" />
            </span>
          )}
          <p className="text-sm text-gray-600">{name}</p>
          {!route && subtitle !== name && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>

        {route && (
          <DataBlock>
            <DataRow label={t('transactions.details.from', 'From')}>{route[0]}</DataRow>
            <DataRow label={t('transactions.details.to', 'To')}>{route[1]}</DataRow>
          </DataBlock>
        )}

        <DataBlock>
          {item.amount !== null && (
            <DataRow label={t('transactions.details.amount', 'Transaction amount')}>
              {formatTokenPrecise(item.amount, 2)} {item.asset}
            </DataRow>
          )}
          {cryptoMode && item.fee && (
            <DataRow label={t('transactions.details.networkFee', 'Network fee')}>
              {item.fee.amount} {item.fee.unit}
            </DataRow>
          )}
          {hashRow}
          <DataRow label={t('transactions.details.time', 'Transaction time')}>
            {formatTransactionTime(item.timestamp, i18n.language)}
          </DataRow>
        </DataBlock>

        {statusBlock(activityStatus(item.status))}

        {explorerFooter}
      </>
    );
  };

  const content = (
    <WithHydrated fallback={<DetailsSkeleton />}>
      {loading ? (
        <DetailsSkeleton />
      ) : !transaction && activityItem ? (
        activityView(activityItem)
      ) : !transaction ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-black border-b-2 bg-white px-4 py-10 text-center">
          <p className="text-sm font-semibold text-black">{t('transactions.details.notFound', 'Transaction not found')}</p>
        </div>
      ) : (
        <>
          {/* El monto es el dato principal de la pantalla: va suelto, con aire
                arriba y abajo, para que se lea antes que los bloques de datos. */}
          <div className="flex flex-col items-center gap-1.5 py-7 text-center">
            <p
              className={
                'text-4xl font-bold tabular-nums leading-tight ' +
                (transaction.status === 'failed'
                  ? 'text-gray-400 line-through'
                  : kind === 'withdraw'
                    ? 'text-success'
                    : 'text-black')
              }
            >
              {transaction.status === 'failed' ? '' : sign}
              {formatTokenPrecise(transaction.amount, 2)}
              <span className="ml-1 text-lg font-semibold">{transaction.tokenSymbol}</span>
            </p>
            <p className="text-sm text-gray-600">{title}</p>
          </div>

          <DataBlock>
            <DataRow label={t('transactions.details.from', 'From')}>{from}</DataRow>
            <DataRow label={t('transactions.details.to', 'To')}>{to}</DataRow>
            <DataRow label={t('transactions.details.lockPeriod', 'Lock period')}>
              {formatTimeDeposit(transaction.lockPeriod)}
            </DataRow>
          </DataBlock>

          <DataBlock>
            <DataRow label={t('transactions.details.amount', 'Transaction amount')}>
              {formatTokenPrecise(transaction.amount, 2)} {transaction.tokenSymbol}
            </DataRow>
            {kind === 'withdraw' && (
              <DataRow label={t('transactions.details.rewards', 'Rewards')}>
                <span className={transaction.early ? 'text-gray-400' : 'text-success'}>
                  {transaction.early
                    ? t('transactions.details.forfeited', 'Forfeited')
                    : `+${formatTokenPrecise(transaction.interest, 2)} ${transaction.tokenSymbol}`}
                </span>
              </DataRow>
            )}
            {hashRow}
            <DataRow label={t('transactions.details.time', 'Transaction time')}>
              {formatTransactionTime(transaction.timestamp, i18n.language)}
            </DataRow>
          </DataBlock>

          {statusBlock(transaction.status)}

          <div className="overflow-hidden rounded-lg border border-black border-b-2 bg-white">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="flex w-full items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-[#FFF7E6]"
            >
              <span className="text-sm font-bold text-black">{t('transactions.details.statusHistory', 'Status history')}</span>
              <FiChevronDown className={'h-4 w-4 text-black transition-transform ' + (showHistory ? 'rotate-180' : '')} />
            </button>
            {showHistory && (
              <ul className="divide-y divide-gray-200 border-t border-gray-200">
                {transaction.history.map((entry) => (
                  <li key={entry.key} className="flex items-start justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-black">{t(`transactions.history.${entry.key}`)}</p>
                      <p className="text-xs text-gray-500">{formatTransactionTime(entry.timestamp, i18n.language)}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-600">
                      {formatTokenPrecise(transaction.amount, 2)} {transaction.tokenSymbol}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {explorerFooter}
        </>
      )}
    </WithHydrated>
  );

  return (
    <PageLayout
      title={t('transactions.details.title', 'Transaction details')}
      onBack={goBack}
      headerGap="gap-2"
      contentGap="gap-3"
      // flex-1: el contenido ocupa el alto disponible para que el mt-auto de los
      // botones los empuje al fondo de la pantalla; y con explorador/compartir
      // haciendo de pie, el aire de abajo es el justo para despegarlos del borde.
      contentClassName="flex-1"
      bottomPadding="pb-5"
    >
      {content}
    </PageLayout>
  );
}

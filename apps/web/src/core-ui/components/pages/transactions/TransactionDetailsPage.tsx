'use client';

import { addSuccessToast, PageLayout, WithHydrated, formatTransactionTime } from '@/core-ui/components/molecules';
import { formatTimeDeposit } from '@/core-ui/helpers';
import { AppTransaction, buildTransactions, TransactionStatus } from '@/core-ui/helpers/transactions';
import { useDepositsComplete } from '@/core-ui/hooks';
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
    <div className="flex items-start justify-between gap-3 px-4 py-3">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm font-semibold text-black text-right min-w-0">{children}</span>
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

export function TransactionDetailsPage({ transactionId }: { transactionId: string }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { walletAddress, network } = useConfigStore();
  const { data, isLoading } = useDepositsComplete(walletAddress);
  const [showHistory, setShowHistory] = useState(true);

  const transaction: AppTransaction | undefined = useMemo(
    () => buildTransactions(data?.deposits ?? []).find((item) => item.id === transactionId),
    [data, transactionId],
  );

  const explorerUrl =
    transaction?.transactionHash ? stellarExpertTxUrl(transaction.transactionHash, network?.type) : '';

  const copyHash = async () => {
    if (!transaction?.transactionHash) return;
    await navigator.clipboard.writeText(transaction.transactionHash);
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

  const isDeposit = transaction?.kind === 'deposit';
  const title = !transaction
    ? t('transactions.details.title', 'Transaction details')
    : isDeposit
      ? t('transactions.kind.deposit', 'Deposit')
      : transaction.early
        ? t('transactions.kind.withdrawEarly', 'Early withdrawal')
        : t('transactions.kind.withdraw', 'Withdrawal');

  return (
    <PageLayout
      title={t('transactions.details.title', 'Transaction details')}
      onBack={() => router.back()}
      headerGap="gap-3"
    >
      <WithHydrated>
        {isLoading && !data ? (
          <DetailsSkeleton />
        ) : !transaction ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-black border-b-2 bg-white px-4 py-10 text-center">
            <p className="text-sm font-semibold text-black">
              {t('transactions.details.notFound', 'Transaction not found')}
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center gap-1 py-2 text-center">
              <p
                className={
                  'text-4xl font-bold tabular-nums leading-tight ' +
                  (transaction.status === 'failed'
                    ? 'text-gray-400 line-through'
                    : isDeposit
                      ? 'text-black'
                      : 'text-success')
                }
              >
                {transaction.status === 'failed' ? '' : isDeposit ? '−' : '+'}
                {transaction.amount.toFixed(2)}
                <span className="ml-1 text-lg font-semibold">{transaction.tokenSymbol}</span>
              </p>
              <p className="text-sm text-gray-600">{title}</p>
            </div>

            <DataBlock>
              <DataRow label={t('transactions.details.from', 'From')}>
                {isDeposit ? t('transactions.details.wallet', 'Your wallet') : t('transactions.details.savings', 'Savings')}
              </DataRow>
              <DataRow label={t('transactions.details.to', 'To')}>
                {isDeposit ? t('transactions.details.savings', 'Savings') : t('transactions.details.wallet', 'Your wallet')}
              </DataRow>
              <DataRow label={t('transactions.details.lockPeriod', 'Lock period')}>
                {formatTimeDeposit(transaction.lockPeriod)}
              </DataRow>
            </DataBlock>

            <DataBlock>
              <DataRow label={t('transactions.details.amount', 'Transaction amount')}>
                {transaction.amount.toFixed(2)} {transaction.tokenSymbol}
              </DataRow>
              {!isDeposit && (
                <DataRow label={t('transactions.details.rewards', 'Rewards')}>
                  <span className={transaction.early ? 'text-gray-400' : 'text-success'}>
                    {transaction.early
                      ? t('transactions.details.forfeited', 'Forfeited')
                      : `+${transaction.interest.toFixed(2)} ${transaction.tokenSymbol}`}
                  </span>
                </DataRow>
              )}
              {transaction.transactionHash && (
                <DataRow label={t('transactions.details.transactionId', 'Transaction ID')}>
                  <span className="inline-flex items-center gap-2">
                    <span className="font-mono text-xs">{shortHash(transaction.transactionHash)}</span>
                    <button type="button" onClick={copyHash} aria-label={t('transactions.details.transactionId', 'Transaction ID')}>
                      <FiCopy className="h-4 w-4 text-gray-500 hover:text-black" />
                    </button>
                  </span>
                </DataRow>
              )}
              <DataRow label={t('transactions.details.time', 'Transaction time')}>
                {formatTransactionTime(transaction.timestamp, i18n.language)}
              </DataRow>
            </DataBlock>

            <DataBlock>
              <DataRow label={t('transactions.details.status', 'Status')}>
                <span
                  className={
                    'inline-block rounded-full border border-b-2 px-2.5 py-0.5 text-xs font-bold ' +
                    STATUS_CLASSES[transaction.status]
                  }
                >
                  {t(`transactions.status.${transaction.status}`)}
                </span>
              </DataRow>
            </DataBlock>

            <div className="overflow-hidden rounded-lg border border-black border-b-2 bg-white">
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[#FFF7E6]"
              >
                <span className="text-sm font-bold text-black">
                  {t('transactions.details.statusHistory', 'Status history')}
                </span>
                <FiChevronDown className={'h-4 w-4 text-black transition-transform ' + (showHistory ? 'rotate-180' : '')} />
              </button>
              {showHistory && (
                <ul className="divide-y divide-gray-200 border-t border-gray-200">
                  {transaction.history.map((entry) => (
                    <li key={entry.key} className="flex items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-black">
                          {t(`transactions.history.${entry.key}`)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatTransactionTime(entry.timestamp, i18n.language)}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-600">
                        {transaction.amount.toFixed(2)} {transaction.tokenSymbol}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {explorerUrl && (
              <div className="flex gap-2">
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-center justify-center gap-2 rounded-md border border-black border-b-3 bg-white px-5 py-2 text-sm font-semibold text-black transition hover:-translate-y-0.5"
                >
                  <FiExternalLink className="h-4 w-4" />
                  {t('transactions.details.viewOnExplorer', 'View on explorer')}
                </a>
                <button
                  type="button"
                  onClick={share}
                  className="flex flex-1 items-center justify-center gap-2 rounded-md border border-black border-b-3 bg-primary px-5 py-2 text-sm font-semibold text-black transition hover:-translate-y-0.5 hover:bg-primary/80"
                >
                  <FiShare2 className="h-4 w-4" />
                  {t('transactions.details.share', 'Share')}
                </button>
              </div>
            )}
          </>
        )}
      </WithHydrated>
    </PageLayout>
  );
}

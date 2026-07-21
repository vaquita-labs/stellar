'use client';

import { CircleIconButton } from '@/core-ui/components/molecules/CircleIconButton';
import {
  PageLayout,
  TransactionList,
  TransactionMonthCard,
  TransactionRow,
  TransactionRowSkeleton,
  WithHydrated,
} from '@/core-ui/components/molecules';
import {
  buildTransactions,
  EMPTY_TRANSACTION_FILTERS,
  filterTransactions,
  groupTransactionsByMonth,
  hasActiveFilters,
  TransactionFilters,
} from '@/core-ui/helpers/transactions';
import { useDepositsComplete } from '@/core-ui/hooks';
import { useConfigStore } from '@/core-ui/stores';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiFilter, FiX } from 'react-icons/fi';
import { TransactionFiltersModal } from './TransactionFiltersModal';

/** Chip de un filtro aplicado, con × para quitarlo (como en el mock). */
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-black border-b-2 bg-primary px-3 py-1 text-xs font-bold text-black">
      {label}
      <button type="button" onClick={onRemove} aria-label={label} className="text-black/60 hover:text-black">
        <FiX className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

export function TransactionsPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { walletAddress } = useConfigStore();
  const { data, isLoading } = useDepositsComplete(walletAddress);

  const [filters, setFilters] = useState<TransactionFilters>(EMPTY_TRANSACTION_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const transactions = useMemo(() => buildTransactions(data?.deposits ?? []), [data]);
  const groups = useMemo(
    () => groupTransactionsByMonth(filterTransactions(transactions, filters)),
    [transactions, filters],
  );

  const formatDate = (timestamp: number) =>
    new Date(timestamp).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });

  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (filters.startDate !== null) {
    chips.push({
      key: 'start',
      label: t('transactions.chips.from', 'From {{date}}', { date: formatDate(filters.startDate) }),
      onRemove: () => setFilters((prev) => ({ ...prev, startDate: null })),
    });
  }
  if (filters.endDate !== null) {
    chips.push({
      key: 'end',
      label: t('transactions.chips.to', 'To {{date}}', { date: formatDate(filters.endDate) }),
      onRemove: () => setFilters((prev) => ({ ...prev, endDate: null })),
    });
  }
  if (filters.kind !== 'all') {
    chips.push({
      key: 'kind',
      label: t(`transactions.filters.kinds.${filters.kind}`),
      onRemove: () => setFilters((prev) => ({ ...prev, kind: 'all' })),
    });
  }
  if (filters.status !== 'all') {
    chips.push({
      key: 'status',
      label: t(`transactions.filters.statuses.${filters.status}`),
      onRemove: () => setFilters((prev) => ({ ...prev, status: 'all' })),
    });
  }

  // Solo la primera carga muestra placeholders; con la lista ya cacheada
  // (staleTime Infinity + localStorage) la pantalla entra pintada.
  const showSkeleton = isLoading && !data;

  return (
    <PageLayout
      title={t('transactions.title', 'Transactions')}
      backHref="/home"
      headerGap="gap-3"
      rightSlot={
        <CircleIconButton
          variant={hasActiveFilters(filters) ? 'primary' : 'white'}
          ariaLabel={t('transactions.filters.title', 'Filter')}
          onClick={() => setFiltersOpen(true)}
          icon={<FiFilter className="h-4 w-4" />}
        />
      }
    >
      <WithHydrated>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <FilterChip key={chip.key} label={chip.label} onRemove={chip.onRemove} />
            ))}
          </div>
        )}

        {showSkeleton ? (
          <TransactionMonthCard label="">
            <TransactionList align="grouped">
              {Array.from({ length: 6 }).map((_, i) => (
                <TransactionRowSkeleton key={i} />
              ))}
            </TransactionList>
          </TransactionMonthCard>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-black border-b-2 bg-white px-4 py-10 text-center">
            <p className="text-sm font-semibold text-black">
              {t('transactions.empty', 'No transactions yet')}
            </p>
            <p className="text-xs text-gray-600">
              {hasActiveFilters(filters)
                ? t('transactions.emptyFiltered', 'Try changing the filters to see more.')
                : t('transactions.emptyHint', 'Your deposits and withdrawals will show up here.')}
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <TransactionMonthCard
              key={group.key}
              label={new Date(group.timestamp).toLocaleDateString(i18n.language, {
                month: 'long',
                year: 'numeric',
              })}
            >
              <TransactionList align="grouped">
                {group.items.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    onPress={() => router.push(`/transactions/${transaction.id}`)}
                  />
                ))}
              </TransactionList>
            </TransactionMonthCard>
          ))
        )}
      </WithHydrated>

      <TransactionFiltersModal
        open={filtersOpen}
        onOpenChange={() => setFiltersOpen(false)}
        filters={filters}
        onApply={setFilters}
      />
    </PageLayout>
  );
}

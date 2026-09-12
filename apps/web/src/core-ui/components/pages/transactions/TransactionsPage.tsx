'use client';

import { CircleIconButton } from '@/core-ui/components/molecules/CircleIconButton';
import {
  FilterChip,
  multiSelectChips,
  PageLayout,
  TransactionList,
  TransactionMonthCard,
  TransactionRow,
  TransactionRowSkeleton,
  WithHydrated,
} from '@/core-ui/components/molecules';
import {
  buildTransactions,
  DEFAULT_TRANSACTION_FILTERS,
  filterTransactions,
  groupTransactionsByMonth,
  hasActiveFilters,
  TRANSACTION_KINDS,
  TRANSACTION_STATUSES,
  TransactionFilters,
} from '@/core-ui/helpers/transactions';
import { useDepositsComplete } from '@/core-ui/hooks';
import { useConfigStore } from '@/core-ui/stores';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiFilter } from 'react-icons/fi';
import { TransactionDetailsOverlay } from './TransactionDetailsOverlay';
import { TransactionFiltersModal } from './TransactionFiltersModal';

/** Placeholder de la lista: se usa tanto en la primera carga de datos como
 *  mientras hidrata, para no cortar la navegación con el loader de la vaquita. */
function ListSkeleton() {
  return (
    <TransactionMonthCard label="">
      <TransactionList align="grouped">
        {Array.from({ length: 6 }).map((_, i) => (
          <TransactionRowSkeleton key={i} />
        ))}
      </TransactionList>
    </TransactionMonthCard>
  );
}

export function TransactionsPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  // El detalle vive en `?tx=` de esta misma ruta, no en /transactions/[id]: así
  // la lista no se desmonta y el panel puede entrar y salir animado.
  const openTransactionId = useSearchParams().get('tx');
  const { walletAddress } = useConfigStore();
  const { data, isLoading } = useDepositsComplete(walletAddress);

  const [filters, setFilters] = useState<TransactionFilters>(DEFAULT_TRANSACTION_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // ¿Se entró directo al detalle (link compartido o refresh con `?tx=`)? Ahí el
  // panel se pinta ya puesto, sin deslizarse sobre una lista que nunca se vio.
  const [deepLinked] = useState(() => openTransactionId !== null);

  const transactions = useMemo(() => buildTransactions(data?.deposits ?? []), [data]);
  const groups = useMemo(() => groupTransactionsByMonth(filterTransactions(transactions, filters)), [transactions, filters]);

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
  // Tipo y estado son multi-selección: sin chips mientras está todo marcado.
  chips.push(
    ...multiSelectChips(
      filters.kinds,
      TRANSACTION_KINDS,
      (kind) => t(`transactions.filters.kinds.${kind}`),
      (kinds) => setFilters((prev) => ({ ...prev, kinds })),
    ),
    ...multiSelectChips(
      filters.statuses,
      TRANSACTION_STATUSES,
      (status) => t(`transactions.filters.statuses.${status}`),
      (statuses) => setFilters((prev) => ({ ...prev, statuses })),
    ),
  );

  // Solo la primera carga muestra placeholders; con la lista ya cacheada
  // (staleTime Infinity + localStorage) la pantalla entra pintada.
  const showSkeleton = isLoading && !data;

  return (
    <div className="relative h-full">
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
        <WithHydrated fallback={<ListSkeleton />}>
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {chips.map((chip) => (
                <FilterChip key={chip.key} label={chip.label} onRemove={chip.onRemove} />
              ))}
            </div>
          )}

          {showSkeleton ? (
            <ListSkeleton />
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-black border-b-2 bg-white px-4 py-10 text-center">
              <p className="text-sm font-semibold text-black">{t('transactions.empty', 'No transactions yet')}</p>
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
                      onPress={() => router.push(`/transactions?tx=${transaction.id}`, { scroll: false })}
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

      {/* Cerrar quita `?tx=` en vez de hacer `back()`: el panel sale animado
          dejando la lista debajo, y con un link compartido se aterriza en la
          lista en vez de salir de la app. */}
      <TransactionDetailsOverlay
        transactionId={openTransactionId}
        animated={!deepLinked}
        onClose={() => router.replace('/transactions', { scroll: false })}
      />
    </div>
  );
}

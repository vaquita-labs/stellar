'use client';

import { CircleIconButton } from '@/core-ui/components/molecules/CircleIconButton';
import {
  ActivityRow,
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
  buildMovements,
  buildTransactions,
  DEFAULT_TRANSACTION_FILTERS,
  filterMovements,
  groupMovementsByMonth,
  hasActiveFilters,
  TRANSACTION_KINDS,
  TRANSACTION_STATUSES,
  TransactionFilters,
} from '@/core-ui/helpers/transactions';
import { useDepositsComplete, useGoBack, useWalletActivity } from '@/core-ui/hooks';
import { useConfigStore, useTransactionFiltersStore } from '@/core-ui/stores';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiFilter } from 'react-icons/fi';
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
  const { walletAddress } = useConfigStore();
  const { data, isLoading } = useDepositsComplete(walletAddress);
  // Everything else the wallet did on chain: payments, flexible savings, badges.
  const activity = useWalletActivity();

  // El detalle es otra página, así que abrirlo desmonta esta lista: los filtros
  // se dejan en el store al salir y se retoman al volver (ver el store).
  const [filters, setFilters] = useState<TransactionFilters>(
    () => useTransactionFiltersStore.getState().held ?? DEFAULT_TRANSACTION_FILTERS,
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Se sueltan una vez tomados (en un efecto, no en el inicializador, que tiene
  // que ser puro): valen para la vuelta del detalle y para nada más.
  useEffect(() => {
    useTransactionFiltersStore.getState().release();
  }, []);

  const openTransaction = (transactionId: string) => {
    useTransactionFiltersStore.getState().hold(filters);
    router.push(`/transactions/${transactionId}`);
  };

  // Se llega desde el home, una notificación o el detalle de un movimiento: el
  // back vuelve a donde se estaba.
  const goBack = useGoBack('/home');

  const movements = useMemo(
    () => buildMovements(buildTransactions(data?.deposits ?? []), activity.data ?? []),
    [data, activity.data],
  );
  const groups = useMemo(() => groupMovementsByMonth(filterMovements(movements, filters)), [movements, filters]);

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
  const showSkeleton = (isLoading && !data) || (activity.isLoading && !activity.data);

  return (
    <PageLayout
      title={t('transactions.title', 'Transactions')}
      onBack={goBack}
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
                {group.items.map((movement) =>
                  movement.source === 'app' ? (
                    <TransactionRow
                      key={movement.id}
                      transaction={movement.transaction}
                      onPress={() => openTransaction(movement.id)}
                    />
                  ) : (
                    <ActivityRow
                      key={movement.id}
                      item={movement.activity}
                      onPress={() => openTransaction(movement.id)}
                    />
                  ),
                )}
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

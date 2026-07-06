import { DepositResponseDTO, DepositWithdrawalState } from '@/core-ui/types';
import { ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DepositListTab } from './DepositListTabs';

export type DepositSortKey = 'newest' | 'oldest' | 'amount' | 'unlock';
type ActiveFilter = 'all' | 'ready' | 'locked';
type WithdrawnFilter = 'all' | 'onTime' | 'early';

// "Ahora" corregido con el timestamp del servidor: la lista se cachea
// (staleTime Infinity), así que el estado bloqueado se recalcula del tiempo
// transcurrido en el cliente desde el fetch (mismo criterio que VaquitaDepositCard).
const depositNow = (deposit: DepositResponseDTO) =>
  deposit.serverTimestamp && deposit.fetchedAtTimestamp
    ? deposit.serverTimestamp + (Date.now() - deposit.fetchedAtTimestamp)
    : Date.now();

export const isDepositLocked = (deposit: DepositResponseDTO) =>
  deposit.inLockPeriod && deposit.createdTimestamp + deposit.lockPeriod > depositNow(deposit);

const sortDeposits = (deposits: DepositResponseDTO[], sort: DepositSortKey) => {
  const sorted = [...deposits];
  switch (sort) {
    case 'oldest':
      return sorted.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    case 'amount':
      return sorted.sort((a, b) => b.amount - a.amount);
    case 'unlock':
      return sorted.sort((a, b) => a.createdTimestamp + a.lockPeriod - (b.createdTimestamp + b.lockPeriod));
    case 'newest':
    default:
      return sorted.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
  }
};

const FilterChip = ({
  active,
  label,
  count,
  onPress,
}: {
  active: boolean;
  label: string;
  count: number;
  onPress: () => void;
}) => (
  <button
    type="button"
    onClick={onPress}
    className={
      'inline-flex items-center gap-1 px-2.5 py-1 rounded-[6px] text-xs font-bold border border-black border-b-2 transition-colors ' +
      (active ? 'bg-primary text-black' : 'bg-white text-default-500 hover:text-black hover:bg-default-100')
    }
  >
    <span>{label}</span>
    <span className={'tabular-nums ' + (active ? 'text-black/60' : 'text-default-400')}>{count}</span>
  </button>
);

/**
 * Fila de controles de la lista de depósitos: chips de filtro por estado
 * (según el tab) + selector de orden. Compartida entre VaquitasListModal y
 * BankAPYModal vía useDepositListControls.
 */
const DepositListControlsRow = ({
  tab,
  activeDeposits,
  withdrawnDeposits,
  activeFilter,
  onActiveFilterChange,
  withdrawnFilter,
  onWithdrawnFilterChange,
  sort,
  onSortChange,
}: {
  tab: DepositListTab;
  activeDeposits: DepositResponseDTO[];
  withdrawnDeposits: DepositResponseDTO[];
  activeFilter: ActiveFilter;
  onActiveFilterChange: (f: ActiveFilter) => void;
  withdrawnFilter: WithdrawnFilter;
  onWithdrawnFilterChange: (f: WithdrawnFilter) => void;
  sort: DepositSortKey;
  onSortChange: (s: DepositSortKey) => void;
}) => {
  const { t } = useTranslation();
  const [sortOpen, setSortOpen] = useState(false);

  const lockedCount = activeDeposits.filter(isDepositLocked).length;
  const onTimeCount = withdrawnDeposits.filter((d) => d.state === DepositWithdrawalState.WITHDRAW_SUCCESS).length;

  const sortOptions: { key: DepositSortKey; label: string }[] = [
    { key: 'newest', label: t('deposit.list.sortNewest', 'Newest first') },
    { key: 'oldest', label: t('deposit.list.sortOldest', 'Oldest first') },
    { key: 'amount', label: t('deposit.list.sortAmount', 'Highest amount') },
    // Ordenar por desbloqueo solo tiene sentido en depósitos activos.
    ...(tab === 'active' ? [{ key: 'unlock' as const, label: t('deposit.list.sortUnlock', 'Unlocks soonest') }] : []),
  ];
  const currentSort = sortOptions.find((o) => o.key === sort) ?? sortOptions[0];

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {tab === 'active' ? (
        <>
          <FilterChip
            active={activeFilter === 'all'}
            label={t('deposit.list.filterAll', 'All')}
            count={activeDeposits.length}
            onPress={() => onActiveFilterChange('all')}
          />
          <FilterChip
            active={activeFilter === 'ready'}
            label={t('home.depositCard.ready', 'Ready')}
            count={activeDeposits.length - lockedCount}
            onPress={() => onActiveFilterChange('ready')}
          />
          <FilterChip
            active={activeFilter === 'locked'}
            label={t('home.depositCard.locked', 'Locked')}
            count={lockedCount}
            onPress={() => onActiveFilterChange('locked')}
          />
        </>
      ) : (
        <>
          <FilterChip
            active={withdrawnFilter === 'all'}
            label={t('deposit.list.filterAll', 'All')}
            count={withdrawnDeposits.length}
            onPress={() => onWithdrawnFilterChange('all')}
          />
          <FilterChip
            active={withdrawnFilter === 'onTime'}
            label={t('deposit.list.filterOnTime', 'On time')}
            count={onTimeCount}
            onPress={() => onWithdrawnFilterChange('onTime')}
          />
          <FilterChip
            active={withdrawnFilter === 'early'}
            label={t('deposit.list.filterEarly', 'Early')}
            count={withdrawnDeposits.length - onTimeCount}
            onPress={() => onWithdrawnFilterChange('early')}
          />
        </>
      )}

      <div className="relative ml-auto">
        <button
          type="button"
          onClick={() => setSortOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-xs font-bold border border-black border-b-2 bg-white text-black hover:bg-default-100 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M6 12h12M10 18h4" />
          </svg>
          <span>{currentSort.label}</span>
          <span className={'text-[8px] transition-transform ' + (sortOpen ? 'rotate-180' : '')}>▾</span>
        </button>
        {sortOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
            <div className="absolute right-0 top-full mt-1 z-20 min-w-44 bg-white border border-black border-b-2 rounded-[6px] overflow-hidden">
              {sortOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => {
                    onSortChange(option.key);
                    setSortOpen(false);
                  }}
                  className={
                    'w-full flex items-center justify-between gap-2 text-left px-3 py-2 text-xs font-semibold transition-colors ' +
                    (option.key === sort ? 'bg-primary/15 text-black' : 'text-default-500 hover:bg-default-100 hover:text-black')
                  }
                >
                  <span>{option.label}</span>
                  {option.key === sort && <span className="text-primary">✓</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/**
 * Estado de filtros/orden de la lista de depósitos + listas ya filtradas y
 * ordenadas. Devuelve la fila de controles lista para renderizar bajo los tabs.
 */
export const useDepositListControls = ({
  tab,
  activeDeposits,
  withdrawnDeposits,
}: {
  tab: DepositListTab;
  activeDeposits: DepositResponseDTO[];
  withdrawnDeposits: DepositResponseDTO[];
}): {
  controls: ReactNode;
  filteredActiveDeposits: DepositResponseDTO[];
  filteredWithdrawnDeposits: DepositResponseDTO[];
} => {
  const [sort, setSort] = useState<DepositSortKey>('newest');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [withdrawnFilter, setWithdrawnFilter] = useState<WithdrawnFilter>('all');

  // "Unlocks soonest" no existe en el tab de retirados: ahí cae a "newest".
  const effectiveSort = tab === 'withdrawn' && sort === 'unlock' ? 'newest' : sort;

  const filteredActiveDeposits = useMemo(() => {
    const filtered =
      activeFilter === 'all'
        ? activeDeposits
        : activeDeposits.filter((d) => isDepositLocked(d) === (activeFilter === 'locked'));
    return sortDeposits(filtered, effectiveSort);
  }, [activeDeposits, activeFilter, effectiveSort]);

  const filteredWithdrawnDeposits = useMemo(() => {
    const filtered =
      withdrawnFilter === 'all'
        ? withdrawnDeposits
        : withdrawnDeposits.filter(
            (d) =>
              (d.state === DepositWithdrawalState.WITHDRAW_SUCCESS_EARLY) === (withdrawnFilter === 'early'),
          );
    return sortDeposits(filtered, effectiveSort);
  }, [withdrawnDeposits, withdrawnFilter, effectiveSort]);

  const controls = (
    <DepositListControlsRow
      tab={tab}
      activeDeposits={activeDeposits}
      withdrawnDeposits={withdrawnDeposits}
      activeFilter={activeFilter}
      onActiveFilterChange={setActiveFilter}
      withdrawnFilter={withdrawnFilter}
      onWithdrawnFilterChange={setWithdrawnFilter}
      sort={effectiveSort}
      onSortChange={setSort}
    />
  );

  return { controls, filteredActiveDeposits, filteredWithdrawnDeposits };
};

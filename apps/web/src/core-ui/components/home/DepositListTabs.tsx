import { useTranslation } from 'react-i18next';

export type DepositListTab = 'active' | 'withdrawn';

const TabButton = ({
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
      'flex-1 flex items-center justify-center gap-2 rounded-[6px] py-2 text-sm font-bold transition-colors ' +
      (active ? 'bg-primary text-black' : 'text-default-500 hover:text-black')
    }
  >
    <span>{label}</span>
    <span
      className={
        'min-w-5 px-1.5 rounded-full text-xs font-bold ' +
        (active ? 'bg-black/15 text-black' : 'bg-black/10 text-default-500')
      }
    >
      {count}
    </span>
  </button>
);

/**
 * Segmented control Activos/Retirados con la UI crema/negro de los modales de
 * depósitos. Compartido entre VaquitasListModal y BankAPYModal.
 */
export const DepositListTabs = ({
  tab,
  onTabChange,
  activeCount,
  withdrawnCount,
}: {
  tab: DepositListTab;
  onTabChange: (tab: DepositListTab) => void;
  activeCount: number;
  withdrawnCount: number;
}) => {
  const { t } = useTranslation();
  return (
    <div className="flex gap-1 p-1 bg-white border border-black border-b-2 rounded-md">
      <TabButton
        active={tab === 'active'}
        label={t('deposit.list.tabActive', 'Active')}
        count={activeCount}
        onPress={() => onTabChange('active')}
      />
      <TabButton
        active={tab === 'withdrawn'}
        label={t('deposit.list.tabWithdrawn', 'Withdrawn')}
        count={withdrawnCount}
        onPress={() => onTabChange('withdrawn')}
      />
    </div>
  );
};

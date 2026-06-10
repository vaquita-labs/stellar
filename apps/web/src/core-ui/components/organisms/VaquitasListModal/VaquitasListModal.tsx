'use client';

import { DepositListTab, DepositListTabs } from '@/core-ui/components/home/DepositListTabs';
import { VaquitaDepositCard } from '@/core-ui/components/home/VaquitaDepositCard';
import { WithdrawnDepositCard } from '@/core-ui/components/home/WithdrawnDepositCard';
import { getDepositsData } from '@/core-ui/helpers/deposits';
import { Spinner } from '@heroui/react';
import Image from 'next/image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDeposit, useDepositsComplete } from '../../../hooks';
import { useConfigStore } from '../../../stores';
import { DepositResponseDTO } from '../../../types';
import { AppModal } from '../../molecules/AppModal';
import { useVaquitaDetail } from '../VaquitaModal';
import { VaquitasListModalProps } from './types';

export function VaquitasListModal({ open, onOpenChange }: VaquitasListModalProps) {
  const { t } = useTranslation();
  const { walletAddress } = useConfigStore();
  const { data: depositsData, isLoading } = useDepositsComplete(walletAddress);
  const [selectedVaquita, setSelectedVaquita] = useState<DepositResponseDTO | null>(null);
  const [tab, setTab] = useState<DepositListTab>('active');

  const { deposits, activeDeposits, withdrawnDeposits } = getDepositsData(depositsData?.deposits ?? []);

  // Detalle dentro del MISMO modal. La lista ya trae la vaquita completa, así
  // que el detalle se pinta al instante con esos datos (sin spinner). Dejamos
  // useDeposit en segundo plano solo para refrescar el contador en vivo.
  const inDetail = !!selectedVaquita;
  const { data: fullDeposit } = useDeposit(selectedVaquita?.id ?? 0);
  const backToList = () => setSelectedVaquita(null);
  const detail = useVaquitaDetail({
    vaquita: inDetail ? fullDeposit ?? selectedVaquita : null,
    onClose: backToList,
    isLeaderboard: false,
  });

  const detailReady = inDetail && detail.ready;

  const renderList = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center items-center py-8">
          <Spinner size="lg" color="accent" />
        </div>
      );
    }
    if (deposits.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Image src="/no_data.svg" alt={t('deposit.list.noData', 'No data')} width={120} height={120} />
          <p className="text-gray-500 mt-4">{t('deposit.list.noDepositsYet', 'No deposits yet')}</p>
          <p className="text-gray-400 text-sm">{t('deposit.list.makeFirstDeposit', 'Make your first deposit to get started')}</p>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4">
        <DepositListTabs
          tab={tab}
          onTabChange={setTab}
          activeCount={activeDeposits.length}
          withdrawnCount={withdrawnDeposits.length}
        />

        {tab === 'active' ? (
          <div className="gap-3 flex flex-col mb-4">
            {activeDeposits.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Image src="/no_data.svg" alt={t('deposit.list.noData', 'No data')} width={100} height={100} />
                <p className="text-gray-500 mt-4">{t('deposit.list.noActiveDeposits', 'No active deposits')}</p>
              </div>
            ) : (
              activeDeposits.map((deposit) => (
                <VaquitaDepositCard
                  key={deposit.id}
                  deposit={deposit}
                  onPress={() => setSelectedVaquita(deposit)}
                />
              ))
            )}
          </div>
        ) : (
          <div className="gap-2 flex flex-col mb-4">
            {withdrawnDeposits.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Image src="/no_data.svg" alt={t('deposit.list.noData', 'No data')} width={100} height={100} />
                <p className="text-gray-500 mt-4">{t('deposit.list.noWithdrawnDeposits', 'No withdrawn deposits')}</p>
              </div>
            ) : (
              withdrawnDeposits.map((deposit) => (
                <WithdrawnDepositCard
                  key={deposit.id}
                  deposit={deposit}
                  onPress={() => setSelectedVaquita(deposit)}
                />
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      isDismissable={!detail.loading}
      onBack={inDetail && !detail.loading ? backToList : undefined}
      title={inDetail ? detail.title : t('deposit.list.title', 'Your deposits')}
      // titleIcon={inDetail ? undefined : '/icons/deposits.svg'}
      titleIconAlt={inDetail ? 'deposit' : 'deposits'}
      size="lg"
      bodyClassName={inDetail ? 'flex flex-col gap-5 pb-6' : undefined}
      footer={detailReady ? detail.footer : undefined}
    >
      {inDetail ? detail.body : renderList()}
    </AppModal>
  );
}

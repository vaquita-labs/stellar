'use client';

import { VaquitaDepositCard } from '@/core-ui/components/home/VaquitaDepositCard';
import { getDepositsData } from '@/core-ui/helpers/deposits';
import { Card, Spinner } from '@heroui/react';
import Image from 'next/image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTimeDeposit } from '../../../helpers';
import { useDeposit, useDepositsComplete } from '../../../hooks';
import { useConfigStore } from '../../../stores';
import { DepositResponseDTO, DepositWithdrawalState } from '../../../types';
import { AppModal } from '../../molecules/AppModal';
import { useVaquitaDetail } from '../VaquitaModal';
import { VaquitasListModalProps } from './types';

const formatAmount = (amount: number, tokenSymbol: string) => {
  return `${amount.toFixed(2)} ${tokenSymbol}`;
};

type TabId = 'active' | 'withdrawn';

export function VaquitasListModal({ open, onOpenChange }: VaquitasListModalProps) {
  const { t } = useTranslation();
  const { walletAddress } = useConfigStore();
  const { data: depositsData, isLoading } = useDepositsComplete(walletAddress);
  const [selectedVaquita, setSelectedVaquita] = useState<DepositResponseDTO | null>(null);
  const [tab, setTab] = useState<TabId>('active');

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
        {/* Segmented control con la misma UI (crema/negro) del resto del modal. */}
        <div className="flex gap-1 p-1 bg-white border border-black border-b-2 rounded-md">
          <button
            type="button"
            onClick={() => setTab('active')}
            className={
              'flex-1 flex items-center justify-center gap-2 rounded-[6px] py-2 text-sm font-bold transition-colors ' +
              (tab === 'active' ? 'bg-primary text-black' : 'text-default-500 hover:text-black')
            }
          >
            <span>{t('deposit.list.tabActive', 'Active')}</span>
            <span
              className={
                'min-w-5 px-1.5 rounded-full text-xs font-bold ' +
                (tab === 'active' ? 'bg-black/15 text-black' : 'bg-black/10 text-default-500')
              }
            >
              {activeDeposits.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab('withdrawn')}
            className={
              'flex-1 flex items-center justify-center gap-2 rounded-[6px] py-2 text-sm font-bold transition-colors ' +
              (tab === 'withdrawn' ? 'bg-primary text-black' : 'text-default-500 hover:text-black')
            }
          >
            <span>{t('deposit.list.tabWithdrawn', 'Withdrawn')}</span>
            <span
              className={
                'min-w-5 px-1.5 rounded-full text-xs font-bold ' +
                (tab === 'withdrawn' ? 'bg-black/15 text-black' : 'bg-black/10 text-default-500')
              }
            >
              {withdrawnDeposits.length}
            </span>
          </button>
        </div>

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
              withdrawnDeposits.map((deposit) => {
                const isEarly = deposit.state === DepositWithdrawalState.WITHDRAW_SUCCESS_EARLY;
                const earnings =
                  (deposit.vaquitaInterest ?? 0) +
                  (deposit.protocolInterest ?? 0) +
                  (deposit.blendInterest ?? 0);
                return (
                  <Card
                    key={deposit.id}
                    onClick={() => setSelectedVaquita(deposit)}
                    className={
                      'border border-black border-b-2 rounded-md cursor-pointer active:translate-y-0.5 transition-all ' +
                      (isEarly ? 'bg-default-100 hover:bg-default-200' : 'bg-success/15 hover:bg-success/25')
                    }
                  >
                    <Card.Content className="px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-black leading-tight truncate">
                          {formatAmount(deposit.amount, deposit.tokenSymbol)}
                        </p>
                        <span
                          className={
                            'shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ' +
                            (isEarly ? 'bg-default-500 text-white' : 'bg-success text-white')
                          }
                        >
                          {isEarly ? t('deposit.list.withdrawnEarlyBadge', 'Withdrawn early') : t('deposit.list.withdrawnBadge', 'Withdrawn')}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">{formatTimeDeposit(deposit.lockPeriod)}</p>
                      <div className="mt-1.5 pt-1.5 border-t border-black/10 flex items-center justify-between">
                        <span className="text-xs text-gray-600">{isEarly ? t('deposit.list.rewardsForfeited', 'Rewards forfeited') : t('deposit.list.earned', 'Earned')}</span>
                        <span
                          className={
                            'text-sm font-bold tabular-nums ' +
                            (isEarly ? 'text-default-500 line-through' : 'text-success')
                          }
                        >
                          {isEarly ? '−' : '+'}
                          {earnings.toFixed(2)} {deposit.tokenSymbol}
                        </span>
                      </div>
                    </Card.Content>
                  </Card>
                );
              })
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

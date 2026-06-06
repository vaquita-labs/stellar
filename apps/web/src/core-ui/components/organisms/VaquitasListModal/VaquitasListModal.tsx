'use client';

import { VaquitaDepositCard } from '@/core-ui/components/home/VaquitaDepositCard';
import { getDepositsData } from '@/core-ui/helpers/deposits';
import { Card, Spinner } from '@heroui/react';
import Image from 'next/image';
import { useState } from 'react';
import { formatTimeDeposit } from '../../../helpers';
import { useDeposit, useDepositsComplete } from '../../../hooks';
import { useConfigStore } from '../../../stores';
import { DepositResponseDTO } from '../../../types';
import { AppModal } from '../../molecules/AppModal';
import { useVaquitaDetail } from '../VaquitaModal';
import { VaquitasListModalProps } from './types';

const formatAmount = (amount: number, tokenSymbol: string) => {
  return `${amount.toFixed(2)} ${tokenSymbol}`;
};

const formatDate = (timestamp: number) => {
  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

type TabId = 'active' | 'withdrawn';

export function VaquitasListModal({ open, onOpenChange }: VaquitasListModalProps) {
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
          <Image src="/no_data.svg" alt="No data" width={120} height={120} />
          <p className="text-gray-500 mt-4">No vaquitas yet</p>
          <p className="text-gray-400 text-sm">Make your first deposit to create a vaquita</p>
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
            <span>Active</span>
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
            <span>Withdrawn</span>
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
                <Image src="/no_data.svg" alt="No data" width={100} height={100} />
                <p className="text-gray-500 mt-4">No active vaquitas</p>
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
                <Image src="/no_data.svg" alt="No data" width={100} height={100} />
                <p className="text-gray-500 mt-4">No withdrawn vaquitas</p>
              </div>
            ) : (
              withdrawnDeposits.map((deposit) => (
                <Card key={deposit.id} className="border border-black border-b-2 bg-white rounded-md">
                  <Card.Content className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Image
                            src="/vaquita_working.jpg"
                            alt="Vaquita"
                            width={40}
                            height={40}
                            className="rounded-full opacity-60"
                          />
                        </div>
                        <div>
                          <p className="font-semibold text-black">
                            {formatAmount(deposit.amount, deposit.tokenSymbol)}
                          </p>
                          <p className="text-sm text-gray-600">{formatTimeDeposit(deposit.lockPeriod)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="inline-block mb-2 px-2 py-0.5 rounded-full bg-default-100 text-default-600 text-xs font-bold">
                          Withdrawn
                        </span>
                        <p className="text-xs text-gray-500">{formatDate(deposit.createdTimestamp)}</p>
                      </div>
                    </div>
                  </Card.Content>
                </Card>
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
      title={inDetail ? detail.title : 'Your deposits'}
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

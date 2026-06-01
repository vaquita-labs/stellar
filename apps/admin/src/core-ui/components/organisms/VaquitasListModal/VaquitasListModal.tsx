'use client';

import { Card, Chip, Spinner, Tab, Tabs } from '@heroui/react';
import Image from 'next/image';
import { useState } from 'react';
import { formatTimeDeposit } from '../../../helpers';
import { useDepositsComplete } from '../../../hooks';
import { useNetworkConfigStore } from '../../../stores';
import { DepositSummaryResponseDTO, DepositWithdrawalState } from '../../../types';
import { AppModal } from '../../molecules/AppModal';
import { VaquitaModal } from '../VaquitaModal';
import { VaquitasListModalProps } from './types';
import { useApyByLockPeriod } from '../../../hooks';
import { getInterestData } from '../../../helpers';

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

export function VaquitasListModal({ open, onOpenChange }: VaquitasListModalProps) {
  const { network, walletAddress, lockPeriod, token } = useNetworkConfigStore();
  const { data, isLoading } = useDepositsComplete(walletAddress);
  const [selectedVaquita, setSelectedVaquita] = useState<DepositSummaryResponseDTO | null>(null);
  const { data: dataApy } = useApyByLockPeriod(lockPeriod, token?.symbol ?? '');

  const deposits = (data?.deposits ?? []).filter((deposit) => deposit.lockPeriod === lockPeriod);

  const activeDeposits = deposits
    .filter(
      (deposit) => deposit.state === DepositWithdrawalState.DEPOSIT_SUCCESS && deposit.tokenSymbol === token?.symbol
    )
    .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

  const withdrawnDeposits = deposits
    .filter((deposit) => deposit.state === DepositWithdrawalState.WITHDRAW_SUCCESS)
    .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

  return (
    <>
      <AppModal
        open={open}
        onOpenChange={onOpenChange}
        title="My Vaquitas"
        titleIcon="/icons/deposits.svg"
        titleIconAlt="deposits"
        size="lg"
      >
        {isLoading ? (
          <div className="flex justify-center items-center py-8">
            <Spinner size="lg" color="accent" />
          </div>
        ) : deposits.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Image src="/no_data.svg" alt="No data" width={120} height={120} />
            <p className="text-gray-500 mt-4">No vaquitas yet</p>
            <p className="text-gray-400 text-sm">Make your first deposit to create a vaquita</p>
          </div>
        ) : (
          <Tabs aria-label="Vaquitas Tabs" variant="primary">
            <Tabs.List>
              <Tab id="activas">
                <div className="flex items-center gap-2">
                  <span>Active</span>
                  <Chip size="sm" color="success" variant="secondary">
                    {activeDeposits.length}
                  </Chip>
                </div>
              </Tab>
              <Tab id="retiradas">
                <div className="flex items-center gap-2">
                  <span>Withdrawn</span>
                  <Chip size="sm" color="default" variant="secondary">
                    {withdrawnDeposits.length}
                  </Chip>
                </div>
              </Tab>
            </Tabs.List>
            <Tabs.Panel id="activas">
              <div className="gap-3 flex flex-col mb-4 ">
                {activeDeposits.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Image src="/no_data.svg" alt="No data" width={100} height={100} />
                    <p className="text-gray-500 mt-4">No active vaquitas</p>
                  </div>
                ) : (
                  activeDeposits.map((deposit) => {
                    const { vaquitaInterest, aaveInterest, blendInterest, totalInterest } = getInterestData(
                      network!,
                      dataApy,
                      deposit.amount,
                      deposit.lockPeriod
                    );
                    const protocolInterest = aaveInterest + blendInterest;
                    return (
                      <Card
                        key={deposit.id}
                        className="border border-success bg-success/10 rounded-md cursor-pointer hover:bg-success/20 transition-colors"
                        onClick={() => setSelectedVaquita(deposit)}
                      >
                        <Card.Content className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                <Image
                                  src="/vaquita_working.jpg"
                                  alt="Vaquita"
                                  width={40}
                                  height={40}
                                  className="rounded-full"
                                />
                                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                              </div>
                              <div>
                                <p className="font-semibold text-black">
                                  {formatAmount(deposit.amount, deposit.tokenSymbol)}
                                </p>
                                <p className="text-sm text-gray-600">{formatTimeDeposit(deposit.lockPeriod)}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <Chip color="success" variant="secondary" size="sm" className="mb-2">
                                {deposit.inLockPeriod ? 'Locked' : 'Ready to withdraw'}
                              </Chip>
                              <p className="text-xs text-gray-500">{formatDate(deposit.createdTimestamp)}</p>
                            </div>
                          </div>

                          {/* Interest information */}
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <div className="grid grid-cols-3 gap-4 text-center">
                              <div>
                                <p className="text-xs text-gray-500">Vaquita Interest</p>
                                <p className="text-sm font-semibold text-primary">+{vaquitaInterest.toFixed(4)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Protocol Interest</p>
                                <p className="text-sm font-semibold text-blue-600">+{protocolInterest.toFixed(4)}</p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Total earn estimated</p>
                                <p className="text-sm font-semibold text-success">+{totalInterest.toFixed(4)}</p>
                              </div>
                            </div>
                          </div>
                        </Card.Content>
                      </Card>
                    );
                  })
                )}
              </div>
            </Tabs.Panel>
            <Tabs.Panel id="retiradas">
              <div className="gap-2 flex flex-col mb-4">
                {withdrawnDeposits.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Image src="/no_data.svg" alt="No data" width={100} height={100} />
                    <p className="text-gray-500 mt-4">No withdrawn vaquitas</p>
                  </div>
                ) : (
                  withdrawnDeposits.map((deposit) => (
                    <Card key={deposit.id} className="border border-gray-200 bg-gray-50 rounded-md">
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
                            <Chip color="default" variant="secondary" size="sm" className="mb-2">
                              Withdrawn
                            </Chip>
                            <p className="text-xs text-gray-500">{formatDate(deposit.createdTimestamp)}</p>
                          </div>
                        </div>
                      </Card.Content>
                    </Card>
                  ))
                )}
              </div>
            </Tabs.Panel>
          </Tabs>
        )}
      </AppModal>

      {selectedVaquita && (
        <VaquitaModal
          isOpen={!!selectedVaquita}
          onClose={() => setSelectedVaquita(null)}
          vaquitaSummary={selectedVaquita}
          isLeaderboard={false}
        />
      )}
    </>
  );
}
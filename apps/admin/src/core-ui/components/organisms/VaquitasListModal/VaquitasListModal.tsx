'use client';

import { Card, CardBody, Chip, Modal, ModalBody, ModalContent, ModalHeader, Spinner, Tab, Tabs } from '@heroui/react';
import Image from 'next/image';
import { useState } from 'react';
import { formatTimeDeposit } from '../../../helpers';
import { useDepositsComplete } from '../../../hooks';
import { useNetworkConfigStore } from '../../../stores';
import { DepositSummaryResponseDTO, DepositWithdrawalState } from '../../../types';
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
    <Modal
      size="lg"
      isOpen={open}
      onOpenChange={onOpenChange}
      closeButton={<Image src="/icons/close-circle.svg" alt="close" width={40} height={40} />}
      scrollBehavior="inside"
      classNames={{
        base: 'max-h-[90vh]',
        body: 'overflow-y-auto',
      }}
    >
      <ModalContent className="bg-background border border-black">
        <ModalHeader className="text-black font-bold text-xl">
          <div className="flex items-center gap-2">
            <Image src={'/icons/deposits.svg'} alt={'deposits'} width={24} height={24} />
            <span>My Vaquitas</span>
          </div>
        </ModalHeader>
        <ModalBody className="py-0 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center items-center py-8">
              <Spinner size="lg" color="primary" />
            </div>
          ) : deposits.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Image src="/no_data.svg" alt="No data" width={120} height={120} />
              <p className="text-gray-500 mt-4">No vaquitas yet</p>
              <p className="text-gray-400 text-sm">Make your first deposit to create a vaquita</p>
            </div>
          ) : (
            <Tabs
              aria-label="Vaquitas Tabs"
              color="primary"
              variant="underlined"
              radius="full"
              classNames={{
                tabList: 'gap-6 w-full relative rounded-none p-0 border-b border-divider',
                cursor: 'w-full bg-primary',
                tabContent: 'group-data-[selected=true]:text-primary',
              }}
            >
              <Tab
                key="activas"
                title={
                  <div className="flex items-center gap-2">
                    <span>Active</span>
                    <Chip size="sm" color="success" variant="flat">
                      {activeDeposits.length}
                    </Chip>
                  </div>
                }
              >
                <div className="gap-3 flex flex-col mb-4 ">
                  {activeDeposits.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Image src="/no_data.svg" alt="No data" width={100} height={100} />
                      <p className="text-gray-500 mt-4">No active vaquitas</p>
                    </div>
                  ) : (
                    activeDeposits.map((deposit) => {
                      const {vaquitaInterest, aaveInterest, totalInterest} = getInterestData(network!, dataApy, deposit.amount, deposit.lockPeriod);
                      return (
                      <Card
                        key={deposit.id}
                        className="border-1 border-success bg-success/10 rounded-md cursor-pointer hover:bg-success/20 transition-colors"
                        isPressable
                        onPress={() => setSelectedVaquita(deposit)}
                      >
                        <CardBody className="p-4">
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
                              <Chip color="success" variant="flat" size="sm" className="mb-2">
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
                                <p className="text-sm font-semibold text-primary">
                                  +{vaquitaInterest.toFixed(4)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Protocol Interest</p>
                                <p className="text-sm font-semibold text-blue-600">
                                  +{aaveInterest.toFixed(4)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Total earn estimated</p>
                                <p className="text-sm font-semibold text-success">
                                  +{totalInterest.toFixed(4)}
                                </p>
                              </div>
                            </div>
                          </div>
                        </CardBody>
                      </Card>
                      );
                    })
                  )}
                </div>
              </Tab>

              <Tab
                key="retiradas"
                title={
                  <div className="flex items-center gap-2">
                    <span>Withdrawn</span>
                    <Chip size="sm" color="default" variant="flat">
                      {withdrawnDeposits.length}
                    </Chip>
                  </div>
                }
              >
                <div className="gap-2 flex flex-col mb-4">
                  {withdrawnDeposits.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Image src="/no_data.svg" alt="No data" width={100} height={100} />
                      <p className="text-gray-500 mt-4">No withdrawn vaquitas</p>
                    </div>
                  ) : (
                    withdrawnDeposits.map((deposit) => (
                      <Card key={deposit.id} className="border-1 border-gray-200 bg-gray-50 rounded-md">
                        <CardBody className="p-4">
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
                              <Chip color="default" variant="flat" size="sm" className="mb-2">
                                Withdrawn
                              </Chip>
                              <p className="text-xs text-gray-500">{formatDate(deposit.createdTimestamp)}</p>
                            </div>
                          </div>
                        </CardBody>
                      </Card>
                    ))
                  )}
                </div>
              </Tab>
            </Tabs>
          )}
        </ModalBody>
      </ModalContent>

      {selectedVaquita && (
        <VaquitaModal
          isOpen={!!selectedVaquita}
          onClose={() => setSelectedVaquita(null)}
          vaquitaSummary={selectedVaquita}
          isLeaderboard={false}
        />
      )}
    </Modal>
  );
}

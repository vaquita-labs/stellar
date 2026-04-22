'use client';

import { VaquitaDepositCard } from '@/core-ui/components/home/VaquitaDepositCard';
import { getDepositsData } from '@/core-ui/helpers/deposits';
import { Card, Chip, Modal, Spinner, Tab, Tabs } from '@heroui/react';
import Image from 'next/image';
import { useState } from 'react';
import { formatTimeDeposit } from '../../../helpers';
import { useDepositsComplete } from '../../../hooks';
import { useNetworkConfigStore } from '../../../stores';
import { DepositSummaryResponseDTO } from '../../../types';
import { VaquitaModal } from '../VaquitaModal';
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

export function VaquitasListModal({ open, onOpenChange }: VaquitasListModalProps) {
  const { walletAddress } = useNetworkConfigStore();
  const { data: depositsData, isLoading } = useDepositsComplete(walletAddress);
  const [selectedVaquita, setSelectedVaquita] = useState<DepositSummaryResponseDTO | null>(null);

  const { deposits, activeDeposits, withdrawnDeposits } = getDepositsData(depositsData?.deposits ?? []);

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={(o) => { if (!o) onOpenChange(); }}>
      <Modal.Container size="lg" scroll="inside">
        <Modal.Dialog className="bg-background border border-black max-h-[90vh]">
          <Modal.CloseTrigger>
            <Image src="/icons/close-circle.svg" alt="close" width={40} height={40} />
          </Modal.CloseTrigger>
          <Modal.Header>
            <Modal.Heading className="text-black font-bold text-xl">
              <div className="flex items-center gap-2">
                <Image src={'/icons/deposits.svg'} alt={'deposits'} width={24} height={24} />
                <span>My Vaquitas</span>
              </div>
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="py-0 max-h-[60vh] overflow-y-auto">
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
            <Tabs
              aria-label="Vaquitas Tabs"
              variant="primary"
            >
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
                    activeDeposits.map((deposit) => (
                      <VaquitaDepositCard
                        key={deposit.id}
                        deposit={deposit}
                        onPress={() => setSelectedVaquita(deposit)}
                      />
                    ))
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
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>

      {selectedVaquita && (
        <VaquitaModal
          isOpen={!!selectedVaquita}
          onClose={() => setSelectedVaquita(null)}
          vaquitaSummary={selectedVaquita}
          isLeaderboard={false}
        />
      )}
    </Modal.Backdrop>
  );
}

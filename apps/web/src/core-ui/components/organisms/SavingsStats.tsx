'use client';

import { Button, Spinner } from '@heroui/react';
import { useApyByLockPeriod, useDeposits } from '../../hooks';
import { useNetworkConfigStore } from '../../stores';
import { DepositWithdrawalState } from '../../types';
import { StatItem } from '../molecules';
import { useState } from 'react';
import { BankAPYModal } from './BankAPYModal';
import Image from 'next/image';

export const SavingsStats = ({ walletAddress }: { walletAddress?: string }) => {
  const { network, walletAddress: userWalletAddress, lockPeriod, token } = useNetworkConfigStore();
  const currentWalletAddress = walletAddress ?? userWalletAddress;
  const { data } = useDeposits(currentWalletAddress);
  const { data: dataApy, isLoading: isLoadingApy } = useApyByLockPeriod(lockPeriod, token?.symbol ?? '');
  const protocolApy = dataApy?.protocolApy ?? 0;
  const vaquitaApy = dataApy?.vaquitaApy ?? 0;
  const APYNetwork = protocolApy.toFixed(2);
  const APYNetworkLabel = dataApy?.lendingMarketName ?? '';
  const APYVaquita = vaquitaApy.toFixed(2);
  let totalAmount = 0;
  const APYTotal = (+APYNetwork + +APYVaquita).toFixed(2);
  const [showBankAPYModal, setShowBankAPYModal] = useState(false);
  const deposits = (data?.deposits ?? []).filter(
    (deposit) => deposit.lockPeriod === lockPeriod && deposit.state === DepositWithdrawalState.DEPOSIT_SUCCESS
  );

  for (const deposit of deposits) {
    totalAmount += deposit.amount;
  }

  const handleBankAPYModal = () => {
    setShowBankAPYModal(true);
  };

  return (
    <>
      <div className="flex justify-around w-full bg-[#FCD7B8] border-y  border-[#B97204] px-4 py-0 h-11 ">
        {isLoadingApy ? (
          <Spinner size="md" color="primary" />
        ) : (
          <Button onPress={handleBankAPYModal} className="flex items-center gap-2 bg-transparent z-10">
            <Image src={`/chains/${token?.symbol}.png`} alt="info" width={32} height={32} />
            <span className="text-xl font-bold">{APYTotal} %</span>
          </Button>
        )}
      </div>
      {showBankAPYModal && <BankAPYModal open={showBankAPYModal} onOpenChange={() => setShowBankAPYModal(false)} />}
    </>
  );
};

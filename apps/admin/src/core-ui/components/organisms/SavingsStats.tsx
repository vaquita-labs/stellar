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
    <div className="absolute top-0 left-0 right-0 justify-around bg-[#FEF5E4] py-2 w-full h-12">
      <div className="flex justify-around bg-[#FEF5E4] py-2 w-full h-12">
        {isLoadingApy ? (
          <Spinner size="md" color="accent" />
        ) : (
          <Button onPress={handleBankAPYModal} className="flex items-center gap-2 bg-transparent z-10">
            <Image src={`/chains/${token?.symbol}.png`} alt="info" width={32} height={32} />
            <span className="text-xl font-bold">{APYTotal} %</span>
          </Button>
        )}
      </div>
      {showBankAPYModal && <BankAPYModal open={showBankAPYModal} onOpenChange={() => setShowBankAPYModal(false)} />}
    </div>
  );
};

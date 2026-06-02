'use client';

import { Button, Spinner } from '@heroui/react';
import Image from 'next/image';
import { useState } from 'react';
import { useApyByLockPeriod } from '../../hooks';
import { useConfigStore } from '../../stores';
import { BankAPYModal } from './BankAPYModal';

export const SavingsStats = () => {
  const { lockPeriod, token } = useConfigStore();
  const { data: dataApy, isLoading: isLoadingApy } = useApyByLockPeriod(lockPeriod, token?.symbol ?? '');
  const protocolApy = dataApy?.protocolApy ?? 0;
  const vaquitaApy = dataApy?.vaquitaApy ?? 0;
  const APYNetwork = protocolApy.toFixed(2);
  const APYVaquita = vaquitaApy.toFixed(2);
  const APYTotal = (+APYNetwork + +APYVaquita).toFixed(2);
  const [showBankAPYModal, setShowBankAPYModal] = useState(false);

  const handleBankAPYModal = () => {
    setShowBankAPYModal(true);
  };

  return (
    <>
      <div className="flex justify-around w-full bg-[#FCD7B8] border-y  border-[#B97204] px-4 py-0 h-11 ">
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
    </>
  );
};

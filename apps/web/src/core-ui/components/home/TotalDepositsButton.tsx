import { BankAPYModal } from '@/core-ui/components';
import { getDepositsData } from '@/core-ui/helpers/deposits';
import { useDepositsComplete } from '@/core-ui/hooks';
import { useConfigStore } from '@/core-ui/stores';
import { Button, Spinner } from '@heroui/react';
import Image from 'next/image';
import React, { useState } from 'react';

export const TotalDepositsButton = () => {
  const [showBankAPYModal, setShowBankAPYModal] = useState(false);
  const { walletAddress, token } = useConfigStore();

  const { data, isLoading, isRefetching } = useDepositsComplete(walletAddress);
  const { activeDepositsTotalAmount } = getDepositsData(data?.deposits ?? []);

  return (
    <>
      <Button
        onPress={() => setShowBankAPYModal(true)}
        className="bg-transparent rounded-lg gap-1 min-w-0 shrink"
      >
        {isLoading || isRefetching ? (
          <Spinner size="sm" color="current" />
        ) : (
          <>
            <Image
              src="/icons/summary/bag.png"
              alt="bag"
              width={typeof window !== 'undefined' && window.innerWidth < 768 ? 24 : 40}
              height={typeof window !== 'undefined' && window.innerWidth < 768 ? 24 : 40}
              className="object-contain"
              priority
            />
            <span className="text-xs font-semibold text-black">
              {activeDepositsTotalAmount.toFixed(2)} {token?.symbol}
            </span>
          </>
        )}
      </Button>
      {showBankAPYModal && <BankAPYModal open={showBankAPYModal} onOpenChange={() => setShowBankAPYModal(false)} />}
    </>
  );
};

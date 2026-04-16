'use client';

import { SavingsStats, WorldMap } from '@/core-ui/components';
import { truncateMiddle } from '@/core-ui/helpers';
import { WorldType } from '@/core-ui/types';
import { useParams } from 'next/navigation';
import React, { useMemo } from 'react';

export default function WalletPage() {
  const params = useParams();
  const wallet = params.wallet as string;
  const addressDisplay = useMemo(() => (wallet ? truncateMiddle(wallet, 8, 6) : ''), [wallet]);
  return (
    <div className="h-full w-full flex flex-col items-center justify-center">
      {/* <SavingsStats walletAddress={wallet} /> */}
      <div className="text-center w-full text-md font-medium bg-[#FCD7B8] border-y  border-[#B97204] px-4 py-2 mt-2">
        User: {addressDisplay}
      </div>
      {/* TODO: should be a style associated with the lock period */}
      <WorldMap walletAddress={wallet} isLeaderboard={true} worldType={WorldType.FOREST} isAvailable={true} />
    </div>
  );
}

'use client';

import { LeaderboardUserHeader, WorldMap } from '@/core-ui/components';
import { WorldType } from '@/core-ui/types';
import { useParams } from 'next/navigation';
import React from 'react';

export default function WalletPage() {
  const params = useParams();
  const wallet = params.wallet as string;
  return (
    <div className="h-full w-full flex flex-col items-center justify-center">
      <LeaderboardUserHeader walletAddress={wallet} />
      {/* TODO: should be a style associated with the lock period */}
      <WorldMap walletAddress={wallet} isLeaderboard={true} worldType={WorldType.FOREST} isAvailable={true} />
    </div>
  );
}

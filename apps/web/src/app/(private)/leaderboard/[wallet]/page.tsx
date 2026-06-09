'use client';

import { LeaderboardUserHeader, WorldMap } from '@/core-ui/components';
import { WorldType } from '@/core-ui/types';
import { useParams } from 'next/navigation';
import React from 'react';

export default function WalletPage() {
  const params = useParams();
  const wallet = params.wallet as string;
  return (
    // overflow-hidden + min-h-0 so the map takes exactly the leftover space
    // and the whole screen (header + map) fits without scrolling.
    <div className="h-full w-full flex flex-col overflow-hidden min-h-0">
      <LeaderboardUserHeader walletAddress={wallet} />
      <div className="flex-1 min-h-0 w-full overflow-hidden">
        {/* TODO: should be a style associated with the lock period */}
        <WorldMap walletAddress={wallet} isLeaderboard={true} worldType={WorldType.FOREST} isAvailable={true} />
      </div>
    </div>
  );
}

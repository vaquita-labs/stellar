'use client';

import Image from 'next/image';
import type { Ref } from 'react';

type CoinsChipProps = {
  silverCoins: number;
  goldCoins: number;
  silverCoinRef?: Ref<HTMLDivElement>;
};

export const CoinsChip = ({ silverCoins, goldCoins, silverCoinRef }: CoinsChipProps) => (
  <div className="inline-flex items-center gap-2.5 bg-black/10 rounded-full px-2.5 py-1">
    <div ref={silverCoinRef} className="flex items-center gap-1">
      <Image
        src="/icons/summary/silver_coin.png"
        alt="Silver Coin"
        width={28}
        height={28}
        className="w-6 h-6 md:w-7 md:h-7 object-contain"
        priority
      />
      <span className="text-sm font-semibold text-black tabular-nums">{silverCoins}</span>
    </div>
    <div className="w-px h-4 bg-black/20" />
    <div className="flex items-center gap-1">
      <Image
        src="/icons/summary/gold_coin.png"
        alt="Gold Coin"
        width={28}
        height={28}
        className="w-6 h-6 md:w-7 md:h-7 object-contain"
        priority
      />
      <span className="text-sm font-semibold text-black tabular-nums">{goldCoins}</span>
    </div>
  </div>
);

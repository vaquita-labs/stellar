'use client';

import Image from 'next/image';
import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';

type CoinsChipProps = {
  goldCoins: number;
  goldCoinRef?: Ref<HTMLDivElement>;
};

export const CoinsChip = ({ goldCoins, goldCoinRef }: CoinsChipProps) => {
  const { t } = useTranslation();
  return (
  <div className="inline-flex items-center gap-2.5 bg-black/10 rounded-full px-2.5 py-1">
    <div ref={goldCoinRef} className="flex items-center gap-1">
      <Image
        src="/icons/global/coin.png"
        alt={t('home.coinsChip.goldCoinAlt', 'Gold Coin')}
        width={28}
        height={28}
        className="w-6 h-6 md:w-7 md:h-7 object-contain"
        priority
      />
      <span className="text-sm font-semibold text-black tabular-nums">{goldCoins}</span>
    </div>
  </div>
  );
};

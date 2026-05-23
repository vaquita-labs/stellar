'use client';

import BankBuildingObject from '@/core-ui/components/map/bank-building/BankBuildingObject';
import { useRestProfile } from '@/core-ui/hooks';
import { useProfileDailyCheck } from '@/core-ui/hooks/profile/useProfileDailyCheck';
import { useMapStore } from '@/core-ui/stores';
import { useEffect, useState } from 'react';

interface BankBuildingProps {
  position: [number, number, number];
}

export default function BankBuilding({ position }: BankBuildingProps) {
  const isEditMode = useMapStore((store) => store.editMode);
  const [coinCounter, setCoinCounter] = useState(8);
  const { data, isLoading, isRefetching } = useProfileDailyCheck();
  const { goldDailyCollect } = useRestProfile();
  const [delay, setDelay] = useState(false);
  const loading = isLoading || isRefetching || delay;
  const goldCoinsToCollect = data?.find?.((reward) => reward?.name === 'Gold Coin')?.amountToCollect || 0;
  useEffect(() => {
    setCoinCounter(goldCoinsToCollect);
  }, [goldCoinsToCollect]);

  const onClick = () => {
    if (!loading) {
      setDelay(true);
      setTimeout(() => {
        setDelay(false);
      }, 2000);

      if (coinCounter > 0) {
        void goldDailyCollect();
      } else {
      }
    }
  };

  return (
    <BankBuildingObject
      position={position}
      onClick={isEditMode ? undefined : onClick}
      goldCoinsToCollect={coinCounter}
      isLoading={loading}
    />
  );
}

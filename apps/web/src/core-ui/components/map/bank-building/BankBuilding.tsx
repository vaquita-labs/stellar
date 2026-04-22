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
  const { silverDailyCollect } = useRestProfile();
  const [delay, setDelay] = useState(false);
  const loading = isLoading || isRefetching || delay;
  const silverCoinsToCollect = data?.find?.((reward) => reward?.name === 'Silver Coin')?.amountToCollect || 0;
  useEffect(() => {
    setCoinCounter(silverCoinsToCollect);
  }, [silverCoinsToCollect]);

  const onClick = () => {
    if (!loading) {
      setDelay(true);
      setTimeout(() => {
        setDelay(false);
      }, 2000);

      if (coinCounter > 0) {
        void silverDailyCollect();
      } else {
      }
    }
  };

  return (
    <BankBuildingObject
      position={position}
      onClick={isEditMode ? undefined : onClick}
      silverCoinsToCollect={coinCounter}
      isLoading={loading}
    />
  );
}

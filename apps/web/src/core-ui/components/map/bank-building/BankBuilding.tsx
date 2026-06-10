'use client';

import BankBuildingObject from '@/core-ui/components/map/bank-building/BankBuildingObject';
import { useMapStore } from '@/core-ui/stores';

interface BankBuildingProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  onClick?: () => void;
}

export default function BankBuilding({ position, rotation, onClick }: BankBuildingProps) {
  const isEditMode = useMapStore((store) => store.editMode);

  return (
    <BankBuildingObject
      position={position}
      rotation={rotation}
      onClick={isEditMode ? undefined : onClick}
      goldCoinsToCollect={0}
      isLoading={false}
    />
  );
}

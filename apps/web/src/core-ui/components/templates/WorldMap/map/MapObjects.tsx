// MapObjects.tsx
import { useMapStore } from '@/core-ui/stores';
import { MapObjectType, ProfileMapObjectsResponseDTO } from '@/core-ui/types';
import BankBuilding from '../../../map/bank-building/BankBuilding';
import BarnBuilding from '../../../map/BarnBuilding';
import Leaderboard from '../../../map/Leaderboard';

interface MapObjectsProps {
  objects: ProfileMapObjectsResponseDTO['objects'];
  onBarnClick?: () => void;
  onBankClick?: () => void;
  onLeaderBoardClick?: () => void;
  hasWallet?: boolean;
}

export const MapObjects = ({ objects, onBarnClick, onBankClick, onLeaderBoardClick, hasWallet }: MapObjectsProps) => {
  const editMode = useMapStore((store) => store.editMode);

  return objects.map(({ position, type }, index) => {
    if (type === MapObjectType.BANK && !editMode) {
      return <BankBuilding key={position.join(',') + index} position={position} onClick={onBankClick} />;
    }
    if (type === MapObjectType.BARN) {
      return (
        <BarnBuilding
          key={position.join(',') + index}
          position={position}
          onClick={onBarnClick}
          hasWallet={hasWallet}
        />
      );
    }

    if (type === MapObjectType.LEADERBOARD && !editMode) {
      return <Leaderboard key={position.join(',') + index} position={position} onClick={onLeaderBoardClick} />;
    }
    return null;
  });
};

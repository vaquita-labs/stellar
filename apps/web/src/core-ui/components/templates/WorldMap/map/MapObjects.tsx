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

  return objects.map(({ position, type, rotation }, index) => {
    if (type === MapObjectType.BANK && !editMode) {
      return (
        <BankBuilding key={position.join(',') + index} position={position} rotation={rotation} onClick={onBankClick} />
      );
    }
    if (type === MapObjectType.BARN && !editMode) {
      return (
        <BarnBuilding
          key={position.join(',') + index}
          position={position}
          rotation={rotation}
          onClick={onBarnClick}
          hasWallet={hasWallet}
        />
      );
    }

    if (type === MapObjectType.LEADERBOARD && !editMode) {
      return (
        <Leaderboard
          key={position.join(',') + index}
          position={position}
          rotation={rotation}
          onClick={onLeaderBoardClick}
        />
      );
    }
    return null;
  });
};

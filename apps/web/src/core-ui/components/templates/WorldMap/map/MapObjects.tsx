// MapObjects.tsx
import { useMapStore } from '@/core-ui/stores';
import { MapObjectType, ProfileMapObjectsResponseDTO } from '@/core-ui/types';
import BankBuilding from '../../../map/bank-building/BankBuilding';
import BarnBuilding from '../../../map/BarnBuilding';
import Leaderboard from '../../../map/Leaderboard';

interface MapObjectsProps {
  objects: ProfileMapObjectsResponseDTO['objects'];
  // Handlers de click temporalmente sin uso (ver nota abajo). Se mantienen en la interfaz
  // para reactivar la interacción del banco/granja/podio en el futuro.
  onBarnClick?: () => void;
  onBankClick?: () => void;
  onLeaderBoardClick?: () => void;
  hasWallet?: boolean;
}

export const MapObjects = ({ objects, hasWallet }: MapObjectsProps) => {
  const editMode = useMapStore((store) => store.editMode);

  return objects.map(({ position, type, rotation }, index) => {
    // NOTE: onClick handlers temporalmente desactivados para que el banco, la granja
    // y el podio no sean clicleables (sin cursor pointer). Reactivar pasando de nuevo
    // onBankClick / onBarnClick / onLeaderBoardClick cuando se quieran habilitar.
    if (type === MapObjectType.BANK && !editMode) {
      return <BankBuilding key={position.join(',') + index} position={position} rotation={rotation} />;
    }
    if (type === MapObjectType.BARN && !editMode) {
      return (
        <BarnBuilding key={position.join(',') + index} position={position} rotation={rotation} hasWallet={hasWallet} />
      );
    }

    if (type === MapObjectType.LEADERBOARD && !editMode) {
      return <Leaderboard key={position.join(',') + index} position={position} rotation={rotation} />;
    }
    return null;
  });
};

// MapObjects.tsx
import Bush from '@/core-ui/components/templates/WorldMap/map/Bush';
import { MapTile, WorldType } from '@/core-ui/types/map';
import Rock from './Rock';
import Tree from './Tree';
import BankBuilding from './BankBuilding';
import BarnBuilding from './BarnBuilding';
import LeaderBoard from './LeaderBoard';

interface MapObjectsProps {
  tiles: MapTile[];
  styleMap: WorldType;
  onBarnClick?: () => void;
  onBankClick?: () => void;
  onLeaderBoardClick?: () => void;
  hasWallet?: boolean;
}

export const MapObjects = ({
  tiles,
  styleMap,
  onBarnClick,
  onBankClick,
  onLeaderBoardClick,
  hasWallet,
}: MapObjectsProps) => {
  return (
    <>
      {tiles.map(({ id, position, object, variant, beingWorked }) => {
        if (object === 'tree') {
          return (
            <Tree
              key={id}
              position={position}
              variant={variant || 0}
              beingWorked={beingWorked ?? false}
              styleMap={styleMap}
            />
          );
        }
        if (object === 'rock') {
          return <Rock key={id} position={position} variant={variant || 0} beingWorked={beingWorked ?? false} />;
        }
        if (object === 'bush') {
          return <Bush key={id} position={position} styleMap={styleMap} />;
        }
        if (object === 'bank') {
          return <BankBuilding key={id} position={position} onClick={onBankClick} hasWallet={hasWallet} />;
        }
        if (object === 'barn') {
          return <BarnBuilding key={id} position={position} onClick={onBarnClick} hasWallet={hasWallet} />;
        }

        if (object === 'leaderboard') {
          return <LeaderBoard key={id} position={position} onClick={onLeaderBoardClick} />;
        }
        return null;
      })}
    </>
  );
};

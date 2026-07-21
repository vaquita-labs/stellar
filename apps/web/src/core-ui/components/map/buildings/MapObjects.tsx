import { useMapStore } from '@/core-ui/stores';
import { ProfileMapObjectsResponseDTO } from '@/core-ui/types';
import { useMemo } from 'react';
import { makeNeighborTypeLookup } from '../helpers';
import { Building } from './Building';
import { BUILDINGS } from './registry';

interface MapObjectsProps {
  objects: ProfileMapObjectsResponseDTO['objects'];
  // Handlers de click temporalmente sin uso (ver nota abajo). Se mantienen en la interfaz
  // para reactivar la interacción del banco/granja/podio en el futuro.
  onBarnClick?: () => void;
  onBankClick?: () => void;
  onLeaderBoardClick?: () => void;
  hasWallet?: boolean;
}

// Renderiza los edificios del mapa en modo normal (en modo edición los
// materializa Ground con los mismos builders). Qué es un edificio y cómo se
// dibuja vive en registry.tsx: agregar uno nuevo no requiere tocar este archivo.
export const MapObjects = ({ objects }: MapObjectsProps) => {
  const editMode = useMapStore((store) => store.editMode);
  // Lo consume el tile de pasto bajo cada edificio para saber qué lados van
  // con contorno de costa (misma info que usa Ground en modo edición).
  const neighborTypeAt = useMemo(() => makeNeighborTypeLookup(objects), [objects]);

  if (editMode) return null;

  // NOTE: onClick handlers temporalmente desactivados para que el banco, la granja
  // y el podio no sean clickeables (sin cursor pointer). Reactivar pasando `onClick`
  // al <Building> según el tipo cuando se quieran habilitar.
  return objects.map(({ position, type, rotation }, index) => {
    const definition = BUILDINGS[type];
    if (!definition) return null;
    return (
      <Building
        key={position.join(',') + index}
        type={type}
        definition={definition}
        position={position}
        rotation={rotation}
        neighborTypeAt={neighborTypeAt}
      />
    );
  });
};

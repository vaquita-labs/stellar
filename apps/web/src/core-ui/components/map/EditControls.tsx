import { Html } from '@react-three/drei';
import { Button } from '@heroui/react';
import { useMapStore } from '../../stores';
import { MapObjectType } from '../../types';

interface EditControlsProps {
  position: [number, number, number];
}

export const EditControls = ({ position }: EditControlsProps) => {
  const updateTile = useMapStore((store) => store.updateTile);
  const setEditingObjectPosition = useMapStore((store) => store.setEditingObjectPosition);
  const getTileAt = useMapStore((store) => store.getTileAt);

  const handleRemove = () => {
    updateTile(position, {
      variant: 0,
      type: MapObjectType.EMPTY,
      position,
      rotation: [0, 0, 0],
    });
    setEditingObjectPosition(null);
  };

  const handleRotate = () => {
    const tile = getTileAt(position[0], position[2]);
    if (!tile) return;

    // Obtener la rotación actual del tile
    const currentRotation = tile.rotation || [0, 0, 0];
    const [x, y, z] = currentRotation;
    
    // Rotar 90 grados (π/2) en el eje Y
    let newY = y + Math.PI / 2;
    
    // Normalizar a [0, 2π) usando módulo
    newY = ((newY % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);
    
    const newRotation: [number, number, number] = [x, newY, z];

    console.log('Rotación:', {
      anterior: currentRotation,
      nueva: newRotation,
      gradosAnterior: (y * 180) / Math.PI,
      gradosNueva: (newY * 180) / Math.PI,
    });

    updateTile(position, {
      ...tile,
      rotation: newRotation,
    });
  };

  const handleDone = () => {
    setEditingObjectPosition(null);
  };

  return (
    <Html
      position={[position[0] + 1.2, position[1] + 2, position[2]]}
      center={false}
      transform={false}
      occlude={false}
      style={{ pointerEvents: 'auto', zIndex: 10000 }}
      zIndexRange={[10000, 0]}
    >
      <div className="flex flex-col gap-2">
        <Button isIconOnly onPress={handleRemove} aria-label="Eliminar" className="bg-transparent">
          <img src="/icons/edit-controls/remove.svg" alt="Eliminar" width={36} height={36} />
        </Button>
        <Button isIconOnly onPress={handleRotate} aria-label="Girar" className="bg-transparent">
          <img src="/icons/edit-controls/rotate.svg" alt="Girar" width={36} height={36} />
        </Button>
        <Button isIconOnly onPress={handleDone} aria-label="Confirmar" className="bg-transparent">
          <img src="/icons/edit-controls/done.svg" alt="Confirmar" width={36} height={36} />
        </Button>
      </div>
    </Html>
  );
};

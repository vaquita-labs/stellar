import { Html } from '@react-three/drei';
import { Button } from '@heroui/react';
import { EditionMode, useMapStore } from '../../stores';
import { MapObjectType } from '../../types';
import { useTranslation } from 'react-i18next';

interface EditControlsProps {
  position: [number, number, number];
}

export const EditControls = ({ position }: EditControlsProps) => {
  const { t } = useTranslation();
  const updateTile = useMapStore((store) => store.updateTile);
  const setEditingObjectPosition = useMapStore((store) => store.setEditingObjectPosition);
  const setPickedItem = useMapStore((store) => store.setPickedItem);
  const setEditMode = useMapStore((store) => store.setEditMode);
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
    // Volver al estado base: deseleccionar el item picado y salir de ADD mode.
    // Esto re-expande el bottom sheet para que el usuario vea el catálogo de nuevo.
    setPickedItem(null);
    setEditMode(EditionMode.SELECT);
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
        <Button isIconOnly onPress={handleRemove} aria-label={t('home.editControls.remove', 'Remove')} className="bg-transparent">
          <img src="/icons/edit-controls/remove.svg" alt={t('home.editControls.remove', 'Remove')} width={36} height={36} />
        </Button>
        <Button isIconOnly onPress={handleRotate} aria-label={t('home.editControls.rotate', 'Rotate')} className="bg-transparent">
          <img src="/icons/edit-controls/rotate.svg" alt={t('home.editControls.rotate', 'Rotate')} width={36} height={36} />
        </Button>
        <Button isIconOnly onPress={handleDone} aria-label={t('common.confirm')} className="bg-transparent">
          <img src="/icons/edit-controls/done.svg" alt={t('common.confirm')} width={36} height={36} />
        </Button>
      </div>
    </Html>
  );
};

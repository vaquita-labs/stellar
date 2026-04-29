'use client';

import { AnimatePresence, motion, PanInfo } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useRestProfile } from '../../../hooks';
import { EditionMode, useMapStore, useSyncMapObjects } from '../../../stores';
import { CatalogList } from './CatalogList';
import { ExitEditModeModal } from './ExitEditModeModal';
import { ObjectList } from './ObjectList';
import { EditPanelsProps } from './types';

type EditTab = 'catalog' | 'collection';

const SHEET_HEIGHT = 400; // Bottom sheet height in pixels
const MINIMIZED_HEIGHT = 30; // Height when minimized (only drag handle visible)
const DRAG_THRESHOLD = 100; // Minimum distance to close when dragging

// Transiciones suaves y rápidas
const smoothTransition = {
  type: 'spring' as const,
  damping: 25,
  stiffness: 400,
  mass: 0.5,
};

const quickTransition = {
  type: 'tween' as const,
  duration: 0.2,
  ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
};

// Transición rápida pero suave para entrada/salida
const enterTransition = {
  type: 'spring' as const,
  damping: 30,
  stiffness: 500,
  mass: 0.4,
};

export function EditPanels({ open, onOpenChange }: EditPanelsProps) {
  const setEditMode = useMapStore((store) => store.setEditMode);
  const pickedObject = useMapStore((store) => store.pickedObject);
  const setPickedItem = useMapStore((store) => store.setPickedItem);
  const currentTiles = useMapStore((store) => store.currentTiles);
  const tiles = useMapStore((store) => store.tiles);
  const setTiles = useMapStore((store) => store.setTiles);
  const editMode = useMapStore((store) => store.editMode);
  const editingObjectPosition = useMapStore((store) => store.editingObjectPosition);
  const setIsEditingMap = useMapStore((store) => store.setIsEditingMap);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(open);
  const [activeTab, setActiveTab] = useState<EditTab>('catalog');
  const { saveMapObjects } = useRestProfile();
  const { refetch } = useSyncMapObjects();

  const hasChanges = JSON.stringify(currentTiles) !== JSON.stringify(tiles);
  const isPlacingNewItem = editMode === EditionMode.ADD && !!pickedObject;
  const isEditing = editingObjectPosition !== null || isPlacingNewItem;
  const minimizedY = SHEET_HEIGHT - MINIMIZED_HEIGHT;

  useEffect(() => {
    if (open) {
      setIsModalOpen(true);
    } else if (!open && isModalOpen && !showConfirmDialog) {
      // Si se intenta cerrar desde fuera (open cambió a false)
      // y hay cambios, mostrar confirmación antes de cerrar
      if (hasChanges) {
        // Prevenir el cierre inmediato y mostrar el modal de confirmación
        setShowConfirmDialog(true);
        // Re-activar el modo editar para mantener el estado hasta que el usuario decida
        setEditMode(EditionMode.SELECT);
        // Mantener el header slim ("Shop") mientras se decide salir o no
        setIsEditingMap(true);
      } else {
        // Si no hay cambios, permitir el cierre
        setIsModalOpen(false);
      }
    }
  }, [open, isModalOpen, showConfirmDialog, setEditMode, hasChanges, setIsEditingMap]);

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    // Las constraints de drag ya manejan el comportamiento,
    // pero podemos asegurar que vuelva a la posición correcta
    // framer-motion lo manejará automáticamente con animate
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setEditMode(null);
    setPickedItem(null);
    onOpenChange();
  };

  const handleCloseClick = () => {
    if (hasChanges) {
      setShowConfirmDialog(true);
    } else {
      handleClose();
    }
  };

  const handleConfirmExit = async () => {
    await saveMapObjects({ objects: currentTiles });
    await refetch();
    setShowConfirmDialog(false);
    handleClose();
  };

  const handleDiscard = () => {
    // Restaurar currentTiles al valor original de tiles para descartar los cambios
    setTiles(tiles);
    setShowConfirmDialog(false);
    setPickedItem(null);
    handleClose();
  };

  return (
    <>
      <ExitEditModeModal
        isOpen={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        handleConfirmExit={handleConfirmExit}
        handleDiscard={handleDiscard}
      />

      <AnimatePresence>
        {isModalOpen && (
          <>
            {/* Transparent overlay that doesn't block the background */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={quickTransition}
              className="fixed inset-0 z-40 pointer-events-none"
            />

            {/* Bottom Sheet */}
            <motion.div
              ref={sheetRef}
              initial={{ y: SHEET_HEIGHT }}
              animate={{ y: isEditing ? minimizedY : 0 }}
              exit={{ y: SHEET_HEIGHT }}
              transition={enterTransition}
              drag="y"
              dragConstraints={
                isPlacingNewItem
                  ? { top: 0, bottom: minimizedY }
                  : isEditing
                    ? { top: minimizedY, bottom: minimizedY }
                    : { top: 0, bottom: 0 }
              }
              dragElastic={0}
              dragMomentum={false}
              onDragEnd={handleDragEnd}
              className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-black rounded-t-2xl shadow-2xl pointer-events-auto"
            >
              {/* Drag handle */}
              {/* <div className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing">
                <div className="w-12 h-1.5 bg-gray-400 rounded-full" />
              </div> */}

              {!isEditing && (
                <>
                  <div className="flex items-center gap-2 px-4 mt-4">
                    <div className="flex flex-1 bg-[#FFF7E6] border border-black/10 rounded-full p-1">
                      <button
                        type="button"
                        onClick={() => setActiveTab('catalog')}
                        className={`flex-1 text-sm font-semibold rounded-full px-3 py-1.5 transition ${
                          activeTab === 'catalog' ? 'bg-white text-black shadow-sm border border-black/10' : 'text-gray-600'
                        }`}
                      >
                        Catalog
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('collection')}
                        className={`flex-1 text-sm font-semibold rounded-full px-3 py-1.5 transition ${
                          activeTab === 'collection' ? 'bg-white text-black shadow-sm border border-black/10' : 'text-gray-600'
                        }`}
                      >
                        My Collection
                      </button>
                    </div>
                  </div>

                  <div className="px-4 pb-3 mt-3 max-h-[60vh] min-h-[100px] overflow-y-auto">
                    {activeTab === 'catalog' ? <CatalogList /> : <ObjectList />}
                  </div>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

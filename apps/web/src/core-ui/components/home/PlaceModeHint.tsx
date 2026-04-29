'use client';

import { EditionMode, useMapStore } from '@/core-ui/stores';
import { AnimatePresence, motion } from 'framer-motion';
import { FiX } from 'react-icons/fi';

export function PlaceModeHint() {
  const editMode = useMapStore((s) => s.editMode);
  const pickedObject = useMapStore((s) => s.pickedObject);
  const setEditMode = useMapStore((s) => s.setEditMode);
  const setPickedItem = useMapStore((s) => s.setPickedItem);

  const isVisible = editMode === EditionMode.ADD && !!pickedObject;

  const cancel = () => {
    setPickedItem(null);
    setEditMode(EditionMode.SELECT);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.2 }}
          className="absolute top-20 md:top-16 left-1/2 -translate-x-1/2 z-30 pointer-events-auto"
        >
          <div className="flex items-center gap-2 bg-white border border-black border-b-2 rounded-full pl-3 pr-1 py-1 shadow-lg">
            <span className="text-xs sm:text-sm font-semibold text-black whitespace-nowrap">
              Tap the map to place{' '}
              <span className="text-[#34c759]">
                {pickedObject?.type} v{(pickedObject?.variant ?? 0) + 1}
              </span>
            </span>
            <button
              type="button"
              onClick={cancel}
              aria-label="Cancel placement"
              className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
            >
              <FiX className="text-black text-sm" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

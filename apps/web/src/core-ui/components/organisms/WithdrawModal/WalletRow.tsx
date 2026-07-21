'use client';

import { truncateMiddle } from '@/core-ui/helpers/strings';
import { Spinner } from '@heroui/react';
import { motion, useAnimationControls } from 'framer-motion';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiTrash2 } from 'react-icons/fi';
import { IoWalletOutline } from 'react-icons/io5';
import { SavedWallet } from '../../../hooks/useSavedWallets';

interface WalletRowProps {
  wallet: SavedWallet;
  selected: boolean;
  deleting: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

// Umbral de arrastre (px) para abrir la confirmación de borrado.
const SWIPE_THRESHOLD = 72;

/**
 * Fila de wallet guardada. Tap selecciona; arrastrar a la derecha (o el botón
 * de basura en desktop) abre una confirmación inline —"¿Eliminar?"— en la misma
 * fila, sin abrir otro modal. El color de seleccionado es un celeste marcado
 * para que se distinga a simple vista.
 */
export function WalletRow({ wallet, selected, deleting, onSelect, onDelete }: WalletRowProps) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const controls = useAnimationControls();

  const askConfirm = () => {
    setConfirming(true);
    void controls.start({ x: 0 });
  };

  if (confirming) {
    return (
      <div className="w-full flex items-center gap-2 rounded-lg border border-error border-b-2 bg-[#FDECEE] px-4 py-3">
        <span className="flex-1 min-w-0 text-sm font-semibold text-black">
          {t('withdraw.deleteWallet.confirm', 'Delete “{{label}}”?', { label: wallet.label })}
        </span>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={deleting}
          className="shrink-0 rounded-md border border-black border-b-2 bg-white px-3 py-1.5 text-xs font-bold text-black transition active:translate-y-0.5 disabled:opacity-40"
        >
          {t('common.cancel', 'Cancel')}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="shrink-0 flex items-center justify-center gap-1 rounded-md border border-[#B3261E] border-b-2 bg-error px-3 py-1.5 text-xs font-bold text-white transition active:translate-y-0.5 disabled:opacity-60"
        >
          {deleting ? <Spinner size="sm" color="current" /> : null}
          {t('withdraw.deleteWallet.action', 'Delete')}
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      {/* Fondo revelado al arrastrar: zona roja con basura a la izquierda. */}
      <div className="absolute inset-0 flex items-center rounded-lg bg-error px-4 text-white">
        <FiTrash2 className="w-5 h-5" />
      </div>

      <motion.button
        type="button"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0, right: 0.7 }}
        animate={controls}
        onDragEnd={(_, info) => {
          if (info.offset.x > SWIPE_THRESHOLD) askConfirm();
          else void controls.start({ x: 0 });
        }}
        onClick={onSelect}
        className={
          'relative w-full flex items-center gap-3 rounded-lg border border-black border-b-2 px-4 py-3 text-left transition touch-pan-y select-none ' +
          (selected ? 'bg-[#CFE3FF]' : 'bg-white hover:bg-[#F5FBFF]')
        }
      >
        <IoWalletOutline className="w-6 h-6 text-black shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-black truncate">{wallet.label}</span>
          <span className="block text-xs text-gray-500">{truncateMiddle(wallet.address, 6, 5)}</span>
        </span>
        <span
          role="button"
          tabIndex={0}
          aria-label={t('withdraw.deleteWallet.action', 'Delete')}
          onClick={(e) => {
            e.stopPropagation();
            askConfirm();
          }}
          onPointerDownCapture={(e) => e.stopPropagation()}
          className="shrink-0 flex items-center justify-center w-8 h-8 -mr-2 rounded-md text-gray-400 hover:text-error hover:bg-error/10 transition"
        >
          <FiTrash2 className="w-4 h-4" />
        </span>
      </motion.button>
    </div>
  );
}

'use client';

import { truncateMiddle } from '@/core-ui/helpers/strings';
import { Spinner } from '@heroui/react';
import { motion, useAnimationControls } from 'framer-motion';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheck, FiTrash2 } from 'react-icons/fi';
import { IoWalletOutline } from 'react-icons/io5';
import type { AvatarConfig } from '@vaquita/avatar';
import { SavedWallet } from '../../../hooks/useSavedWallets';
import { avatarBackgroundColor, VaquitaAvatarCircle } from '../../avatar/VaquitaAvatar';

interface WalletRowProps {
  wallet: SavedWallet;
  /**
   * Nombre a mostrar. Para un destino que es usuario de Vaquita es su nickname
   * de AHORA, resuelto desde la dirección, que puede no ser el que el usuario
   * tipeó al guardarlo. Sin esto cae al label guardado.
   */
  displayLabel?: string;
  /**
   * El destino es una persona: en lugar del ícono de billetera va su avatar,
   * y la fila entera se tiñe con una versión pálida del color de fondo de ese
   * avatar.
   * `avatarConfig` es el que devolvió su perfil; si falta se usa el sembrado
   * con la dirección, igual que en el resto de la app.
   *
   * Como el fondo ya es de la persona, el seleccionado no puede ser el celeste
   * de las wallets: se marca con un check a la derecha.
   */
  isUser?: boolean;
  avatarConfig?: AvatarConfig;
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
export function WalletRow({
  wallet,
  displayLabel,
  isUser,
  avatarConfig,
  selected,
  deleting,
  onSelect,
  onDelete,
}: WalletRowProps) {
  const { t } = useTranslation();
  const shownLabel = displayLabel ?? wallet.label;
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
          {t('withdraw.deleteWallet.confirm', 'Delete “{{label}}”?', { label: shownLabel })}
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
          (isUser ? 'hover:brightness-[0.97]' : selected ? 'bg-[#CFE3FF]' : 'bg-white hover:bg-[#F5FBFF]')
        }
        // El color del avatar mezclado a la mitad con blanco: entero, una lista
        // de varias filas pesaba demasiado y competía con el botón de agregar.
        // Así tiñe la fila y el círculo del avatar, que va con el color pleno,
        // sigue destacándose adentro.
        style={
          isUser
            ? { backgroundColor: `color-mix(in srgb, ${avatarBackgroundColor(avatarConfig, wallet.address)} 50%, white)` }
            : undefined
        }
      >
        {isUser ? (
          // h-9 y no más: es el alto de las dos líneas de texto, así la fila
          // mide lo mismo que la de una wallet y la caja con scroll de "Elegir
          // usuario" sigue mostrando tres filas justas.
          <VaquitaAvatarCircle config={avatarConfig} seed={wallet.address} className="h-9 w-9" />
        ) : (
          <IoWalletOutline className="w-6 h-6 text-black shrink-0" />
        )}
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-black truncate">{shownLabel}</span>
          <span className="block text-xs text-gray-500">{truncateMiddle(wallet.address, 6, 5)}</span>
          {wallet.memo ? (
            <span className="block text-xs text-gray-400 truncate">
              {t('withdraw.memoLabel', 'Memo')}: {wallet.memo}
            </span>
          ) : null}
        </span>
        {isUser && selected ? <FiCheck className="w-5 h-5 text-black shrink-0" strokeWidth={3} aria-hidden /> : null}
        <span
          role="button"
          tabIndex={0}
          aria-label={t('withdraw.deleteWallet.action', 'Delete')}
          onClick={(e) => {
            e.stopPropagation();
            askConfirm();
          }}
          onPointerDownCapture={(e) => e.stopPropagation()}
          className={
            'shrink-0 flex items-center justify-center w-8 h-8 -mr-2 rounded-md hover:text-error hover:bg-error/10 transition ' +
            // Sobre un fondo de color el gris claro de la basura casi no se ve.
            (isUser ? 'text-gray-500' : 'text-gray-400')
          }
        >
          <FiTrash2 className="w-4 h-4" />
        </span>
      </motion.button>
    </div>
  );
}

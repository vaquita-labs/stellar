'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertTriangle, FiEye, FiEyeOff } from 'react-icons/fi';
import { AppModal } from '../../molecules';
import { MOCK_CARD } from './cardThemes';

interface CardPinModalProps {
  open: boolean;
  onOpenChange: () => void;
}

export function CardPinModal({ open, onOpenChange }: CardPinModalProps) {
  const { t } = useTranslation();
  const [showPin, setShowPin] = useState(false);

  // Always reopen with the PIN hidden.
  useEffect(() => {
    if (!open) setShowPin(false);
  }, [open]);

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('cards.pin.title', 'Card PIN')}
      size="sm"
    >
      <div className="flex flex-col items-center gap-5 py-2">
        <div className="flex gap-3">
          {MOCK_CARD.pin.split('').map((digit, i) => (
            <span
              key={i}
              className="grid h-14 w-12 place-items-center rounded-lg border border-black border-b-4 bg-white text-2xl font-extrabold text-black"
            >
              {showPin ? digit : '•'}
            </span>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowPin((v) => !v)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border border-black border-b-2 bg-[#DDF4FF] text-black text-sm font-semibold hover:bg-[#c4ecff] transition"
        >
          {showPin ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
          {showPin ? t('cards.pin.hide', 'Hide PIN') : t('cards.pin.show', 'Show PIN')}
        </button>

        <div className="flex items-start gap-3 rounded-lg border border-black border-b-2 bg-[#FFF7E6] p-3 text-sm">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-white border border-primary text-black shrink-0">
            <FiAlertTriangle />
          </span>
          <p className="text-gray-700">
            {t('cards.pin.warning', 'Never share your PIN with anyone. Vaquita will never ask you for it.')}
          </p>
        </div>
      </div>
    </AppModal>
  );
}

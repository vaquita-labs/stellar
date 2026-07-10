'use client';

import { toast } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { FiCopy, FiWifi } from 'react-icons/fi';
import { useCardsStore } from '../../../stores';
import { getCardSticker, getCardTheme, MOCK_CARD } from './cardThemes';

interface VirtualCardProps {
  holderName: string;
  /** Shows the full (mock) number and CVV instead of the masked versions. */
  revealed: boolean;
}

export function VirtualCard({ holderName, revealed }: VirtualCardProps) {
  const { t } = useTranslation();
  const theme = getCardTheme(useCardsStore((s) => s.theme));
  const sticker = getCardSticker(useCardsStore((s) => s.sticker));
  const frozen = useCardsStore((s) => s.frozen);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(MOCK_CARD.number.replace(/\s/g, ''));
      toast.success(t('cards.numberCopied', 'Card number copied'));
    } catch (e) {
      toast.danger(t('cards.copyError', "Couldn't copy"), {
        description: (e as { message?: string })?.message ?? '',
      });
    }
  };

  return (
    <div
      className={`relative w-full aspect-[8/5] sm:aspect-[16/9] rounded-2xl border border-black border-b-4 overflow-hidden shadow-sm transition-all duration-300 ${theme.gradient} ${theme.text} ${frozen ? 'grayscale' : ''}`}
    >
      {sticker && (
        <span
          aria-hidden
          className="absolute right-3 top-1/2 -translate-y-1/2 text-6xl sm:text-8xl opacity-50 -rotate-12 select-none pointer-events-none"
        >
          {sticker}
        </span>
      )}

      <div className="relative flex h-full flex-col justify-between p-5 sm:p-6">
        <div className="flex items-start justify-between">
          <span className="text-lg sm:text-xl font-extrabold tracking-tight">Vaquita</span>
          <span className="text-[10px] font-bold uppercase tracking-wider border border-current rounded-sm px-1.5 py-0.5">
            {t('cards.virtual', 'Virtual')}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Chip */}
          <span className="grid h-7 w-10 place-items-center rounded-md bg-[#FFF3D6] border border-black/60">
            <span className="h-3.5 w-6 rounded-sm border border-black/40" />
          </span>
          <FiWifi className="h-5 w-5 rotate-90 opacity-70" aria-hidden />
        </div>

        <div className="flex items-center gap-2">
          <p className="font-mono text-lg sm:text-2xl font-semibold tracking-widest whitespace-nowrap">
            {revealed ? MOCK_CARD.number : MOCK_CARD.maskedNumber}
          </p>
          {revealed && (
            <button
              type="button"
              onClick={handleCopy}
              aria-label={t('cards.copyNumber', 'Copy card number')}
              className="p-1.5 rounded-md hover:bg-black/10 transition"
            >
              <FiCopy className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-end justify-between gap-3 text-xs sm:text-sm">
          <div className="min-w-0">
            <p className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider ${theme.muted}`}>
              {t('cards.cardHolder', 'Card holder')}
            </p>
            <p className="font-bold uppercase truncate">{holderName}</p>
          </div>
          <div>
            <p className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider ${theme.muted}`}>
              {t('cards.validThru', 'Valid thru')}
            </p>
            <p className="font-bold">{MOCK_CARD.validThru}</p>
          </div>
          <div>
            <p className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider ${theme.muted}`}>
              {t('cards.cvv', 'CVV')}
            </p>
            <p className="font-bold font-mono">{revealed ? MOCK_CARD.cvv : '•••'}</p>
          </div>
        </div>
      </div>

      {frozen && (
        <div className="absolute inset-0 grid place-items-center bg-white/40 backdrop-blur-[2px]">
          <span className="flex items-center gap-2 rounded-full bg-white border border-black border-b-2 px-4 py-2 text-sm font-bold text-black">
            🧊 {t('cards.frozenLabel', 'Card frozen')}
          </span>
        </div>
      )}
    </div>
  );
}

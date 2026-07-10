'use client';

import { useTranslation } from 'react-i18next';
import { FiCheck, FiSlash } from 'react-icons/fi';
import { useCardsStore } from '../../../stores';
import { AppModal } from '../../molecules';
import { CARD_STICKERS, CARD_THEMES } from './cardThemes';

interface CustomizeCardModalProps {
  open: boolean;
  onOpenChange: () => void;
}

export function CustomizeCardModal({ open, onOpenChange }: CustomizeCardModalProps) {
  const { t } = useTranslation();
  const theme = useCardsStore((s) => s.theme);
  const sticker = useCardsStore((s) => s.sticker);
  const setTheme = useCardsStore((s) => s.setTheme);
  const setSticker = useCardsStore((s) => s.setSticker);

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('cards.customize.title', 'Customize your card')}
      size="sm"
    >
      <div className="flex flex-col gap-6 py-1">
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-500">
            {t('cards.customize.color', 'Color')}
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {CARD_THEMES.map((option) => {
              const selected = option.id === theme;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setTheme(option.id)}
                  aria-pressed={selected}
                  className="flex flex-col items-center gap-1.5"
                >
                  <span
                    className={`relative h-12 w-full rounded-lg border border-black ${option.gradient} ${
                      selected ? 'border-b-4 ring-2 ring-primary ring-offset-2' : 'border-b-2'
                    } transition-all`}
                  >
                    {selected && (
                      <span className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full bg-primary border border-black text-black">
                        <FiCheck className="h-3 w-3" />
                      </span>
                    )}
                  </span>
                  <span className={`text-xs font-semibold ${selected ? 'text-black' : 'text-gray-500'}`}>
                    {t(option.labelKey)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-500">
            {t('cards.customize.sticker', 'Sticker')}
          </h3>
          <div className="grid grid-cols-6 gap-2">
            {CARD_STICKERS.map((option) => {
              const selected = option.id === sticker;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSticker(option.id)}
                  aria-pressed={selected}
                  aria-label={option.id === 'none' ? t('cards.customize.noSticker', 'No sticker') : option.id}
                  className={`grid aspect-square place-items-center rounded-lg border border-black bg-white text-2xl transition-all ${
                    selected ? 'border-b-4 ring-2 ring-primary ring-offset-1' : 'border-b-2 hover:bg-[#FFF7E6]'
                  }`}
                >
                  {option.emoji || <FiSlash className="h-5 w-5 text-gray-400" />}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </AppModal>
  );
}

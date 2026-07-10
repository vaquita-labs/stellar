import { CardStickerId, CardThemeId } from '../../../stores';

/**
 * Visual presets for the mocked virtual card. Class strings are static so
 * Tailwind can pick them up at build time — don't build them dynamically.
 */
export type CardTheme = {
  id: CardThemeId;
  labelKey: string;
  gradient: string;
  text: string;
  /** Subtle color for secondary labels on the card (valid thru, holder). */
  muted: string;
};

export const CARD_THEMES: CardTheme[] = [
  {
    id: 'vaquita',
    labelKey: 'cards.themes.vaquita',
    gradient: 'bg-gradient-to-br from-[#F5A161] to-[#FFD9A0]',
    text: 'text-black',
    muted: 'text-black/60',
  },
  {
    id: 'sky',
    labelKey: 'cards.themes.sky',
    gradient: 'bg-gradient-to-br from-[#84D8FF] to-[#DDF4FF]',
    text: 'text-black',
    muted: 'text-black/60',
  },
  {
    id: 'meadow',
    labelKey: 'cards.themes.meadow',
    gradient: 'bg-gradient-to-br from-[#84E89B] to-[#E8FBE9]',
    text: 'text-black',
    muted: 'text-black/60',
  },
  {
    id: 'berry',
    labelKey: 'cards.themes.berry',
    gradient: 'bg-gradient-to-br from-[#F3616F] to-[#FFC2CA]',
    text: 'text-black',
    muted: 'text-black/60',
  },
  {
    id: 'night',
    labelKey: 'cards.themes.night',
    gradient: 'bg-gradient-to-br from-[#262626] to-[#52525B]',
    text: 'text-white',
    muted: 'text-white/60',
  },
];

export const getCardTheme = (id: CardThemeId): CardTheme =>
  CARD_THEMES.find((theme) => theme.id === id) ?? CARD_THEMES[0];

export const CARD_STICKERS: { id: CardStickerId; emoji: string }[] = [
  { id: 'none', emoji: '' },
  { id: 'cow', emoji: '🐮' },
  { id: 'star', emoji: '⭐' },
  { id: 'fire', emoji: '🔥' },
  { id: 'rainbow', emoji: '🌈' },
  { id: 'heart', emoji: '💖' },
];

export const getCardSticker = (id: CardStickerId): string =>
  CARD_STICKERS.find((sticker) => sticker.id === id)?.emoji ?? '';

// Fully mocked card data — the section isn't wired to a card issuer yet.
export const MOCK_CARD = {
  number: '4532 7712 3412 4321',
  maskedNumber: '••••  ••••  ••••  4321',
  lastFour: '4321',
  validThru: '12/30',
  cvv: '824',
  pin: '2415',
};

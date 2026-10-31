'use client';

import { useCardsStore } from '../../../stores';
import { useModalPresence } from '../../molecules/AppModal';
import { CardModal } from '../CardModal';

/** Mounts the card screen once, for the bottom bar's "Cards" to open from anywhere. */
export function CardHost() {
  const open = useCardsStore((s) => s.open);
  const closeCards = useCardsStore((s) => s.closeCards);
  const mounted = useModalPresence(open);
  if (!mounted) return null;
  return <CardModal open={open} onOpenChange={closeCards} />;
}

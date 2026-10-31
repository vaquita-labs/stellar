'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCreditCard, FiRefreshCw, FiShoppingBag, FiZap } from 'react-icons/fi';
import { useModalPresence } from '../../molecules/AppModal';
import { PageLayout } from '../../molecules/PageLayout';
import { PressableButton } from '../../molecules/PressableButton';
import { CardModal } from '../../organisms/CardModal';

/**
 * The Cards tab: what the Vaquita card is, drawn before anyone has one, and
 * the way to ask for it. The request itself (identity, provider steps, the
 * card once issued, its balance and movements) lives in `CardModal`, which
 * opens from the button and already knows where the user stands.
 */
export function CardsPage() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const mounted = useModalPresence(open);

  const perks = [
    {
      icon: FiShoppingBag,
      title: t('cardsPage.perks.anywhere.title', 'Pay anywhere'),
      body: t('cardsPage.perks.anywhere.body', 'Shops, apps and subscriptions that take cards.'),
    },
    {
      icon: FiRefreshCw,
      title: t('cardsPage.perks.topUp.title', 'Top up from your wallet'),
      body: t('cardsPage.perks.topUp.body', 'Move USDC to the card whenever you need it.'),
    },
    {
      icon: FiZap,
      title: t('cardsPage.perks.fast.title', 'Ready in minutes'),
      body: t('cardsPage.perks.fast.body', 'Verify your identity once and the card is yours.'),
    },
  ];

  return (
    <PageLayout
      title={t('cardsPage.title', 'Cards')}
      backHref="/home"
      contentGap="gap-5"
      contentClassName="flex-1"
      bottomPadding="pb-6"
    >
      {/* The card, as it will look: dark, with the brand and a masked number. */}
      <div className="relative mx-auto aspect-[1.586] w-full max-w-sm overflow-hidden rounded-2xl bg-[#262626] p-5 text-white shadow-[0_14px_32px_rgba(0,0,0,0.28)]">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/40 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-success/30 blur-2xl" />
        <div className="relative flex h-full flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white">
                <Image src="/vaquita/vaquita_isotipo.svg" alt="" width={20} height={20} className="h-5 w-5" />
              </span>
              <span className="text-sm font-extrabold tracking-widest">VAQUITA</span>
            </span>
            <span className="rounded-md bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">USDC</span>
          </div>
          <div className="h-7 w-10 rounded-md border border-white/30 bg-gradient-to-br from-[#F5D08A] to-[#C9962E]" />
          <div className="flex items-end justify-between">
            <span className="text-lg font-semibold tracking-[0.25em] tabular-nums">•••• •••• •••• ••••</span>
            <FiCreditCard className="h-6 w-6 opacity-80" />
          </div>
        </div>
      </div>

      {/* One white card, rows split by hairlines: the same quiet card the Transactions screen uses. */}
      <div className="divide-y divide-black/10 rounded-2xl bg-white px-4">
        {perks.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex items-center gap-3 py-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background text-black">
              <Icon className="h-5 w-5" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-bold text-black">{title}</span>
              <span className="text-xs text-gray-500">{body}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="mt-auto pt-2">
        <PressableButton variant="success" size="md" fullWidth onClick={() => setOpen(true)}>
          {t('cardsPage.cta', 'Get my card')}
        </PressableButton>
        <p className="mt-2 text-center text-[11px] text-gray-500">
          {t('cardsPage.note', 'If you already have one, this opens your card.')}
        </p>
      </div>

      {mounted && <CardModal open={open} onOpenChange={() => setOpen(false)} />}
    </PageLayout>
  );
}

'use client';

import Image from 'next/image';
import { useTranslation } from 'react-i18next';
import { FiClock, FiCreditCard, FiRefreshCw, FiShoppingBag, FiZap } from 'react-icons/fi';
import { PageLayout } from '../../molecules/PageLayout';
import { PressableButton } from '../../molecules/PressableButton';

/**
 * The Cards tab: what the Vaquita card is, drawn before anyone has one. The
 * card is not open yet, so the button is a disabled "Coming soon"; when it
 * opens, the request (identity, provider steps, the card once issued, its
 * balance and movements) is `CardModal`, opened from that button.
 */
export function CardsPage() {
  const { t } = useTranslation();

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
      // Desktop (the sidebar layout) gets the tablet look: the column grows as
      // far as the window is tall, up to the usual page width. Height sets the
      // limit because the card is the one piece that grows with the width —
      // 27rem is everything else stacked on the screen (header, list, button,
      // gaps), 1.586 the card's ratio — so the button stays above the fold
      // instead of the page being either tiny or cut off.
      maxWidth="max-w-md md:max-w-[clamp(28rem,calc((100dvh_-_27rem)_*_1.586),42rem)]"
    >
      {/* The card, as it will look: dark, with the brand and a masked number.
          It spans the column like the blocks under it, so every edge lines up
          with the list and the button; how wide that column gets is `maxWidth`
          above. Everything inside is sized in `cqw`
          (share of the card's own width; the figures are the phone sizes over
          a 384px card), so the drawing keeps its proportions at any width
          instead of leaving small pieces adrift on a wide card. The shadow is
          short on purpose: it has to fade before the white list below. */}
      <div className="@container">
        <div className="relative aspect-[1.586] w-full overflow-hidden rounded-[4.2cqw] bg-[#262626] p-[5.2cqw] text-white shadow-[0_6px_14px_rgba(0,0,0,0.22)]">
          <div className="pointer-events-none absolute -right-[16.7cqw] -top-[16.7cqw] h-[50cqw] w-[50cqw] rounded-full bg-primary/40 blur-[10.4cqw]" />
          <div className="pointer-events-none absolute -bottom-[20.8cqw] -left-[10.4cqw] h-[50cqw] w-[50cqw] rounded-full bg-success/30 blur-[10.4cqw]" />
          <div className="relative flex h-full flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-[2.1cqw]">
                <span className="flex h-[8.3cqw] w-[8.3cqw] items-center justify-center rounded-full bg-white">
                  <Image
                    src="/vaquita/vaquita_isotipo.svg"
                    alt=""
                    width={20}
                    height={20}
                    className="h-[5.2cqw] w-[5.2cqw]"
                  />
                </span>
                <span className="text-[3.65cqw] font-extrabold leading-none tracking-widest">VAQUITA</span>
              </span>
              <span className="rounded-[1.5cqw] bg-white/15 px-[2.1cqw] py-[1cqw] text-[2.6cqw] font-bold uppercase leading-none tracking-wider">
                USDC
              </span>
            </div>
            <div className="h-[7.3cqw] w-[10.4cqw] rounded-[1.5cqw] border border-white/30 bg-gradient-to-br from-[#F5D08A] to-[#C9962E]" />
            <div className="flex items-center justify-between">
              <span className="text-[4.7cqw] font-semibold leading-none tracking-[0.25em] tabular-nums">
                •••• •••• •••• ••••
              </span>
              <FiCreditCard className="h-[6.25cqw] w-[6.25cqw] opacity-80" />
            </div>
          </div>
        </div>
      </div>

      {/* One white card, rows split by hairlines: the same quiet card the Transactions screen uses.
          The rows step up a size once the list itself is wide enough (a
          container query, not a screen breakpoint): a short desktop window
          keeps the column narrow, and the larger text would wrap there. */}
      <div className="@container divide-y divide-black/10 rounded-2xl bg-white px-4 md:px-5">
        {perks.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex items-center gap-3 py-3.5 @[26rem]:gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background text-black @[26rem]:h-12 @[26rem]:w-12">
              <Icon className="h-5 w-5 @[26rem]:h-6 @[26rem]:w-6" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-bold text-black @[26rem]:text-base">{title}</span>
              <span className="text-xs text-gray-500 @[26rem]:text-sm">{body}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="mt-auto pt-2">
        {/* Disabled, but it must still read: the stock disabled look fades the
            whole button to half opacity and the label ends up grey on pale
            green. Here only the fill and border are softened and the label
            stays solid black. */}
        <PressableButton
          variant="success"
          size="md"
          fullWidth
          disabled
          className="disabled:opacity-100! bg-success/45! border-[#018222]/40! md:text-base"
        >
          <FiClock className="h-4 w-4 md:h-5 md:w-5" />
          {t('cardsPage.comingSoon', 'Coming soon')}
        </PressableButton>
      </div>
    </PageLayout>
  );
}

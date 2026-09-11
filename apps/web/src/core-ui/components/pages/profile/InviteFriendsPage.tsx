'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FiAward,
  FiCheck,
  FiChevronRight,
  FiCopy,
  FiGrid,
  FiInstagram,
  FiMessageCircle,
  FiMusic,
  FiSend,
  FiShare2,
  FiUsers,
} from 'react-icons/fi';
import { useReferralSummary } from '../../../hooks';
import { addSuccessToast } from '../../molecules/toast';
import { FOCUS_RING_CLASSES, PressableButton } from '../../molecules/PressableButton';
import { InviteQrModal } from './InviteQrModal';
import { MockedSubPageLayout } from './MockedSubPageLayout';
import { ReferrerLeaderboardPage } from './ReferrerLeaderboardPage';
import { StackedPanelModal } from './StackedPanelModal';
import { buildInviteUrl, buildShareIntentUrl, type ShareChannel, type ShareMode } from './inviteLink';

// Discriminated on `mode`, so the two channels that can open a real share sheet
// are the only ones `buildShareIntentUrl` will ever be handed.
type ChannelButton = { icon: React.ReactNode } & (
  | { channel: 'whatsapp' | 'telegram'; mode: Extract<ShareMode, 'intent'> }
  | { channel: 'instagram' | 'tiktok'; mode: Extract<ShareMode, 'copy'> }
);

const CHANNELS: ChannelButton[] = [
  { channel: 'whatsapp', mode: 'intent', icon: <FiMessageCircle className="h-4 w-4" /> },
  { channel: 'instagram', mode: 'copy', icon: <FiInstagram className="h-4 w-4" /> },
  { channel: 'tiktok', mode: 'copy', icon: <FiMusic className="h-4 w-4" /> },
  { channel: 'telegram', mode: 'intent', icon: <FiSend className="h-4 w-4" /> },
];

/**
 * Invite a friend.
 *
 * Counts and a tag, and nothing that is not yet true. There are no earnings
 * here, no commission rate and no points: a figure that is always the referral
 * count times a constant says nothing the count does not already say, and money
 * we do not pay out yet would read as a promise. The closing line says rewards
 * are coming, which is the honest version.
 *
 * The invite code IS the vaquitatag, so the card leads with the tag rather than
 * with the URL: it is what someone reads out at an event, and it is what they
 * still have when the link is gone.
 *
 * Every button stamps its own `utm_source` before the link is copied or shared,
 * which is what makes the channel breakdown in the metrics dashboard possible.
 */
export function InviteFriendsPage({ onBack }: { onBack?: () => void } = {}) {
  const { t } = useTranslation();
  const { data, isLoading } = useReferralSummary();
  const [copied, setCopied] = useState<ShareChannel | null>(null);
  // Local state, not a navigation prop: this screen is itself opened as a
  // stacked panel from settings and takes none, so the board stacks on top of
  // it the same way and the back button unwinds one panel at a time.
  const [boardOpen, setBoardOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const code = data?.code ?? '';
  const hasCode = code.length > 0;
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  // What the user reads on screen: the plain link, no channel stamp. The stamp
  // is added per button, on the copy that actually leaves the app.
  const displayUrl = hasCode ? `${origin.replace(/^https?:\/\//, '')}/?ref=${code}` : '';

  const shareText = t('referrals.shareText', 'Save with me on Vaquita and earn rewards. Use my code {{code}}', {
    code,
  });

  const flashCopied = (channel: ShareChannel) => {
    setCopied(channel);
    setTimeout(() => setCopied((current) => (current === channel ? null : current)), 1800);
  };

  const copyLink = async (channel: ShareChannel) => {
    if (!hasCode) return;
    try {
      await navigator.clipboard.writeText(buildInviteUrl(origin, code, channel));
      flashCopied(channel);
      addSuccessToast(
        t('referrals.copied', 'Link copied'),
        channel === 'instagram' || channel === 'tiktok'
          ? t('referrals.pasteHint', 'Paste it in your bio, a caption or a DM.')
          : null,
      );
    } catch {
      // No clipboard permission. The link is on screen, so nothing is lost.
    }
  };

  /**
   * The generic share button. The system sheet is the right answer where it
   * exists — it reaches every app on the phone, not just the four below — and
   * the clipboard is the fallback for desktop, where there is no sheet. Either
   * way the link is stamped before it leaves, so the source is never lost.
   */
  const shareLink = async () => {
    if (!hasCode) return;
    const url = buildInviteUrl(origin, code, 'native');
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text: shareText, url });
        return;
      } catch {
        // Sheet dismissed, or refused. Fall through to the clipboard rather
        // than leaving the button looking dead.
      }
    }
    await copyLink('copy');
  };

  const share = async (entry: ChannelButton) => {
    if (!hasCode) return;
    // Instagram and TikTok accept no URL-prefilled share from a browser, so for
    // those the link goes to the clipboard and the toast says to paste it.
    if (entry.mode === 'copy') {
      await copyLink(entry.channel);
      return;
    }
    const url = buildInviteUrl(origin, code, entry.channel);
    window.open(buildShareIntentUrl(entry.channel, url, shareText), '_blank', 'noopener,noreferrer');
  };

  const stats = [
    { key: 'joined', label: t('referrals.friendsJoined', 'Friends joined'), value: data?.referrals ?? 0 },
    { key: 'saving', label: t('referrals.friendsSaving', 'Friends saving'), value: data?.activeReferrals ?? 0 },
  ];

  return (
    <MockedSubPageLayout
      title={t('referrals.invite', 'Invite friends')}
      subtitle={t('referrals.description', 'Share your link. We keep track of everyone who joins through it.')}
      onBack={onBack}
      showSoonBadge={false}
    >
      <section className="rounded-md border border-black border-b-2 bg-white">
        {stats.map((stat, index) => (
          <div
            key={stat.key}
            className={`flex items-center justify-between gap-3 px-4 py-3 ${index > 0 ? 'border-t border-black/10' : ''}`}
          >
            <span className="flex items-center gap-2 text-sm text-gray-600">
              <FiUsers className="h-4 w-4 text-gray-500" />
              {stat.label}
            </span>
            <span className="text-base font-bold tabular-nums text-black">{isLoading ? '—' : stat.value}</span>
          </div>
        ))}
      </section>

      {/* --- The invite card. The tag is the headline and the link is the small
          print under it, because at an event the tag is what gets said out loud
          and the URL is only how a phone gets there. Tapping the tag copies the
          link, same as the button — the whole block is one target. --- */}
      <section className="flex flex-col gap-3 rounded-md border border-black border-b-2 bg-[#6E56CF] px-4 py-4 text-white">
        <h2 className="text-sm font-bold">{t('referrals.inviteWithTag', 'Invite your friends with your vaquitatag')}</h2>

        <button
          type="button"
          disabled={!hasCode}
          onClick={() => void copyLink('copy')}
          aria-label={t('referrals.copyLink', 'Copy link')}
          className={`${FOCUS_RING_CLASSES} flex items-center gap-3 rounded-md border border-black border-b-2 bg-white/15 px-3 py-2.5 text-left disabled:opacity-60`}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-lg font-bold leading-tight">
              {isLoading ? '…' : hasCode ? `@${code}` : '—'}
            </span>
            <span className="block truncate text-[11px] text-white/70">{displayUrl || ' '}</span>
          </span>
          {copied === 'copy' ? <FiCheck className="h-5 w-5 shrink-0" /> : <FiCopy className="h-5 w-5 shrink-0" />}
        </button>

        <div className="flex gap-2">
          <PressableButton size="md" variant="white" fullWidth disabled={!hasCode} onClick={() => void shareLink()}>
            <span className="flex items-center justify-center gap-2">
              <FiShare2 className="h-4 w-4" />
              {t('referrals.shareLink', 'Share link')}
            </span>
          </PressableButton>
          <PressableButton size="md" variant="white" fullWidth disabled={!hasCode} onClick={() => setQrOpen(true)}>
            <span className="flex items-center justify-center gap-2">
              <FiGrid className="h-4 w-4" />
              {t('referrals.shareQr', 'Share QR')}
            </span>
          </PressableButton>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2">
        {CHANNELS.map((entry) => (
          <PressableButton
            key={entry.channel}
            size="md"
            variant="white"
            fullWidth
            disabled={!hasCode}
            onClick={() => void share(entry)}
          >
            <span className="flex items-center justify-center gap-2">
              {copied === entry.channel ? <FiCheck className="h-4 w-4" /> : entry.icon}
              {t(`referrals.channels.${entry.channel}`)}
            </span>
          </PressableButton>
        ))}
      </section>

      <PressableButton size="md" variant="white" fullWidth onClick={() => setBoardOpen(true)}>
        <span className="flex w-full items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <FiAward className="h-4 w-4" />
            {t('referrals.board.open', 'See the top inviters')}
          </span>
          <FiChevronRight className="h-4 w-4" />
        </span>
      </PressableButton>

      <p className="px-1 text-sm text-gray-600">
        {t('referrals.rewardsComing', "Rewards for inviting are coming. We're already counting yours.")}
      </p>

      <InviteQrModal open={qrOpen} onClose={() => setQrOpen(false)} tag={code} url={buildInviteUrl(origin, code, 'qr')} />

      <StackedPanelModal
        open={boardOpen}
        onClose={() => setBoardOpen(false)}
        url="/profile/invite/leaderboard"
        title={t('referrals.board.title', 'Top inviters')}
      >
        <ReferrerLeaderboardPage onBack={() => setBoardOpen(false)} />
      </StackedPanelModal>
    </MockedSubPageLayout>
  );
}

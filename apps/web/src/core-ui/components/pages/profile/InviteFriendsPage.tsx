'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheck, FiCopy, FiInstagram, FiMessageCircle, FiMusic, FiSend, FiUsers } from 'react-icons/fi';
import { useReferralSummary } from '../../../hooks';
import { addSuccessToast } from '../../molecules/toast';
import { PressableButton } from '../../molecules/PressableButton';
import { MockedSubPageLayout } from './MockedSubPageLayout';
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
 * Counts and a link, and nothing that is not yet true. The service still returns
 * an APY bonus and an earnings pair, but no rate anywhere applies the bonus and
 * no payout ledger exists, so neither is rendered — the closing line says
 * rewards are coming instead of showing a `$0.00` that would read as a promise.
 *
 * Every button stamps its own `utm_source` before the link is copied or shared,
 * which is what makes the channel breakdown in the metrics dashboard possible.
 */
export function InviteFriendsPage({ onBack }: { onBack?: () => void } = {}) {
  const { t } = useTranslation();
  const { data, isLoading } = useReferralSummary();
  const [copied, setCopied] = useState<ShareChannel | null>(null);

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

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-xs font-extrabold uppercase tracking-wider text-gray-500">
          {t('referrals.yourLink', 'Your link')}
        </h2>
        <div className="flex items-center gap-2 rounded-md border border-black border-b-2 bg-white px-4 py-3">
          <span className="min-w-0 flex-1 truncate font-mono text-sm text-black">{isLoading ? '…' : displayUrl || '—'}</span>
          <PressableButton
            size="chip"
            variant="primary"
            disabled={!hasCode}
            onClick={() => void copyLink('copy')}
            ariaLabel={t('referrals.copyLink', 'Copy link')}
          >
            <span className="flex items-center gap-1.5">
              {copied === 'copy' ? <FiCheck className="h-4 w-4" /> : <FiCopy className="h-4 w-4" />}
              {copied === 'copy' ? t('referrals.copied', 'Link copied') : t('referrals.copyLink', 'Copy link')}
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

      <p className="px-1 text-sm text-gray-600">
        {t('referrals.rewardsComing', "Rewards for inviting are coming. We're already counting yours.")}
      </p>
    </MockedSubPageLayout>
  );
}

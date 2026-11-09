'use client';

import type { ActivityItem } from '@/core-ui/helpers/activity';
import { formatTokenCompact } from '@/core-ui/helpers/numbers';
import { useNicknamesByAddress } from '@/core-ui/hooks/profile/useNicknamesByAddress';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { IconType } from 'react-icons';
import { FiArrowDownLeft, FiArrowUpRight, FiAward, FiCheckCircle, FiFileText, FiPocket, FiTrendingUp } from 'react-icons/fi';
import { formatTransactionTime } from './TransactionRow';

/**
 * Who the other side of a payment is: `@username` when the address belongs to
 * a Vaquita profile, the shortened address otherwise (and while it loads).
 */
export function useCounterpartyName(item: ActivityItem | null | undefined): string | null {
  const address = item?.counterpartyAddress ?? null;
  const addresses = useMemo(() => (address ? [address] : []), [address]);
  const { nicknames } = useNicknamesByAddress(addresses);
  const nickname = address ? nicknames.get(address) : null;
  return nickname ? `@${nickname}` : (item?.counterparty ?? null);
}

/**
 * How a movement read from the wallet's history is told to the user: its
 * icon, its name, the line under it and the sign of its amount. Money that
 * comes back to the wallet is green with a plus; money that leaves it carries
 * a minus. One place for it, so the home, the Transactions list and a
 * movement's own page say the same thing.
 */
export function useActivityMeta() {
  const { t } = useTranslation();
  const META: Record<ActivityItem['kind'], { icon: IconType; label: string; sign: '+' | '-' | ''; box: string }> = {
    received: { icon: FiArrowDownLeft, label: t('dashboard.activity.received', 'Received'), sign: '+', box: 'bg-success/25' },
    sent: { icon: FiArrowUpRight, label: t('dashboard.activity.sent', 'Sent'), sign: '-', box: 'bg-primary/30' },
    flexibleIn: {
      icon: FiTrendingUp,
      label: t('dashboard.activity.flexibleIn', 'Added to savings'),
      sign: '-',
      box: 'bg-primary/30',
    },
    flexibleOut: {
      icon: FiTrendingUp,
      label: t('dashboard.activity.flexibleOut', 'Withdrawn from savings'),
      sign: '+',
      box: 'bg-success/25',
    },
    lockedIn: { icon: FiPocket, label: t('dashboard.activity.lockedIn', 'Invested for a term'), sign: '-', box: 'bg-primary/30' },
    lockedOut: { icon: FiPocket, label: t('dashboard.activity.lockedOut', 'Withdrawn from a term'), sign: '+', box: 'bg-success/25' },
    badge: { icon: FiAward, label: t('dashboard.activity.badge', 'Badge claimed'), sign: '', box: 'bg-[#FFF7E6]' },
    trust: { icon: FiCheckCircle, label: t('dashboard.activity.trust', 'Asset enabled'), sign: '', box: 'bg-[#FFF7E6]' },
    other: { icon: FiFileText, label: t('dashboard.activity.other', 'Operation'), sign: '', box: 'bg-background' },
  };
  const subtitleOf = (item: ActivityItem, who: string) => {
    if (item.kind === 'received') return t('dashboard.activity.from', 'From {{who}}', { who });
    if (item.kind === 'sent') return t('dashboard.activity.to', 'To {{who}}', { who });
    // The title already says which savings; the line under it says where the money came from or went.
    if (item.kind === 'flexibleIn' || item.kind === 'lockedIn') return t('dashboard.activity.fromWallet', 'From your wallet');
    if (item.kind === 'flexibleOut' || item.kind === 'lockedOut') return t('dashboard.activity.toWallet', 'To your wallet');
    if (item.kind === 'badge') return t('dashboard.activity.badges', 'Badges');
    if (item.kind === 'trust') return item.asset ?? item.summary;
    return item.summary;
  };
  /** `who`: the counterparty's name from `useCounterpartyName`, else its short address. */
  return (item: ActivityItem, who?: string | null) => {
    const meta = META[item.kind];
    return {
      Icon: meta.icon,
      title: item.kind === 'other' ? item.summary : meta.label,
      subtitle: subtitleOf(item, who ?? item.counterparty ?? ''),
      sign: meta.sign,
      box: meta.box,
    };
  };
}

/**
 * Row of a movement read from the wallet's history. Same shape as
 * `TransactionRow`, and it lives in the same `TransactionList`.
 */
export function ActivityRow({
  item,
  onPress,
  hideBalance = false,
}: {
  item: ActivityItem;
  onPress?: () => void;
  hideBalance?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const who = useCounterpartyName(item);
  const { Icon, title, subtitle, sign, box } = useActivityMeta()(item, who);
  const failed = item.status === 'FAILED';
  // Nothing moved: no sign, struck through, like a failed row of the list.
  const amountColor = failed ? 'text-gray-400 line-through' : sign === '+' ? 'text-success' : 'text-black';

  return (
    <li>
      <button
        type="button"
        onClick={onPress}
        className={
          'flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors ' +
          (onPress ? 'cursor-pointer hover:bg-black/5 active:bg-black/10' : 'cursor-default')
        }
      >
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-black text-black ${box}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[13px] font-bold text-black">{title}</p>
            {item.status !== 'SUCCESS' && (
              <span
                className={
                  'shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ' +
                  (item.status === 'PENDING'
                    ? 'border-black/20 bg-primary/20 text-black'
                    : 'border-red-300 bg-red-100 text-red-700')
                }
              >
                {item.status === 'PENDING'
                  ? t('dashboard.activity.pending', 'Pending')
                  : t('dashboard.activity.failedTx', 'Not completed')}
              </span>
            )}
          </div>
          <p className="truncate text-[11px] text-gray-600">{subtitle}</p>
        </div>
        {/* Capped and truncated: whatever the record brings as amount or asset,
            this column can never push the title out or widen the card. */}
        <div className="min-w-0 max-w-[60%] shrink-0 text-right">
          {item.amount !== null && (
            <p className={`truncate text-[13px] font-bold tabular-nums ${amountColor}`}>
              {hideBalance
                ? '••••'
                : `${failed ? '' : sign}${formatTokenCompact(item.amount, 2)} ${item.asset ?? ''}`.trim()}
            </p>
          )}
          <p className="text-[10px] text-gray-500">{formatTransactionTime(item.timestamp, i18n.language)}</p>
        </div>
      </button>
    </li>
  );
}

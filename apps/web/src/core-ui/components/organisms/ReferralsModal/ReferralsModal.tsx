'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheck, FiClock, FiCopy, FiShare2, FiUsers, FiZap } from 'react-icons/fi';
import { useConfigStore } from '../../../stores';
import { AppModal } from '../../molecules/AppModal';
import { REFERRAL_TIERS, useReferralBoost } from './referralBoost';
import { ReferralsModalProps } from './types';

/**
 * Referidos — solo frontend. Explica cómo el APY sube por tramos según los
 * referidos activos y entrega el código para invitar.
 */
export function ReferralsModal({ open, onOpenChange }: ReferralsModalProps) {
  const { t } = useTranslation();
  const { walletAddress } = useConfigStore();
  const { activeReferrals, apyBonus, totalEarnings, pendingEarnings, code, nextTier } =
    useReferralBoost(walletAddress);
  const [copied, setCopied] = useState(false);

  const inviteUrl = typeof window === 'undefined' ? '' : `${window.location.origin}/?ref=${code}`;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Sin permiso de portapapeles no hacemos nada: el código está a la vista.
    }
  };

  const invite = async () => {
    const shareText = t('referrals.shareText', 'Save with me on Vaquita and earn rewards. Use my code {{code}}', {
      code,
    });
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Vaquita', text: shareText, url: inviteUrl });
        return;
      } catch {
        // Cancelado por el usuario: caemos al copiado.
      }
    }
    try {
      await navigator.clipboard.writeText(`${shareText} ${inviteUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignorado a propósito.
    }
  };

  const stats = [
    {
      key: 'active',
      icon: <FiUsers className="w-4 h-4 text-gray-500" />,
      label: t('referrals.activeReferrals', 'Active referrals'),
      value: <span className="text-xs font-bold text-black tabular-nums">{activeReferrals}</span>,
    },
    {
      key: 'bonus',
      icon: <FiZap className="w-4 h-4 text-[#8b5cf6]" />,
      label: t('referrals.apyBonus', 'APY Bonus'),
      value: <span className="text-xs font-bold text-[#7c3aed] tabular-nums">+{apyBonus.toFixed(2)}%</span>,
    },
    {
      key: 'total',
      icon: <FiUsers className="w-4 h-4 text-gray-500" />,
      label: t('referrals.totalEarnings', 'Total referral earnings'),
      value: <span className="text-xs font-bold text-black tabular-nums">${totalEarnings.toFixed(2)}</span>,
    },
    {
      key: 'pending',
      icon: <FiClock className="w-4 h-4 text-gray-500" />,
      label: t('referrals.pendingEarnings', 'Pending referral earnings'),
      value: <span className="text-xs font-bold text-black tabular-nums">${pendingEarnings.toFixed(2)}</span>,
    },
  ];

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('referrals.title', 'Referrals')}
      size="md"
      fullScreen
      footer={
        <button
          type="button"
          onClick={invite}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-black border-b-2 bg-primary py-3 text-sm font-bold text-black transition hover:-translate-y-0.5"
        >
          {t('referrals.invite', 'Invite friends')}
          <FiShare2 className="h-4 w-4" />
        </button>
      }
    >
      <div className="space-y-4 mb-2">
        {/* Hero — ganancias por referidos */}
        <div className="rounded-xl border border-black border-b-2 bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] px-4 py-4 text-white">
          <div className="text-3xl font-extrabold leading-none tabular-nums">${totalEarnings.toFixed(2)}</div>
          <div className="mt-1 text-xs font-semibold text-white/80">
            {t('referrals.earningsLabel', 'Referral earnings')}
          </div>
        </div>

        <p className="text-xs text-gray-600 leading-relaxed">
          {t(
            'referrals.description',
            'Earn recurring rewards as your friends save. Each active referral adds extra APY on top of your base rate.',
          )}
        </p>

        {/* Métricas */}
        <div className="divide-y divide-black/10 rounded-xl border border-black border-b-2 bg-white">
          {stats.map(({ key, icon, label, value }) => (
            <div key={key} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                {icon}
                <span className="text-xs text-gray-700 truncate">{label}</span>
              </div>
              {value}
            </div>
          ))}
        </div>

        {/* Tramos de bonus */}
        <div className="rounded-xl border border-black border-b-2 bg-white p-4 space-y-3">
          <h3 className="text-xs font-bold text-black uppercase tracking-wide">{t('referrals.tiersTitle', 'Boost tiers')}</h3>
          <ul className="space-y-2">
            {REFERRAL_TIERS.map((tier) => {
              const reached = activeReferrals >= tier.referrals;
              return (
                <li key={tier.referrals} className="flex items-center justify-between gap-3">
                  <span className={'text-xs ' + (reached ? 'font-bold text-black' : 'text-gray-600')}>
                    {t('referrals.tierLabel', {
                      count: tier.referrals,
                      defaultValue_one: '{{count}} active referral',
                      defaultValue_other: '{{count}} active referrals',
                    })}
                  </span>
                  <span
                    className={
                      'rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums ' +
                      (reached ? 'bg-[#7c3aed]/15 text-[#7c3aed]' : 'bg-black/5 text-gray-500')
                    }
                  >
                    +{tier.bonus.toFixed(2)}% APY
                  </span>
                </li>
              );
            })}
          </ul>
          {nextTier && (
            <p className="text-xs text-gray-500">
              {t('referrals.nextTier', 'Invite {{count}} more to reach +{{bonus}}% APY', {
                count: nextTier.referrals - activeReferrals,
                bonus: nextTier.bonus.toFixed(2),
              })}
            </p>
          )}
        </div>

        {/* Código */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-black uppercase tracking-wide">{t('referrals.yourCode', 'Your referral code')}</p>
          <button
            type="button"
            onClick={copyCode}
            className="flex w-full items-center justify-between gap-3 rounded-md border border-black border-b-2 bg-white px-4 py-3 transition hover:bg-gray-50"
          >
            <span className="text-base font-bold tracking-[0.2em] text-black">{code}</span>
            {copied ? (
              <FiCheck className="h-4 w-4 text-success" />
            ) : (
              <FiCopy className="h-4 w-4 text-gray-500" />
            )}
          </button>
        </div>
      </div>
    </AppModal>
  );
}

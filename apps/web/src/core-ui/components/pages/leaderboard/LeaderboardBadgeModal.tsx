'use client';

import { stellarExpertTxUrl } from '@/networks/stellar/helpers';
import Image from 'next/image';
import { useTranslation } from 'react-i18next';
import type { Badge } from '../../../data/profile-badges';
import { useProfileData } from '../../../hooks';
import { useConfigStore } from '../../../stores';
import { AppModal } from '../../molecules/AppModal';

interface LeaderboardBadgeModalProps {
  badge: Badge | null;
  /** Hash on-chain del mint de ESTE perfil (null si no está minteado). */
  txHash: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatDate = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

/**
 * Detalle read-only de un logro de OTRO jugador (header del leaderboard):
 * qué significa y cuándo lo desbloqueó. Sin claim/mint/share — eso vive en
 * AchievementModal para el perfil propio. Si el ESPECTADOR tiene el modo
 * cripto activado (cryptoSavvy) y el dueño lo minteó on-chain, se muestra el
 * link a la transacción en stellar.expert.
 *
 * Usa el AppModal genérico: hoja inferior (bottom-sheet) con la misma
 * animación de entrada/salida que el resto de la app.
 */
export function LeaderboardBadgeModal({ badge, txHash, open, onOpenChange }: LeaderboardBadgeModalProps) {
  const { t } = useTranslation();
  const { network } = useConfigStore();
  // cryptoSavvy del ESPECTADOR (su propio perfil), no del perfil visitado.
  const { data: viewerProfile } = useProfileData();
  const cryptoMode = viewerProfile?.cryptoSavvy ?? false;

  if (!badge) return null;

  const title = t(`achievements.items.${badge.id}.title`, badge.title);
  const description = t(`achievements.items.${badge.id}.description`, badge.description);
  const showTx = cryptoMode && !!txHash;
  const networkLabel = network?.type === 'mainnet' ? 'Mainnet' : 'Testnet';

  return (
    <AppModal open={open} onOpenChange={() => onOpenChange(false)} title={title} size="sm">
      <div className="flex flex-col items-center gap-3 text-center pb-2">
        <div className="relative flex h-32 w-32 items-center justify-center">
          <span
            aria-hidden
            className="absolute inset-4 rounded-full blur-2xl opacity-55"
            style={{ background: badge.accent ?? 'linear-gradient(180deg, #FFD64A 0%, #F5A161 100%)' }}
          />
          <Image src={badge.icon} alt={title} fill sizes="128px" className="relative object-contain drop-shadow-xl" />
        </div>

        {badge.date && (
          <span className="inline-flex items-center text-[11px] font-bold uppercase tracking-wider bg-primary/30 text-[#7A3E00] rounded-full px-3 py-1">
            {formatDate(badge.date)}
          </span>
        )}

        <p className="text-sm text-gray-700 leading-relaxed max-w-xs">{description}</p>

        {/* Modo cripto: transacción del mint on-chain de este jugador. */}
        {showTx && txHash && (
          <div className="flex items-center justify-center gap-2 flex-wrap pt-2 border-t border-black/10 w-full">
            <span className="text-xs font-semibold text-gray-600">
              {t('achievements.detail.viewOnStellarExpert', 'View on Stellar Expert')}
            </span>
            <a
              href={stellarExpertTxUrl(txHash, network?.type)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono font-semibold text-primary underline underline-offset-2 hover:text-primary/80 transition"
            >
              {`${txHash.slice(0, 6)}…${txHash.slice(-4)}`}
            </a>
            <span className="text-[10px] font-bold uppercase tracking-wide bg-white text-gray-600 border border-black/20 rounded-full px-2 py-0.5">
              {networkLabel}
            </span>
          </div>
        )}
      </div>
    </AppModal>
  );
}

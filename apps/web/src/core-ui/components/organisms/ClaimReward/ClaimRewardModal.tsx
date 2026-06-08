'use client';

import { usePollar } from '@pollar/react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheckCircle } from 'react-icons/fi';
import { Button } from '../../atoms';
import { AppModal } from '../../molecules/AppModal';

interface ClaimRewardModalProps {
  /** Se llama al reclamar, saltar, o cuando no hay nada que reclamar. */
  onDone: () => void;
}

interface Reward {
  id: string;
  amount: string;
  asset: string;
}

const formatAmount = (amount: string) =>
  Number(amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/**
 * Regalo de bienvenida estilo Vaquita: ofrece reclamar el bono one-time de
 * Pollar (ej. 1 USDC) para probar la app. Si no hay nada reclamable (ya cobrado
 * o no elegible), se cierra solo via `onDone`.
 */
export function ClaimRewardModal({ onDone }: ClaimRewardModalProps) {
  const { t } = useTranslation();
  const { getClient } = usePollar();

  const [reward, setReward] = useState<Reward | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Centrado solo en desktop; en celular/tablet queda abajo (default de HeroUI).
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rules = await getClient().listDistributionRules();
        if (!active) return;
        const claimable = rules.find((r) => r.claimable);
        if (!claimable) {
          onDone();
          return;
        }
        setReward({ id: claimable.id, amount: claimable.amount, asset: claimable.assetCode });
        setLoading(false);
      } catch {
        // Si no podemos consultar (Pollar no listo, red, etc.), no trabamos al usuario.
        if (active) onDone();
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClaim = async () => {
    if (!reward) return;
    setClaiming(true);
    setError(null);
    try {
      await getClient().claimDistributionRule({ ruleId: reward.id });
      setClaimed(true);
    } catch {
      setError(t('rewards.claim.error', 'Could not claim right now. Please try again.'));
    } finally {
      setClaiming(false);
    }
  };

  // Mientras consultamos (o si no había nada reclamable) no renderizamos nada.
  if (loading || !reward) return null;

  const label = `${formatAmount(reward.amount)} ${reward.asset}`;

  return (
    <AppModal
      open
      onOpenChange={() => {}}
      isDismissable={false}
      hideClose
      title={t('rewards.claim.title', 'A gift for you')}
      titleIcon="/icons/global/coin.png"
      titleIconAlt={t('rewards.claim.giftAlt', 'gift')}
      size="sm"
      placement={isDesktop ? 'center' : undefined}
      bodyClassName="flex flex-col items-center gap-4 pb-2 text-center"
      footer={
        claimed ? (
          <Button type="primary" wFull onPress={onDone}>
            {t('rewards.claim.letsGo', "Let's go")}
          </Button>
        ) : (
          <Button
            type="primary"
            wFull
            onPress={handleClaim}
            isLoading={claiming}
            className="bg-success border-[#018222] text-black"
          >
            {t('rewards.claim.claimButton', 'Claim {{label}}', { label })}
          </Button>
        )
      }
    >
      <div className="relative h-28 w-28">
        <Image src="/vaquita/vaquita_isotipo.svg" alt="Vaquita" fill sizes="112px" className="object-contain" priority />
        {/* decorative coin overlay */}
        <div className="absolute -bottom-1 -right-1 h-12 w-12">
          <Image src="/icons/global/coin.png" alt="" fill sizes="48px" className="object-contain drop-shadow" />
        </div>
      </div>

      {claimed ? (
        <>
          <div className="flex items-center gap-2 text-success">
            <FiCheckCircle size={22} />
            <span className="text-lg font-bold">{t('rewards.claim.onItsWay', '{{label}} is on its way', { label })}</span>
          </div>
          <p className="text-sm text-black/60">{t('rewards.claim.enjoy', 'Enjoy exploring Vaquita.')}</p>
        </>
      ) : (
        <>
          <h2 className="text-xl font-bold text-black">{t('rewards.claim.forYou', '{{label}} for you', { label })}</h2>
          <p className="text-sm leading-relaxed text-black/60">{t('rewards.claim.welcomeBalance', 'A welcome balance to try Vaquita. Claim it to get started.')}</p>
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        </>
      )}
    </AppModal>
  );
}

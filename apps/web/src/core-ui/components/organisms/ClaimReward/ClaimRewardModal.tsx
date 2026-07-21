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
 *
 * Antes de poder reclamar, los assets configurados en la app deben tener su
 * trustline activado. Mientras falte alguno, el mismo modal muestra el botón
 * para activarlo en lugar del botón de claim.
 */
export function ClaimRewardModal({ onDone }: ClaimRewardModalProps) {
  const { t } = useTranslation();
  const { getClient, enabledAssets, refreshAssets, setTrustline, walletType, login } = usePollar();

  const [reward, setReward] = useState<Reward | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [activating, setActivating] = useState(false);
  // Cuando una wallet externa (Freighter) perdió la autorización del origen, el
  // `setTrustline` falla; mostramos un botón para re-autorizar vía Pollar.
  const [showReconnect, setShowReconnect] = useState(false);
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
        // Cargamos el estado de trustlines junto con las reglas reclamables.
        await refreshAssets();
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

  // Assets habilitados en la app cuyo trustline aún no está activado en la wallet.
  // (XLM nativo siempre viene con trustlineEstablished=true, así que nunca aparece.)
  const pendingTrustlines =
    enabledAssets.step === 'loaded'
      ? enabledAssets.data.assets.filter((a) => a.enabledInApp && !a.trustlineEstablished && a.issuer)
      : [];
  const needsTrustline = pendingTrustlines.length > 0;
  const pendingLabel = pendingTrustlines.map((a) => a.code).join(', ');

  const handleActivateTrustlines = async () => {
    if (!needsTrustline) return;
    setActivating(true);
    setError(null);
    setShowReconnect(false);
    try {
      for (const asset of pendingTrustlines) {
        // eslint-disable-next-line no-await-in-loop
        const outcome = await setTrustline({ code: asset.code, issuer: asset.issuer! }, { sponsored: asset.sponsored });
        if (outcome.status === 'error') {
          throw new Error(outcome.details ?? 'trustline failed');
        }
      }
      // Re-sincroniza el estado: si todos quedaron activos, se muestra el claim.
      await refreshAssets();
    } catch {
      setError(t('rewards.claim.trustlineError', 'Could not activate the trustline. Please try again.'));
      // Solo las wallets externas pueden quedar con el origen desautorizado en
      // Freighter ("not connected"). Las custodiales (walletType === null) no.
      if (walletType) setShowReconnect(true);
    } finally {
      setActivating(false);
    }
  };

  // Re-ejecuta el connect()→requestAccess del adapter vía Pollar para volver a
  // autorizar el origen en Freighter, sin necesidad de logout/login manual.
  const handleReconnect = () => {
    if (!walletType) return;
    setError(null);
    setShowReconnect(false);
    login({ provider: 'wallet', type: walletType });
  };

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

  const renderFooter = () => {
    if (claimed) {
      return (
        <Button type="primary" wFull onPress={onDone}>
          {t('rewards.claim.letsGo', "Let's go")}
        </Button>
      );
    }
    if (needsTrustline) {
      if (showReconnect) {
        return (
          <Button type="primary" wFull onPress={handleReconnect}>
            {t('rewards.claim.reconnectButton', 'Reconnect wallet')}
          </Button>
        );
      }
      return (
        <Button type="primary" wFull onPress={handleActivateTrustlines} isLoading={activating}>
          {t('rewards.claim.activateButton', 'Activate {{asset}} trustline', { asset: pendingLabel })}
        </Button>
      );
    }
    return (
      <Button
        type="primary"
        wFull
        onPress={handleClaim}
        isLoading={claiming}
        className="bg-success border-[#018222] text-black"
      >
        {t('rewards.claim.claimButton', 'Claim {{label}}', { label })}
      </Button>
    );
  };

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
      footer={renderFooter()}
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
      ) : needsTrustline ? (
        <>
          <h2 className="text-xl font-bold text-black">{t('rewards.claim.forYou', '{{label}} for you', { label })}</h2>
          <p className="text-sm leading-relaxed text-black/60">
            {showReconnect
              ? t('rewards.claim.reconnectHint', 'Your wallet got disconnected from this site. Reconnect it to continue.')
              : t('rewards.claim.trustlineNeeded', 'First activate the {{asset}} trustline so your wallet can receive it.', {
                  asset: pendingLabel,
                })}
          </p>
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        </>
      ) : (
        <>
          <h2 className="text-xl font-bold text-black">{t('rewards.claim.forYou', '{{label}} for you', { label })}</h2>
          <p className="text-sm leading-relaxed text-black/60">
            {t('rewards.claim.welcomeBalance', 'A welcome balance to try Vaquita. Claim it to get started.')}
          </p>
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        </>
      )}
    </AppModal>
  );
}

'use client';

import { Spinner } from '@heroui/react';
import { usePollar } from '@pollar/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronRight, FiExternalLink, FiInfo } from 'react-icons/fi';
import { useUsdcTrustline } from '@/core-ui/hooks/useUsdcTrustline';
import { blendConfigForToken } from '@/networks/stellar/blendDirect';
import { useConfigStore } from '../../../stores';
import type { DepositPlatformDTO } from '../../../types';
import { AppModal } from '../../molecules/AppModal';
import { PressableButton } from '../../molecules/PressableButton';
import { UsdcTrustlineGate } from '../../molecules/UsdcTrustlineGate';
import { TUTORIALS } from './tutorials';

type Step = 'picker' | 'other' | 'trustline' | 'tutorial';

interface OtherAppDepositModalProps {
  open: boolean;
  onOpenChange: () => void;
  /** Back desde el primer paso: vuelve al selector de método. */
  onBack: () => void;
  /**
   * Cierra este modal y abre la dirección del usuario. Con plataforma, el sheet
   * de recibir muestra su checklist y deja la espera abierta; sin ella (otra
   * app que manda USDC en Stellar) es el recibir de siempre.
   */
  onShowAddress: (platform: DepositPlatformDTO | null) => void;
  /** Abre directo en el tutorial de esta plataforma ("Ver los pasos" del home). */
  initialPlatformId?: string | null;
}

/** Logo provisorio: la inicial en un círculo, hasta tener los de cada app. */
function PlatformMark({ name }: { name: string }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black bg-white text-base font-extrabold text-black">
      {name.charAt(0)}
    </span>
  );
}

/**
 * "Depositar desde otra app": el usuario tiene dólares en Binance, Meru, etc. y
 * los quiere traer a Vaquita. Elige la app, y si su wallet todavía no puede
 * recibir USDC la activa (E4); después ve cómo se retira desde esa app y pasa a
 * su dirección.
 *
 * Sólo las plataformas 'direct' (USDC en Stellar) tienen camino en esta fase.
 * Las 'bridge' (USDT en Polygon) necesitan el bridge nuevo y se filtran acá
 * aunque alguien las prenda en el catálogo antes de tiempo.
 */
export function OtherAppDepositModal({
  open,
  onOpenChange,
  onBack,
  onShowAddress,
  initialPlatformId,
}: OtherAppDepositModalProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { network, token, walletAddress } = useConfigStore();
  const { wallet } = usePollar();
  const platforms = (network?.depositPlatforms ?? []).filter((p) => p.tier === 'direct');
  const initialPlatform = platforms.find((p) => p.id === initialPlatformId) ?? null;

  const [rawStep, setStep] = useState<Step>(initialPlatform ? 'tutorial' : 'picker');
  const [platform, setPlatform] = useState<DepositPlatformDTO | null>(initialPlatform);

  // La dirección que recibe es la misma que muestra el sheet de recibir.
  const receiver = wallet?.address ?? walletAddress ?? null;
  const usdcIssuer = blendConfigForToken(token)?.usdcIssuer;
  const trustline = useUsdcTrustline(open ? receiver : null, usdcIssuer);

  // Activada la trustline, sigue solo al tutorial: el botón ya hizo su trabajo.
  const step: Step = rawStep === 'trustline' && trustline.data === 'ok' ? 'tutorial' : rawStep;

  const pick = (next: DepositPlatformDTO) => {
    setPlatform(next);
    // Sin trustline el retiro desde la app rebota, y la plata vuelve (o no) según
    // la app. Se pregunta antes del tutorial para no mandarlo a retirar en vano.
    setStep(trustline.data === 'ok' ? 'tutorial' : 'trustline');
  };

  const pickerStep = (
    <div className="flex flex-col gap-2">
      <p className="text-center text-sm text-gray-500">{t('deposit.otherApp.picker.subtitle', 'Where is your money now?')}</p>
      {platforms.map((p) => (
        <PressableButton key={p.id} variant="white" size="row" onClick={() => pick(p)}>
          <PlatformMark name={p.name} />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-black">{p.name}</span>
            <span className="block text-xs text-gray-500">
              {t('deposit.otherApp.picker.rail', '{{asset}} on {{network}}', {
                asset: p.asset,
                network: t(`deposit.otherApp.networks.${p.network}`, p.network),
              })}
            </span>
          </span>
          <FiChevronRight className="h-5 w-5 shrink-0 text-gray-400" />
        </PressableButton>
      ))}
      <PressableButton variant="white" size="row" onClick={() => setStep('other')}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-black text-lg font-bold text-black">
          +
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-black">
            {t('deposit.otherApp.picker.otherTitle', 'Another app or wallet')}
          </span>
          <span className="block text-xs text-gray-500">
            {t('deposit.otherApp.picker.otherSubtitle', 'Send USDC from anywhere')}
          </span>
        </span>
        <FiChevronRight className="h-5 w-5 shrink-0 text-gray-400" />
      </PressableButton>
    </div>
  );

  const otherStep = (
    <div className="flex flex-col gap-2">
      <p className="text-center text-sm text-gray-500">
        {t('deposit.otherApp.other.subtitle', 'Which network can your app send USDC on?')}
      </p>
      <PressableButton variant="white" size="row" onClick={() => onShowAddress(null)}>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-black">
            {t('deposit.otherApp.other.stellarTitle', 'USDC on Stellar')}
          </span>
          <span className="block text-xs text-gray-500">
            {t('deposit.otherApp.other.stellarSubtitle', 'Send it straight to your address')}
          </span>
        </span>
        <FiChevronRight className="h-5 w-5 shrink-0 text-gray-400" />
      </PressableButton>
      <PressableButton
        variant="white"
        size="row"
        onClick={() => {
          onOpenChange();
          router.push('/profile/wallet?bridge=1');
        }}
      >
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-black">{t('deposit.otherApp.other.baseTitle', 'USDC on Base')}</span>
          <span className="block text-xs text-gray-500">
            {t('deposit.otherApp.other.baseSubtitle', 'We convert it to Stellar with the bridge')}
          </span>
        </span>
        <FiChevronRight className="h-5 w-5 shrink-0 text-gray-400" />
      </PressableButton>
      <div className="flex items-start gap-1.5 pt-1 text-xs text-gray-500">
        <FiInfo className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          {t(
            'deposit.otherApp.other.warning',
            'Sending on any other network loses the money. If you are not sure, ask your app which networks it supports.',
          )}
        </p>
      </div>
    </div>
  );

  const trustlineStep = (
    <div className="flex flex-col gap-3">
      {trustline.isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner size="md" />
        </div>
      ) : (
        <>
          <p className="text-center text-sm text-gray-500">
            {t(
              'deposit.otherApp.trustline.subtitle',
              'Before {{name}} can send you USDC, your wallet has to accept it. It is a one-time step and it is free.',
              { name: platform?.name ?? '' },
            )}
          </p>
          <UsdcTrustlineGate
            address={receiver}
            issuer={usdcIssuer}
            message={t('deposit.otherApp.trustline.notice', 'Your wallet cannot receive USDC yet.')}
          />
        </>
      )}
    </div>
  );

  const steps = platform ? (TUTORIALS[platform.id] ?? []) : [];
  const tutorialStep = platform ? (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-3">
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black text-xs font-bold text-white">
              {i + 1}
            </span>
            <span className="flex-1 pt-0.5 text-sm text-black">
              {t(`deposit.otherApp.platforms.${platform.id}.steps.${s.key}`, s.fallback)}
              {s.image ? (
                // Captura de la app, cuando exista (ver `tutorials.ts`).
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.image} alt="" className="mt-2 w-full rounded-lg border border-black/10" />
              ) : null}
            </span>
          </li>
        ))}
      </ol>

      {platform.fee || platform.minAmount ? (
        <div className="rounded-lg border border-black border-b-2 bg-white px-4 py-2.5 text-sm">
          {platform.fee ? (
            <div className="flex justify-between py-1">
              <span className="text-gray-500">
                {t('deposit.otherApp.tutorial.fee', '{{name}} fee', { name: platform.name })}
              </span>
              <span className="font-bold text-black">{platform.fee}</span>
            </div>
          ) : null}
          {platform.minAmount ? (
            <div className="flex justify-between py-1">
              <span className="text-gray-500">{t('deposit.otherApp.tutorial.min', 'Minimum')}</span>
              <span className="font-bold text-black">
                {platform.minAmount} {platform.asset}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {platform.helpLinks.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-gray-500">
            {t('deposit.otherApp.tutorial.help', 'Help from {{name}}', { name: platform.name })}
          </p>
          {platform.helpLinks.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm font-semibold text-black underline underline-offset-2"
            >
              {t(`deposit.otherApp.platforms.${platform.id}.links.${link.id}`, link.id)}
              <FiExternalLink className="h-3.5 w-3.5 shrink-0" />
            </a>
          ))}
        </div>
      ) : null}
    </div>
  ) : null;

  const STEP_CONTENT: Record<Step, React.ReactNode> = {
    picker: pickerStep,
    other: otherStep,
    trustline: trustlineStep,
    tutorial: tutorialStep,
  };

  const STEP_TITLE: Record<Step, string> = {
    picker: t('deposit.otherApp.picker.title', 'From another app'),
    other: t('deposit.otherApp.other.title', 'Another app'),
    trustline: t('deposit.otherApp.trustline.title', 'Activate USDC'),
    tutorial: t('deposit.otherApp.tutorial.title', 'Deposit from {{name}}', { name: platform?.name ?? '' }),
  };

  const BACK_TARGET: Partial<Record<Step, Step>> = {
    other: 'picker',
    trustline: 'picker',
    tutorial: 'picker',
  };
  const backTarget = BACK_TARGET[step];

  const footer =
    step === 'tutorial' && platform ? (
      <PressableButton variant="success" size="cta" className="py-2.5!" onClick={() => onShowAddress(platform)}>
        {t('deposit.otherApp.tutorial.cta', 'Show my address')}
      </PressableButton>
    ) : undefined;

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={STEP_TITLE[step]}
      size="md"
      onBack={backTarget ? () => setStep(backTarget) : onBack}
      bodyClassName={'flex flex-col gap-3 ' + (footer ? 'pb-2' : 'pb-6')}
      footer={footer}
    >
      {STEP_CONTENT[step]}
    </AppModal>
  );
}

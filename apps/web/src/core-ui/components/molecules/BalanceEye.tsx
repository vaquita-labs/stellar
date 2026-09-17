'use client';

import { useTranslation } from 'react-i18next';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import { PrivacySection, useIsHidden, useIsHiddenAbove, usePrivacyStore } from '../../stores/privacy';
import { CircleIconButton } from './CircleIconButton';
import { FOCUS_RING_CLASSES } from './PressableButton';

interface BalanceEyeProps {
  /**
   * Qué bloque tapa. Sin `scope` toca el interruptor GLOBAL, el mismo que ya
   * vive en Ajustes → Privacidad: el ojo del header del home y ese switch son
   * dos mandos de la misma cosa, no dos preferencias parecidas.
   */
  scope?: PrivacySection;
  /** `circle` para los headers de página, al lado de los otros botones redondos. */
  variant?: 'inline' | 'circle';
  className?: string;
}

/**
 * El ojo de tapar/destapar la plata. El ícono dice el ESTADO actual (tachado =
 * está tapado), igual que el switch de `PrivacySettingsPage`, no la acción.
 *
 * No se renderiza si algo por encima ya está tapando: un ojo que no cambia nada
 * de lo que se ve es peor que no tener ojo. Por eso el del donut y el de la
 * distribución desaparecen mientras el del portafolio entero está cerrado.
 */
export function BalanceEye({ scope, variant = 'inline', className = '' }: BalanceEyeProps) {
  const { t } = useTranslation();
  const hidden = useIsHidden(scope);
  const hiddenAbove = useIsHiddenAbove(scope);
  const toggleHideBalance = usePrivacyStore((s) => s.toggleHideBalance);
  const toggleSection = usePrivacyStore((s) => s.toggleSection);

  if (hiddenAbove) return null;

  const onClick = () => (scope ? toggleSection(scope) : toggleHideBalance());
  const ariaLabel = hidden ? t('privacy.showBalanceAria', 'Show balance') : t('privacy.hideBalanceAria', 'Hide balance');
  const Icon = hidden ? FiEyeOff : FiEye;

  if (variant === 'circle') {
    return (
      <CircleIconButton ariaLabel={ariaLabel} onClick={onClick} icon={<Icon className="h-4 w-4" />} className={className} />
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      // `aria-pressed` y no un `title`: lo que hay que anunciar es si está
      // apretado, y el label ya cambia con el estado.
      aria-pressed={hidden}
      className={`inline-flex shrink-0 items-center justify-center rounded-full p-1 text-black/60 transition active:translate-y-[1px] ${FOCUS_RING_CLASSES} ${className}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

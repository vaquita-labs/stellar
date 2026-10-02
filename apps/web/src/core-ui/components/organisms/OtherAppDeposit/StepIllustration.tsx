'use client';

import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { FiCheck } from 'react-icons/fi';
import type { Copy, Illustration, IllustrationChip } from './tutorials';

interface StepIllustrationProps {
  appName: string;
  illustration: Illustration;
  /** Dirección del usuario, para la fila "pegá tu dirección". */
  address: string | null;
}

const copy = (t: TFunction, value: Copy | undefined) =>
  value === undefined ? undefined : typeof value === 'string' ? value : t(value.key, value.fallback);

const shortAddress = (address: string | null) => (address ? `${address.slice(0, 5)}…${address.slice(-5)}` : 'G…');

const HIGHLIGHT = 'border-2 border-[#F5A161] shadow-[0_0_0_3px_rgba(245,161,97,0.25)]';

function Chip({ chip }: { chip: IllustrationChip }) {
  const { t } = useTranslation();
  if (chip === 'check') return <FiCheck className="h-4 w-4 shrink-0 stroke-[3] text-black" />;
  const label: Record<Exclude<IllustrationChip, 'check'>, string> = {
    pick: t('deposit.otherApp.illustration.chips.pick', 'This one'),
    paste: t('deposit.otherApp.illustration.chips.paste', 'Paste'),
    blank: t('deposit.otherApp.illustration.chips.blank', 'Leave blank'),
    tap: t('deposit.otherApp.illustration.chips.tap', 'Tap'),
    copy: t('deposit.otherApp.illustration.chips.copy', 'Copy'),
  };
  return (
    <span className="shrink-0 rounded border border-black bg-[#F5A161] px-1.5 py-px text-[10px] font-bold text-black">
      {label[chip]}
    </span>
  );
}

/**
 * Dibujo de una pantalla de la app de origen, para los pasos que no tienen
 * captura real (Meru). Es el mismo lenguaje del diseño: marco punteado, filas
 * como campos, la que hay que tocar con borde naranja y las que no, apagadas.
 */
export function StepIllustration({ appName, illustration, address }: StepIllustrationProps) {
  const { t } = useTranslation();

  return (
    <div
      aria-hidden
      className="flex flex-col gap-1.5 rounded-xl border-[1.5px] border-dashed border-[#a8a39a] bg-[#F4F2EE] p-2.5"
    >
      <span className="font-mono text-[9.5px] uppercase tracking-wider text-[#8a857c]">
        {appName} · {copy(t, illustration.screen)}
      </span>

      {illustration.buttons ? (
        <div className="grid grid-cols-3 gap-1.5">
          {illustration.buttons.map((button, i) => (
            <span
              key={i}
              className={
                'rounded-lg bg-white px-2.5 py-1.5 text-center text-xs text-black ' +
                (button.highlight ? `font-bold ${HIGHLIGHT}` : 'border border-[#d6d2ca]')
              }
            >
              {copy(t, button.label)}
            </span>
          ))}
        </div>
      ) : null}

      {illustration.rows?.map((row, i) => (
        <div
          key={i}
          className={
            'flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs text-black ' +
            (row.highlight ? HIGHLIGHT : 'border border-[#d6d2ca]') +
            (row.off ? ' opacity-45' : '')
          }
        >
          {row.address || row.empty ? (
            <span className="min-w-0">
              <span className="block text-[11px] text-gray-500">{copy(t, row.label)}</span>
              {row.address ? (
                <span className="block truncate font-mono">{shortAddress(address)}</span>
              ) : (
                <span className="block text-gray-300">—</span>
              )}
            </span>
          ) : row.value ? (
            <>
              <span className="text-[11px] text-gray-500">{copy(t, row.label)}</span>
              <span className={row.highlight ? 'font-bold' : undefined}>{row.value}</span>
            </>
          ) : (
            <span className="min-w-0 truncate">
              <span className={row.highlight ? 'font-bold' : undefined}>{copy(t, row.label)}</span>
              {row.sub ? <span className="ml-1.5 text-[11px] text-gray-500">{copy(t, row.sub)}</span> : null}
            </span>
          )}
          {row.chip ? <Chip chip={row.chip} /> : null}
        </div>
      ))}
    </div>
  );
}

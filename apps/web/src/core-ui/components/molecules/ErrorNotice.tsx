'use client';

import { humanizeTxError } from '@/core-ui/helpers/txError';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertTriangle, FiCheck, FiChevronDown, FiCopy } from 'react-icons/fi';

/**
 * Muestra un error de transacción de forma compacta: una frase legible arriba
 * (via humanizeTxError) y, plegado, el texto crudo con un botón de copiar. El
 * bloque crudo va en un contenedor con alto máximo + scroll y `break-all`, así
 * un `HostError` gigante nunca rompe ni estira el modal.
 */
export function ErrorNotice({ error }: { error: unknown }) {
  const { t } = useTranslation();
  const { title, raw } = humanizeTxError(error, t);
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard no disponible: no rompemos nada */
    }
  };

  return (
    <div className="rounded-xl border border-error/30 bg-error/5 p-3 text-left">
      <div className="flex items-start gap-2">
        <FiAlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-error" />
        <p className="flex-1 text-sm font-semibold text-error">{title}</p>
      </div>

      {raw ? (
        <>
          <div className="mt-2 flex items-center gap-4 pl-6">
            <button
              type="button"
              onClick={() => setShowRaw((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 transition active:opacity-70"
            >
              <FiChevronDown className={`w-3.5 h-3.5 transition-transform ${showRaw ? 'rotate-180' : ''}`} />
              {showRaw ? t('txError.hideDetails', 'Hide details') : t('txError.showDetails', 'Show details')}
            </button>
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 transition active:opacity-70"
            >
              {copied ? <FiCheck className="w-3.5 h-3.5 text-success" /> : <FiCopy className="w-3.5 h-3.5" />}
              {copied ? t('txError.copied', 'Copied') : t('txError.copy', 'Copy')}
            </button>
          </div>

          {showRaw ? (
            <pre className="mt-2 ml-6 max-h-32 overflow-auto rounded-lg bg-black/5 p-2 text-[10px] leading-snug text-gray-600 whitespace-pre-wrap break-all">
              {raw}
            </pre>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

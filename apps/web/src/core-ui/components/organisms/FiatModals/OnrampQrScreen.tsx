'use client';

import type { RampInstructionField } from '@pollar/core';
import { countdownFrom, type SaveAffordance, saveAffordanceFor } from '@/networks/pollar/onrampPayment';
import { pngFileFromDataUrl, renderQrPngFile, saveQrImage } from '@/networks/pollar/qrImage';
import { Spinner } from '@heroui/react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PressableButton } from '../../molecules/PressableButton';

interface OnrampQrScreenProps {
  /** Payload crudo del QR. Es lo que se re-encodea acá. */
  payload: string | null;
  /** Imagen del proveedor, sólo cuando no hay payload. */
  imageSrc: string | null;
  fields: RampInstructionField[];
  expiresAt: Date | null;
  /** Ahora, según el reloj del modal: el mismo con el que decide qué pantalla va. */
  now: Date;
  /** Empezar de nuevo cuando el código venció. */
  onRestart: () => void;
}

/**
 * La pantalla de pago: el QR, los datos del proveedor y cuánto queda para que
 * el código venza.
 *
 * El QR se re-encodea desde el payload en vez de mostrar la imagen del
 * proveedor: sus SVG usan `currentColor` —ilegibles en tema oscuro y que iOS no
 * guarda en Fotos—, y el usuario recién se entera de que el código no escanea
 * cuando ya está frente a la app del banco. La imagen del proveedor queda sólo
 * como último recurso, para cuando no publica el payload.
 */
export function OnrampQrScreen({ payload, imageSrc, fields, expiresAt, now, onRestart }: OnrampQrScreenProps) {
  const { t } = useTranslation();
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Cómo se mide el dispositivo se resuelve una sola vez, al montar: `matchMedia`
  // y `navigator` no existen en el render del servidor.
  const affordance: SaveAffordance = useMemo(() => {
    if (typeof window === 'undefined') return 'none';
    const probe = new File([new Blob([''])], 'qr.png', { type: 'image/png' });
    return saveAffordanceFor({
      coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false,
      canShareFiles: navigator.canShare?.({ files: [probe] }) ?? false,
    });
  }, []);

  // Sin payload el QR es el PNG que dibujó el proveedor (Stereum manda sólo
  // eso): se envuelve como File para que el botón de guardar exista igual.
  const providerFile = useMemo(
    () => (!payload && imageSrc ? pngFileFromDataUrl(imageSrc, 'vaquita-qr.png') : null),
    [payload, imageSrc],
  );
  const shareFile = qrFile ?? providerFile;

  // Rasterizar el QR es asíncrono (pasa por un canvas), así que se hace una vez
  // por payload y se guarda el File: es el mismo que después se comparte.
  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    let url: string | null = null;
    void (async () => {
      try {
        const file = await renderQrPngFile(payload, 'vaquita-qr.png');
        if (cancelled) return;
        url = URL.createObjectURL(file);
        setQrFile(file);
        setQrUrl(url);
      } catch {
        // Sin canvas no hay QR propio; queda la imagen del proveedor o los datos.
        if (!cancelled) setQrError(true);
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [payload]);

  const { expired, label } = countdownFrom(expiresAt, now);
  const shownSrc = qrUrl ?? (qrError || !payload ? imageSrc : null);

  const handleSave = async () => {
    if (!shareFile) return;
    setSaving(true);
    try {
      const outcome = await saveQrImage(shareFile);
      setSaved(outcome !== 'manual');
    } catch {
      // Compartir cancelado por el usuario: no es un error que valga mostrar.
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async (field: RampInstructionField) => {
    try {
      await navigator.clipboard.writeText(field.value);
      setCopiedKey(field.key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Portapapeles bloqueado: el valor sigue visible y se puede seleccionar.
    }
  };

  if (expired) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <p className="text-sm font-bold text-black">{t('wallet.fiat.onramp.expiredTitle', 'This code expired')}</p>
        <p className="text-xs text-gray-500">
          {t('wallet.fiat.onramp.expiredBody', 'Nothing was charged. Start again to get a new code with a fresh rate.')}
        </p>
        <PressableButton variant="success" size="cta" onClick={onRestart}>
          {t('wallet.fiat.onramp.restart', 'Start a new purchase')}
        </PressableButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-center text-xs text-gray-500">
        {t('wallet.fiat.onramp.payHint', 'Pay this QR from your bank app. The USDC arrives on its own.')}
      </p>

      {/* --- El código. Fondo blanco fijo: viaja a la galería y de ahí a la app
          del banco, donde no hay ningún tema oscuro que lo compense. --- */}
      <div className="flex flex-col items-center gap-3">
        {shownSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shownSrc}
            alt={t('wallet.fiat.onramp.qrAlt', 'Payment QR code')}
            className="h-64 w-64 rounded-lg border border-black border-b-2 bg-white object-contain p-2"
          />
        ) : payload && !qrError ? (
          // El spinner sólo mientras se rasteriza un payload que SÍ existe: es
          // una espera con final. Sin payload no hay nada que esperar, y dejarlo
          // girando fue el bug — el usuario miraba un cargando eterno.
          <div className="flex h-64 w-64 items-center justify-center rounded-lg border border-black border-b-2 bg-white">
            <Spinner size="sm" color="current" />
          </div>
        ) : payload ? (
          // Sin canvas y sin imagen del proveedor no queda QR que mostrar, pero
          // el payload SÍ se puede pegar a mano en la app del banco: es peor
          // dejar al usuario mirando un spinner eterno con la compra ya creada.
          <p className="w-full break-all rounded-lg border border-black border-b-2 bg-white p-3 font-mono text-[11px] text-black">
            {payload}
          </p>
        ) : (
          // Compra retomada sin poder leerla del proveedor: no tenemos ni código
          // ni imagen. Se dice, en vez de fingir que algo está por aparecer.
          <div className="flex h-64 w-64 items-center justify-center rounded-lg border border-black border-b-2 bg-white p-4 text-center">
            <p className="text-xs text-gray-500">
              {t(
                'wallet.fiat.onramp.qrUnavailable',
                'We could not load the payment code. Start again to get a new one.',
              )}
            </p>
          </div>
        )}

        {label && (
          <p className="text-xs font-semibold text-gray-500">
            {t('wallet.fiat.onramp.expiresIn', 'Expires in {{time}}', { time: label })}
          </p>
        )}

        {affordance === 'share' && shareFile && (
          <PressableButton variant="success" size="cta" onClick={handleSave} disabled={saving}>
            {saved ? t('wallet.fiat.onramp.saved', 'Saved') : t('wallet.fiat.onramp.save', 'Save QR to my phone')}
          </PressableButton>
        )}
        {affordance === 'longPress' && (
          <p className="text-center text-[11px] text-gray-400">
            {t('wallet.fiat.onramp.longPress', 'Press and hold the code to save it to your photos.')}
          </p>
        )}
      </div>

      {/* --- Los datos que publica el proveedor, tal como los manda. --- */}
      {fields.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-black border-b-2 bg-white p-3">
          {fields.map((field) => (
            <div key={field.key} className="flex items-center justify-between gap-3 text-xs">
              <span className="shrink-0 text-gray-500">{field.label}</span>
              <span className="flex items-center gap-2 text-right">
                <span className={`font-semibold text-black ${field.type === 'code' ? 'font-mono' : ''}`}>{field.value}</span>
                {field.copyable && (
                  <button
                    type="button"
                    onClick={() => void handleCopy(field)}
                    className="shrink-0 rounded border border-black px-2 py-0.5 text-[11px] font-semibold text-black"
                  >
                    {copiedKey === field.key ? t('wallet.fiat.onramp.copied', 'Copied') : t('wallet.fiat.onramp.copy', 'Copy')}
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

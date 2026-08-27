'use client';

import { fieldsAreValid, type RampField, rampErrorMessage } from '@/networks/pollar/rampFields';
import { type OnrampCorridor, type OnrampCorridorCode, useRampOnramp, usdcOutOf } from '@/networks/pollar/rampsOnramp';
import type { RampQuote } from '@pollar/core';
import { Spinner } from '@heroui/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppModal } from '../../molecules/AppModal';
import { PressableButton } from '../../molecules/PressableButton';
import { RAMP_FIELD_CLASS, RampFieldList } from './RampFieldList';

interface ReceiveFiatRampModalProps {
  open: boolean;
  onOpenChange: () => void;
  /** Corredor elegido en el selector de país. */
  country: OnrampCorridorCode;
  /** Vuelve al selector de país. */
  onBack?: () => void;
}

/** Espera antes de cotizar mientras el usuario sigue tipeando el monto. */
const QUOTE_DEBOUNCE_MS = 450;

/** Elegir cuánto gastar, y después los datos que pida el proveedor. */
type Phase = 'amount' | 'details';

/** Decimales con los que se muestra el USDC estimado. */
const usdcLabel = (amount: number) => (Math.floor(amount * 100) / 100).toFixed(2);

/**
 * Compra de USDC con moneda local (hoy sólo Bolivia/BOB). Va en dos pasos: el
 * monto —con la cotización actualizándose en vivo mientras se escribe— y después
 * los datos que pida el proveedor. El pago del QR y la acreditación llegan
 * después.
 *
 * El formulario de datos no tiene nada boliviano cableado: los campos salen de
 * la cotización elegida y los dibuja el mismo componente que usa el off-ramp.
 *
 * El monto se pide en MONEDA LOCAL porque es la unidad con la que cotizan los
 * endpoints de ramps, y además es como el usuario piensa la compra: paga
 * bolivianos desde la app de su banco.
 */
export function ReceiveFiatRampModal({ open, onOpenChange, country, onBack }: ReceiveFiatRampModalProps) {
  const { t } = useTranslation();
  const { resolveCorridor, quoteFiat } = useRampOnramp();

  const [phase, setPhase] = useState<Phase>('amount');
  const [amountFiat, setAmountFiat] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [corridor, setCorridor] = useState<OnrampCorridor | null>(null);
  const [corridorOff, setCorridorOff] = useState<string | null>(null);
  const [notYet, setNotYet] = useState(false);
  // El resultado de cotizar se guarda JUNTO AL MONTO que lo produjo. Así no hay
  // que ir limpiándolo a mano cada vez que el usuario cambia el número: si el
  // monto guardado no es el que está escrito, el resultado está viejo y no se
  // muestra. Es lo mismo que evita mostrar la cotización de 100 mientras el
  // usuario ya escribió 1000.
  const [result, setResult] = useState<{ amount: string; quote: RampQuote | null; error: string | null } | null>(null);

  const currency = corridor?.currency ?? '';
  const symbol = corridor?.symbol ?? '';
  const countryName = t(`wallet.fiat.onramp.country.${country}`, country);
  const amountNum = Number(amountFiat);
  const amountValid = !!amountFiat && Number.isFinite(amountNum) && amountNum > 0;

  const messageOf = (e: unknown): string =>
    rampErrorMessage(
      e,
      (leaf) => t(`wallet.fiat.onramp.err.${leaf}`),
      t('wallet.fiat.onramp.err.generic', 'The purchase could not be quoted.'),
    );

  /** Límites de la ruta, en moneda local. Devuelve el mensaje o null si entra. */
  const limitProblem = (best: RampQuote, amount: number): string | null => {
    if (best.minAmount != null && amount < best.minAmount) {
      return t('wallet.fiat.onramp.limitMin', 'The minimum for this route is {{amount}} {{currency}}.', {
        amount: best.minAmount,
        currency,
      });
    }
    if (best.maxAmount != null && amount > best.maxAmount) {
      return t('wallet.fiat.onramp.limitMax', 'The maximum for this route is {{amount}} {{currency}}.', {
        amount: best.maxAmount,
        currency,
      });
    }
    return null;
  };

  // Al abrir se resuelve el corredor contra Pollar: si el país no está entre los
  // habilitados no tiene sentido dejar cotizar.
  //
  // No hace falta resetear el resto del estado al cerrar: el panel desmonta el
  // modal cuando termina la animación de salida.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void resolveCorridor(country).then((resolved) => {
      if (cancelled) return;
      setCorridor(resolved);
      if (!resolved) setCorridorOff(t('wallet.fiat.onramp.corridorOff', 'This corridor is not enabled yet.'));
    });
    return () => {
      cancelled = true;
    };
  }, [open, country, resolveCorridor, t]);

  // Cotización en vivo: se recotiza cada vez que el monto se queda quieto. Es lo
  // que hace que el usuario vea cuánto USDC recibe MIENTRAS elige cuánto gastar,
  // en vez de descubrirlo recién en la pantalla siguiente.
  //
  // `cancelled` descarta la respuesta de un monto viejo: sin eso, una cotización
  // lenta puede pisar a la del monto que el usuario tiene escrito ahora.
  useEffect(() => {
    if (!corridor || !amountValid) return;
    const amount = amountFiat;
    const value = amountNum;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const quotes = await quoteFiat(corridor, value);
          if (cancelled) return;
          const best = quotes[0];
          if (!best) {
            // Sin cotizaciones no hay `minAmount`/`maxAmount` que mostrar, así que
            // el mensaje apunta al monto en vez de afirmar que no hay proveedor.
            setResult({
              amount,
              quote: null,
              error: t(
                'wallet.fiat.onramp.err.noRoutes',
                'No route available for {{amount}} {{currency}}. Try a different amount.',
                { amount: value, currency },
              ),
            });
            return;
          }
          setResult({ amount, quote: best, error: limitProblem(best, value) });
        } catch (e) {
          if (cancelled) return;
          setResult({ amount, quote: null, error: messageOf(e) });
        }
      })();
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corridor, amountFiat]);

  // Sólo vale el resultado del monto que está escrito ahora; el de cualquier
  // otro es de una tecla anterior y todavía se está recotizando.
  const fresh = result?.amount === amountFiat ? result : null;
  const quote = fresh?.quote ?? null;
  const error = fresh?.error ?? null;
  const quoting = amountValid && !!corridor && !fresh;

  const usdcOut = quote ? usdcOutOf(amountNum, quote) : null;
  // Una cotización fuera de límites SÍ vuelve con datos, así que el error es lo
  // que decide si se puede seguir, no la existencia de la cotización.
  const usable = !!quote && !error && !quoting;

  // Qué datos pide el proveedor lo define la cotización elegida: no hay ningún
  // campo boliviano cableado acá. Si la ruta no pide nada, el paso queda vacío y
  // el botón habilitado, que es exactamente lo que corresponde.
  const fields: RampField[] = quote?.requiredFields ?? [];
  const fieldsValid = fieldsAreValid(fields, values);

  const footer =
    phase === 'amount' ? (
      <PressableButton variant="success" size="cta" onClick={() => setPhase('details')} disabled={!usable || !!corridorOff}>
        {t('wallet.fiat.onramp.continue', 'Continue')}
      </PressableButton>
    ) : (
      <PressableButton
        variant="success"
        size="cta"
        // El pago del QR llega en la parte siguiente; hasta entonces el botón
        // sólo confirma que los datos están completos.
        onClick={() => setNotYet(true)}
        disabled={!fieldsValid || !usable}
      >
        {t('wallet.fiat.onramp.cta', 'Buy USDC')}
      </PressableButton>
    );

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('wallet.fiat.onramp.title', 'Buy USDC in {{country}} ({{currency}})', {
        country: countryName,
        currency: currency || country,
      })}
      size="md"
      onBack={phase === 'details' ? () => setPhase('amount') : onBack}
      bodyClassName="flex flex-col gap-4 pb-2"
      footer={footer}
    >
      {corridorOff && (
        <p className="rounded-md border border-black border-b-2 bg-[#FFF4DD] px-3 py-2 text-xs font-semibold text-black">
          {corridorOff}
        </p>
      )}

      {/* --- Monto en MONEDA LOCAL: es la unidad con la que cotizan los endpoints
          de ramps, y es lo que el usuario va a pagar desde el banco. --- */}
      {phase === 'amount' && (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-gray-500" htmlFor="onramp-amount">
            {t('wallet.fiat.onramp.amountLabel', 'How much do you want to spend?')}
          </label>
          <div className="flex items-center gap-2">
            <span className="w-8 shrink-0 text-lg font-bold text-black">{symbol}</span>
            <input
              id="onramp-amount"
              type="text"
              inputMode="decimal"
              value={amountFiat}
              onChange={(e) => {
                setNotYet(false);
                setAmountFiat(e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'));
              }}
              placeholder="0.00"
              className={RAMP_FIELD_CLASS}
            />
            <span className="shrink-0 text-sm font-semibold text-gray-500">{currency}</span>
          </div>
          <p className="text-xs text-gray-500">{t('wallet.fiat.onramp.hint', 'You pay a QR code with your bank app.')}</p>
        </div>
      )}

      {quoting && (
        <p className="flex items-center gap-2 text-xs text-gray-500">
          <Spinner size="sm" color="current" /> {t('wallet.fiat.onramp.quoting', 'Finding a route…')}
        </p>
      )}

      {/* --- Ruta elegida. Se muestra aunque el monto esté fuera de límites: el
          usuario necesita ver la comisión y el mínimo para corregirlo. --- */}
      {quote && !quoting && (
        <div className="flex flex-col gap-1 rounded-lg border border-black border-b-2 bg-white p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-bold text-black">{quote.provider}</span>
            <span className="text-xs font-semibold text-gray-500">{quote.rail}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{t('wallet.fiat.onramp.youPay', 'You pay')}</span>
            <span className="font-semibold text-black">
              {symbol} {amountNum} {currency}
            </span>
          </div>
          {usdcOut != null && (
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{t('wallet.fiat.onramp.youReceive', 'You receive')}</span>
              <span className="font-semibold text-black">
                {t('wallet.fiat.onramp.outUsdc', '≈ {{amount}} USDC', { amount: usdcLabel(usdcOut) })}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{t('wallet.fiat.onramp.rateLabel', 'Rate')}</span>
            <span className="font-semibold text-black">
              {quote.rate} {currency} / USDC
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{t('wallet.fiat.onramp.feeLabel', 'Fee')}</span>
            <span className="font-semibold text-black">{quote.fee}%</span>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{t('wallet.fiat.onramp.etaLabel', 'Estimated time')}</span>
            <span className="font-semibold text-black">{quote.estimatedTime}</span>
          </div>
          {(quote.minAmount != null || quote.maxAmount != null) && (
            <p className="pt-1 text-[11px] text-gray-400">
              {t('wallet.fiat.onramp.limits', 'Between {{min}} and {{max}} {{currency}}.', {
                min: quote.minAmount ?? '—',
                max: quote.maxAmount ?? '—',
                currency,
              })}
            </p>
          )}
        </div>
      )}

      {/* --- Datos que pide el proveedor para esta ruta. --- */}
      {phase === 'details' && (
        <RampFieldList
          fields={fields}
          values={values}
          onChange={(key, value) => {
            setNotYet(false);
            setValues((prev) => ({ ...prev, [key]: value }));
          }}
          idPrefix="onramp"
        />
      )}

      {notYet && (
        <p className="rounded-md border border-black border-b-2 bg-[#DDF4FF] px-3 py-2 text-xs font-semibold text-black">
          {t('wallet.fiat.onramp.notYet', 'The payment step is coming in the next update.')}
        </p>
      )}

      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
    </AppModal>
  );
}

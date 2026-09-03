'use client';

import {
  type Corridor,
  type CorridorCode,
  isLiquidityRail,
  RampCancelled,
  type RampQuote,
  RampError,
  useRampOfframp,
} from '@/networks/pollar/ramps';
import { advanceWithdrawal, markWithdrawalTerminal, startWithdrawal } from '@/networks/pollar/offrampApi';
import { fieldsAreValid, type RampField, rampErrorMessage } from '@/networks/pollar/rampFields';
import { passiveWithdraw } from '@/networks/stellar/vaultDirect';
import type { RampTxStatus } from '@pollar/core';
import { Spinner, toast } from '@heroui/react';
import { usePollar } from '@pollar/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BsBank2 } from 'react-icons/bs';
import { FiExternalLink, FiPlus } from 'react-icons/fi';
import { HiOutlineSelector } from 'react-icons/hi';
import { railLabel, truncateMiddle } from '../../../helpers';
import { AMOUNT_DECIMALS, FIAT_DECIMALS, floorAmount } from '../../../helpers/numbers';
import { useCryptoMode, useLivePassiveUsdc } from '../../../hooks';
import {
  type SavedBankAccount,
  useCreateSavedBankAccount,
  useDeleteSavedBankAccount,
  useSavedBankAccounts,
} from '../../../hooks/useSavedBankAccounts';
import { useConfigStore, useRampActiveStore } from '../../../stores';
import { stellarExpertTxUrl } from '@/networks/stellar/helpers';
import { AmountStep } from '../../molecules/AmountStep';
import { AppModal } from '../../molecules/AppModal';
import { PressableButton } from '../../molecules/PressableButton';
import { FiatStepList, StepStatus } from './FiatStepList';
import { RampFieldList, RAMP_FIELD_CLASS } from './RampFieldList';
import { accountHint, SavedBankList } from './SavedBankList';

interface SendFiatRampModalProps {
  open: boolean;
  onOpenChange: () => void;
  /** Corredor elegido en el selector de país. */
  country: CorridorCode;
  /** Vuelve al selector de país. */
  onBack?: () => void;
}

/**
 * `bank` se mete ENTRE el monto y la confirmación a propósito: los datos del
 * banco son lo único que el usuario tiene que tipear, y pedirlos en la misma
 * pantalla que la cotización mezcla "completá esto" con "confirmá esto". Con el
 * destino ya elegido, `details` no pide nada: muestra lo que va a pasar.
 */
type Phase = 'amount' | 'bank' | 'details' | 'run';
type StepKey = 'funds' | 'create' | 'payout';

/**
 * El USDC sale del vault ANTES de crear el retiro. Con wallet custodial, Pollar
 * arma y envía el pago on-chain en el mismo momento de crear —la respuesta ya
 * trae `stellarTxHash`—, así que si la wallet está vacía no hay con qué pagar y
 * la transacción queda en `pending` sin hash, sin forma de retomarla.
 */
const STEP_ORDER: StepKey[] = ['funds', 'create', 'payout'];

const INITIAL_STEPS: Record<StepKey, StepStatus> = { create: 'idle', funds: 'idle', payout: 'idle' };

/**
 * The fiat the quote SETTLES, which is not necessarily the one that was asked
 * for: the provider quotes on the crypto side, so asking for 12 BOB lands near
 * it — at 12.13 — and that is what reaches the bank. This is the amount on
 * screen; the requested one only serves to quote.
 *
 * Falls back to the requested amount when the quote does not carry it, since
 * that is all there is to go on.
 */
const settledFiatOf = (quote: RampQuote | null, requested: number): number => {
  const settled = Number(quote?.fiatAmount);
  return Number.isFinite(settled) && settled > 0 ? settled : requested;
};

/**
 * Margin added on top of the quote when pulling USDC out of the vault. The
 * provider charges `cryptoAmount` to the stroop and rejects the withdrawal if
 * the wallet is even one short, and how much the vault actually pays out is
 * decided by ITS rounding when it unwinds the position — not by the shares we
 * ask it to burn. A tenth of a cent absorbs that gap.
 *
 * The leftover stays in the wallet: it is far below the minimum the idle-funds
 * gate acts on, so it neither prompts nor blocks anything.
 */
const FUNDING_DUST = 0.0001;

/** USDC to pull from the vault to cover a quote, quantized to the stroop. */
const fundingAmount = (cost: number): number => floorAmount(cost + FUNDING_DUST, AMOUNT_DECIMALS);

/**
 * Fiat off-ramp over Pollar's ramps endpoints, for any of the corridors the app
 * exposes (Brazil over Pix, Colombia over PSE or Bre-B with Abroad). It shares
 * the skeleton of {@link SendFiatModal} (Argentina/Anclap): a three-lock
 * stepper, the money leaves the vault for the wallet BEFORE it is handed to the
 * ramp, and the polling aborts if the user closes the modal.
 *
 * The big difference is the unit of the amount. With Anclap we run the
 * USDC → ARS swap ourselves, so that modal asks for USDC; here the amount is
 * chosen in LOCAL CURRENCY because `/ramps/quote` filters providers by the
 * corridor's fiat currency and quoting in USDC returns an empty list. The quote
 * publishes what it costs in USDC (`cryptoAmount`) and the confirmation shows
 * it, along with the fiat that actually settles (`fiatAmount`), which may not be
 * what the user typed.
 *
 * Nothing about the corridor is hardcoded beyond the symbol: the currency comes
 * from `getRampCountries`, and the rail, the provider and the form fields are
 * decided by the quote. Adding a country means adding it to `CORRIDORS` and to
 * the picker.
 */
export function SendFiatRampModal({ open, onOpenChange, country, onBack }: SendFiatRampModalProps) {
  const { t } = useTranslation();
  const { token, network } = useConfigStore();
  const { wallet, refreshAssets, refreshWalletBalance } = usePollar();
  const walletAddress = wallet?.address ?? null;
  // El hash del pago —y el link al explorador— sólo con "Sé de cripto": para el
  // resto, lo que importa es que la plata salió y en cuánto llega al banco.
  const cryptoMode = useCryptoMode();

  const {
    resolveCorridor,
    railLiquidity,
    quoteFiat,
    createOfframp,
    waitForKycApproval,
    completeWithdraw,
    waitForPaymentHash,
    confirmOnLedger,
    waitForPayout,
  } = useRampOfframp();
  // Mientras dura el flujo, el USDC que sacamos del vault NO es plata ociosa: sin
  // esto el gate de `useIdleFunds` lo devuelve al vault y la rampa se queda sin
  // nada que cobrar.
  const setRampActive = useRampActiveStore((s) => s.setRampActive);
  useEffect(() => () => setRampActive(false), [setRampActive]);

  // Al cerrarse el modal —terminado, fallado, o abandonado a mitad— el USDC que
  // sacamos del vault puede haber quedado en la wallet sin llegar nunca a la
  // rampa: el retiro salió del vault en el paso 1 y cualquier error posterior lo
  // deja ahí. Se refresca el balance custodial para que el gate de plata ociosa
  // (`useIdleFunds`, que vive en otro subárbol y sólo pollea mientras se espera
  // plata) lo VEA y ofrezca devolverlo al vault, en vez de que aparezca recién
  // en el próximo reload.
  //
  // Ofrecer y no hacerlo solo es a propósito: la firma custodial de Pollar tiene
  // que salir de un gesto del usuario, así que el redepósito lo dispara el botón
  // de `IdleFundsModal`. La marca se libera primero porque, mientras está
  // puesta, ese gate no promptea.
  useEffect(() => {
    if (open) return;
    setRampActive(false);
    void refreshWalletBalance();
  }, [open, setRampActive, refreshWalletBalance]);

  const [corridor, setCorridor] = useState<Corridor | null>(null);
  const [phase, setPhase] = useState<Phase>('amount');
  const [amountFiat, setAmountFiat] = useState('');
  const [quote, setQuote] = useState<RampQuote | null>(null);
  // Monto con el que se pidió la cotización que está guardada. Cambiar el monto
  // no la borra —el destino elegido sigue valiendo— pero la marca vieja: la
  // cotización fija el precio de UN monto, y seguir con la de otro cobraría mal.
  const [quotedFor, setQuotedFor] = useState<number | null>(null);
  const [usdcCost, setUsdcCost] = useState<number | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  // Cuentas bancarias guardadas: el espejo de las wallets guardadas del retiro a
  // cripto. Existe para no retipear documento y número de cuenta en cada retiro,
  // que es donde un dígito de más manda la plata a otra persona.
  const { data: savedBanks = [], isLoading: banksLoading } = useSavedBankAccounts();
  const createBank = useCreateSavedBankAccount();
  const deleteBank = useDeleteSavedBankAccount();
  const [selectedBankId, setSelectedBankId] = useState<string | null>(null);
  const [pendingDeleteBankId, setPendingDeleteBankId] = useState<string | null>(null);
  const [saveBankOpen, setSaveBankOpen] = useState(false);
  const [saveBankLabel, setSaveBankLabel] = useState('');
  const [saveBankError, setSaveBankError] = useState<string | null>(null);

  const [corridorOff, setCorridorOff] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [txStatus, setTxStatus] = useState<RampTxStatus | null>(null);
  const [steps, setSteps] = useState<Record<StepKey, StepStatus>>(INITIAL_STEPS);
  const [kycUrl, setKycUrl] = useState<string | null>(null);
  const [tosUrl, setTosUrl] = useState<string | null>(null);
  const [usdcSpent, setUsdcSpent] = useState<number | null>(null);
  const [paymentHash, setPaymentHash] = useState<string | null>(null);
  // Id de la fila que sigue este retiro del lado del servidor. En un ref y no en
  // estado porque lo lee `handleRun` mientras corre: un re-render de por medio
  // le daría el valor viejo y el avance se anotaría en la nada.
  const trackedId = useRef<string | null>(null);
  // El pago salió y el proveedor todavía está acreditando: en curso, no fallado.
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ref espejo de `open` para abortar el polling si el usuario cierra el modal.
  // El cleanup también lo apaga al DESMONTAR: si no, un modal que se desmonta sin
  // que `open` haya pasado por false deja su loop girando contra la transacción
  // vieja, y al reabrir quedan dos pollings simultáneos.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
    return () => {
      openRef.current = false;
    };
  }, [open]);

  // Lo retirable es la posición flexible (el vault general), NO lo que está en
  // períodos bloqueados. Misma fuente que el "Available" del modal de retiro, así
  // que los dos muestran el mismo número.
  const {
    live: liveUsdc,
    isLoading: balanceIsLoading,
    refetch: refreshBalance,
  } = useLivePassiveUsdc(walletAddress ?? undefined);
  const balance = floorAmount(liveUsdc, AMOUNT_DECIMALS);

  useEffect(() => {
    if (open && walletAddress) void refreshBalance();
  }, [open, walletAddress, refreshBalance]);

  // Al abrir se resuelve el corredor contra Pollar: si el país no está entre los
  // habilitados no tiene sentido dejar cotizar. La liquidez NO se mira acá sino
  // con la cotización elegida, porque un país puede salir por más de un rail.
  //
  // No hace falta resetear el resto del estado al cerrar: el panel desmonta el
  // modal cuando termina la animación de salida.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void resolveCorridor(country).then((resolved) => {
      if (cancelled) return;
      setCorridor(resolved);
      if (!resolved) setCorridorOff(t('wallet.fiat.ramp.corridorOff', 'This corridor is not enabled yet.'));
    });
    return () => {
      cancelled = true;
    };
  }, [open, country, resolveCorridor, t]);

  const mark = (key: StepKey, status: StepStatus) => setSteps((prev) => ({ ...prev, [key]: status }));

  const currency = corridor?.currency ?? '';
  const symbol = corridor?.symbol ?? '';
  const countryName = t(`wallet.fiat.ramp.country.${country}`, country);
  const fields: RampField[] = quote?.requiredFields ?? [];
  const amountNum = Number(amountFiat);
  const amountValid = !!amountFiat && Number.isFinite(amountNum) && amountNum > 0;
  const fieldsValid = fieldsAreValid(fields, values);
  const receiveFiat = settledFiatOf(quote, amountNum);

  // Sólo las cuentas del corredor que se está usando: los campos que pide el
  // proveedor cambian por país, así que ofrecer una cuenta de Brasil para un
  // retiro a Bolivia sólo llenaría el formulario con datos que no aplican.
  const bankAccounts = savedBanks.filter((a) => a.country === country);

  // Cómo se resume el destino en la fila del monto y en la confirmación. El
  // nombre sale de la cuenta guardada si se eligió una; si se tipeó a mano no
  // hay nombre todavía, así que se dice qué es y se muestra el enmascarado.
  // Vacío = no hay destino: recién ahí la fila invita a elegir uno.
  const selectedBank = bankAccounts.find((a) => a.id === selectedBankId) ?? null;
  const destinationHint = accountHint(values, fields);
  const destinationLabel = selectedBank
    ? selectedBank.label
    : destinationHint
      ? t('wallet.fiat.ramp.destination.newAccount', 'New account')
      : null;

  /**
   * Carga una cuenta guardada en el formulario. Se copian sólo las claves que la
   * cotización de HOY pide: si el proveedor sacó un campo, arrastrarlo lo
   * mandaría igual; si agregó uno, queda vacío y el usuario lo completa.
   */
  const applyBankAccount = (account: SavedBankAccount) => {
    const next: Record<string, string> = {};
    for (const field of fields) {
      const value = account.fields[field.key];
      if (typeof value === 'string' && value.length > 0) next[field.key] = value;
    }
    setValues(next);
    setSelectedBankId(account.id);
    setSaveBankOpen(false);
    setSaveBankError(null);
  };

  const handleDeleteBank = async (id: string) => {
    setPendingDeleteBankId(id);
    try {
      await deleteBank.mutateAsync(id);
      if (selectedBankId === id) setSelectedBankId(null);
    } catch (e) {
      toast.danger((e as Error)?.message ?? t('wallet.fiat.ramp.savedBanks.deleteError', 'Could not delete the account'));
    } finally {
      setPendingDeleteBankId(null);
    }
  };

  const handleSaveBank = async () => {
    const label = saveBankLabel.trim();
    if (!label || !fieldsValid || !corridor) return;
    setSaveBankError(null);
    try {
      const saved = await createBank.mutateAsync({
        label,
        country,
        currency: corridor.currency,
        rail: quote?.rail ?? null,
        fields: values,
      });
      setSelectedBankId(saved.id);
      setSaveBankOpen(false);
      setSaveBankLabel('');
      toast.success(t('wallet.fiat.ramp.savedBanks.saved', 'Account saved'));
    } catch (e) {
      setSaveBankError((e as Error)?.message ?? t('wallet.fiat.ramp.savedBanks.saveError', 'Could not save the account'));
    }
  };

  const messageOf = (e: unknown): string =>
    rampErrorMessage(
      e,
      (leaf) => t(`wallet.fiat.ramp.err.${leaf}`),
      t('wallet.fiat.ramp.err.generic', 'The withdrawal could not be completed.'),
    );

  const fail = (e: unknown) => {
    setError(messageOf(e));
    setSteps((prev) => {
      const next = { ...prev };
      STEP_ORDER.forEach((k) => {
        if (next[k] === 'running') next[k] = 'error';
      });
      return next;
    });
  };

  /**
   * Validates the cost the quote publishes against the balance. Returns the
   * error message when it cannot be paid, or null when it fits.
   *
   * What has to fit is the cost PLUS {@link FUNDING_DUST}, not the cost alone:
   * a balance that covers the quote exactly leaves no room for the vault's
   * payout rounding, and the withdrawal would die at the provider with the
   * money already out of savings.
   */
  const costProblem = (cost: number | null | undefined): string | null => {
    if (cost == null || !Number.isFinite(cost) || cost <= 0) {
      return t('wallet.fiat.ramp.err.unknownCost', 'The quote did not report how much USDC this withdrawal costs.');
    }
    if (fundingAmount(cost) > balance) {
      return t(
        'wallet.fiat.ramp.err.insufficientQuote',
        'This withdrawal needs {{needed}} USDC in your savings and you have {{balance}}. Try a smaller amount.',
        {
          needed: fundingAmount(cost),
          balance,
        },
      );
    }
    return null;
  };

  // --- Paso 1: cotizar el monto en moneda local ------------------------------
  /**
   * Deja una cotización válida para el monto que está en pantalla y la devuelve,
   * o `null` si el monto no se puede cotizar (y deja el motivo en `error`).
   *
   * Se llama desde los dos lugares que salen del paso del monto —elegir cuenta y
   * continuar— porque el formulario del banco no existe sin cotización: los
   * campos que pide el proveedor viajan en `requiredFields`, así que hasta que no
   * hay ruta no se sabe si el corredor pide CPF, cédula o email. Si ya hay una
   * cotización para ESTE monto no se vuelve a pedir.
   */
  const ensureQuote = async (): Promise<RampQuote | null> => {
    if (!amountValid || busy || !corridor) return null;
    if (quote && quotedFor === amountNum) return quote;
    setBusy(true);
    setError(null);
    try {
      const quotes = await quoteFiat(corridor, amountNum);
      const best = quotes[0];
      if (!best) {
        // Sin cotizaciones no hay `minAmount`/`maxAmount` que mostrar, así que el
        // mensaje apunta al monto en vez de afirmar que no existe proveedor.
        setError(
          t('wallet.fiat.ramp.err.noRoutes', 'No route available for {{amount}} {{currency}}. Try a different amount.', {
            amount: amountNum,
            currency,
          }),
        );
        return null;
      }
      // Los límites vienen en la moneda con la que se cotizó, o sea la local.
      if (best.minAmount != null && amountNum < best.minAmount) {
        setError(
          t('wallet.fiat.ramp.limitMin', 'The minimum for this route is {{amount}} {{currency}}.', {
            amount: best.minAmount,
            currency,
          }),
        );
        return null;
      }
      if (best.maxAmount != null && amountNum > best.maxAmount) {
        setError(
          t('wallet.fiat.ramp.limitMax', 'The maximum for this route is {{amount}} {{currency}}.', {
            amount: best.maxAmount,
            currency,
          }),
        );
        return null;
      }
      // The user typed reais or bolivianos, so only now — with the cost the
      // quote publishes — is it known whether the withdrawal fits the balance.
      const cost = best.cryptoAmount;
      const problem = costProblem(cost);
      if (problem) {
        setError(problem);
        return null;
      }
      // La liquidez se consulta por el rail que resolvió la cotización (Pix o
      // Bre-B); PSE y el resto no la publican y se dejan pasar.
      if (isLiquidityRail(best.rail)) {
        const liquidity = await railLiquidity(best.rail);
        if (!liquidity.available) {
          setError(
            liquidity.message ??
              t('wallet.fiat.ramp.noLiquidity', '{{rail}} is temporarily unavailable.', {
                rail: railLabel(best.rail, t),
              }),
          );
          return null;
        }
      }
      setQuote(best);
      setQuotedFor(amountNum);
      setUsdcCost(cost ?? null);
      return best;
    } catch (e) {
      setError(messageOf(e));
      return null;
    } finally {
      setBusy(false);
    }
  };

  /**
   * Abrir el selector de cuenta desde la fila de destino del paso del monto.
   *
   * Sin monto no se puede: la ruta se cotiza por monto y los campos del banco
   * vienen con la ruta. En vez de dejar la fila apagada sin explicación, se dice
   * en la misma línea que ya usa el error del monto —justo arriba de la fila—.
   */
  const openBank = async () => {
    if (!amountValid) {
      setError(
        t(
          'wallet.fiat.ramp.destination.needAmount',
          'Enter the amount first: which details your bank needs depends on the payout route.',
        ),
      );
      return;
    }
    if (await ensureQuote()) setPhase('bank');
  };

  /**
   * El CTA del paso del monto. Si todavía no hay datos del banco lleva a
   * elegirlos en vez de rebotar: es el único dato que falta y la pantalla
   * siguiente no es donde se piden.
   */
  const handleContinue = async () => {
    const fresh = await ensureQuote();
    if (!fresh) return;
    // Contra los campos de la cotización RECIÉN traída, no contra `fields`, que
    // todavía es el del render anterior. Si el proveedor agregó un campo desde
    // la última vez, esto es lo que lo detecta.
    setPhase(fieldsAreValid(fresh.requiredFields ?? [], values) ? 'details' : 'bank');
  };

  // --- Paso 2: ejecutar el retiro -------------------------------------------
  const handleRun = async () => {
    if (!quote || !corridor || !walletAddress || !token || busy) return;
    setPhase('run');
    setBusy(true);
    setError(null);
    setSteps(INITIAL_STEPS);
    setUsdcSpent(null);
    setPaymentHash(null);
    setSettling(false);
    setRampActive(true);

    try {
      // 1) Move the USDC the withdrawal costs from the vault to the wallet. It
      // goes FIRST because, with a custodial wallet, `createOfframp` builds and
      // sends the on-chain payment at the very moment it creates: with no USDC
      // in the wallet there is nothing to pay with and the withdrawal sits in
      // `pending` with no hash forever.
      //
      // The charge is `quote.cryptoAmount`, the EXACT figure fixed at quote
      // time. Dividing the requested fiat by `rate` lands on a different number,
      // because `rate` is published against the fiat that settles and the charge
      // is rounded to the cent.
      //
      // What leaves the vault is that charge plus `FUNDING_DUST`: asking for the
      // exact figure lands under it once the vault rounds its payout, and the
      // provider rejects a wallet that is a single stroop short. It is not
      // clamped to the balance either — withdrawing less than the charge
      // guarantees a short payment, and `costProblem` already rejected the
      // withdrawal if the funded amount does not fit.
      mark('funds', 'running');
      const cost = quote.cryptoAmount;
      const costIssue = costProblem(cost);
      if (costIssue) throw new RampError(costIssue);
      const toWithdraw = fundingAmount(cost as number);

      // La fila se abre ANTES de sacar del vault, no después de crear con el
      // proveedor: si el retiro se cae en el medio, la plata ya se movió y esta
      // es la única constancia de que existió. Best-effort — no poder
      // registrarlo no puede impedir un retiro que el usuario pidió.
      trackedId.current = await startWithdrawal(walletAddress, {
        country: corridor.country,
        amountFiat: String(receiveFiat),
        currency: corridor.currency,
        provider: quote.provider,
        rail: quote.rail,
        usdcAmount: String(toWithdraw),
      });

      const { hash: vaultHash } = await passiveWithdraw({
        address: walletAddress,
        amount: String(toWithdraw),
        decimals: token.decimals,
        withdrawAll: toWithdraw >= balance,
      });
      await refreshAssets();
      setUsdcSpent(toWithdraw);
      mark('funds', 'done');
      void advanceWithdrawal(walletAddress, trackedId.current, {
        step: 'create',
        vaultWithdrawHash: vaultHash,
      });

      // 2) Crear el retiro por el monto en moneda local. Si el proveedor pide KYC
      // hay que esperar la aprobación y volver a cotizar, porque la cotización
      // vence a los 15 minutos; Abroad no publica link propio, así que ahí sólo
      // queda esperar.
      mark('create', 'running');
      let active = quote;
      let result = await createOfframp({ corridor, quote: active, amountFiat: amountNum, walletAddress, values });

      if (result.kycRequired) {
        setKycUrl(result.kycUrl ?? null);
        setTosUrl(result.tosUrl ?? null);
        if (result.kycUrl) window.open(result.kycUrl, '_blank', 'noopener,noreferrer');
        toast.success(t('wallet.fiat.ramp.kycStarted', 'Verification pending — finish it with the provider.'));
        setWaiting(true);
        await waitForKycApproval({ shouldStop: () => !openRef.current });
        setWaiting(false);

        const fresh = (await quoteFiat(corridor, amountNum))[0];
        if (!fresh) {
          throw new RampError(
            t('wallet.fiat.ramp.err.noRoutes', 'No route available for {{amount}} {{currency}}. Try a different amount.', {
              amount: amountNum,
              currency,
            }),
          );
        }
        // The rate can move while the KYC runs, so the cost of the new quote is
        // revalidated against the balance before going on.
        const freshCost = fresh.cryptoAmount;
        const problem = costProblem(freshCost);
        if (problem) throw new RampError(problem);
        active = fresh;
        setQuote(fresh);
        setQuotedFor(amountNum);
        setUsdcCost(freshCost ?? null);
        result = await createOfframp({ corridor, quote: fresh, amountFiat: amountNum, walletAddress, values });
      }
      setTxStatus(result.status);
      mark('create', 'done');
      // Recién acá existe el retiro para el proveedor. `active` puede no ser la
      // cotización original: si hubo KYC se recotizó, y el proveedor y el rail
      // que valen son los de la que se usó.
      void advanceWithdrawal(walletAddress, trackedId.current, {
        step: 'payout',
        providerTxId: result.txId,
        provider: active.provider,
        rail: active.rail,
      });

      // 3) Confirmar que el pago on-chain salió. El acuse es `stellarTxHash`, no
      // el 200: con wallet custodial ya viene en la respuesta de crear; si no
      // está (wallet externa, o un anchor que exige el paso aparte) se dispara
      // `completeWithdraw`. Sin hash, esperar la liquidación sería esperar para
      // siempre, así que se corta con un mensaje que dice dónde quedó la plata.
      mark('payout', 'running');
      setWaiting(true);
      let hash =
        result.stellarTxHash ??
        (await waitForPaymentHash(result.txId, {
          shouldStop: () => !openRef.current,
          onStatus: (s) => setTxStatus(s),
        }));

      if (!hash) {
        const completed = await completeWithdraw(result.txId);
        setTxStatus(completed.status);
        hash =
          completed.stellarTxHash ??
          (await waitForPaymentHash(result.txId, {
            shouldStop: () => !openRef.current,
            onStatus: (s) => setTxStatus(s),
          }));
        if (!hash && completed.status !== 'completed') {
          throw new RampError(
            t(
              'wallet.fiat.ramp.err.paymentNotSubmitted',
              'The provider accepted the withdrawal but never sent the payment. Your USDC is in your wallet — try again.',
            ),
          );
        }
      }
      setPaymentHash(hash ?? null);
      if (hash) void advanceWithdrawal(walletAddress, trackedId.current, { paymentHash: hash });

      // El hash que informa el proveedor NO prueba que la plata se haya movido:
      // es el de la transacción que armó, y viene igual si nunca se difundió. Se
      // confirma contra Horizon antes de dar el pago por hecho, porque si no
      // llegó a un ledger el USDC sigue en la wallet y esperar la acreditación
      // sería esperar para siempre.
      if (hash && !(await confirmOnLedger(hash, { shouldStop: () => !openRef.current }))) {
        // El hash sólo sirve a quien lo pueda buscar: sin "Sé de cripto" el
        // mensaje dice lo único accionable —el pago no salió y la plata sigue
        // en la wallet—.
        throw new RampError(
          cryptoMode
            ? t(
                'wallet.fiat.ramp.err.paymentNotOnChain',
                'The provider reported a payment ({{hash}}) that never reached the network. Your USDC is still in your wallet.',
                { hash: truncateMiddle(hash, 6, 6) },
              )
            : t(
                'wallet.fiat.ramp.err.paymentFailed',
                'The payment could not be completed. Your USDC is still in your wallet.',
              ),
        );
      }

      // A partir de acá el retiro ya no depende de nosotros: el USDC llegó al
      // proveedor y falta que acredite la moneda local. Si eso tarda más que la
      // ventana de seguimiento no es una falla, así que el paso queda en curso y
      // el usuario puede cerrar — no se le muestra un error sobre plata que está
      // en camino.
      const finalStatus = await waitForPayout(result.txId, {
        shouldStop: () => !openRef.current,
        onStatus: (s) => setTxStatus(s),
      });
      setWaiting(false);
      if (finalStatus === 'completed') {
        mark('payout', 'done');
        void markWithdrawalTerminal(walletAddress, trackedId.current, 'settled');
        trackedId.current = null;
        toast.success(
          t('wallet.fiat.ramp.settled', 'Withdrawal paid out via {{rail}}.', { rail: railLabel(active.rail, t) }),
        );
      } else {
        // Sigue acreditando: no se cierra la fila, porque el retiro todavía no
        // terminó. Si el usuario no vuelve, la ventana de gracia la cierra sola.
        setSettling(true);
      }
    } catch (e) {
      // Cancelación (el usuario cerró el modal durante la espera): no es error, y
      // la fila queda ABIERTA a propósito — el retiro sigue su curso del lado del
      // proveedor y el usuario puede volver. La ventana de gracia la cierra si
      // nadie vuelve.
      if (e instanceof RampCancelled) return;
      fail(e);
      // Acá sí falló: se cierra con el motivo, que es lo que después explica
      // dónde quedó la plata.
      void markWithdrawalTerminal(walletAddress, trackedId.current, 'failed', messageOf(e));
      trackedId.current = null;
    } finally {
      setWaiting(false);
      setBusy(false);
      // Se libera pase lo que pase: si el retiro falló, ese USDC SÍ quedó ocioso
      // en la wallet y el gate tiene que poder ofrecer devolverlo al vault.
      setRampActive(false);
    }
  };

  const rail = railLabel(quote?.rail, t);
  const groupLabels: Record<StepKey, string> = {
    create: t('wallet.fiat.ramp.groupCreate', 'Start the withdrawal'),
    funds: t('wallet.fiat.ramp.groupFunds', 'Withdraw from your savings'),
    payout: t('wallet.fiat.ramp.groupPayout', 'Pay out via {{rail}}', { rail }),
  };

  // Lo que dice la línea bajo el número cuando NO hay problema (el error lo pisa
  // dentro de `AmountStep`): cuánto hay en los ahorros para gastar.
  const amountHint = balanceIsLoading
    ? t('wallet.fiat.ramp.balanceLoading', 'Reading your savings…')
    : t('wallet.fiat.ramp.balance', 'Available in savings: {{balance}} USDC', { balance });

  const footer =
    phase === 'amount' ? (
      <PressableButton
        variant="success"
        size="cta"
        onClick={handleContinue}
        disabled={!amountValid || busy || !!corridorOff || !corridor || !walletAddress}
      >
        {busy ? (
          <>
            <Spinner size="sm" color="current" /> {t('wallet.fiat.ramp.quoting', 'Finding a route…')}
          </>
        ) : (
          t('wallet.fiat.ramp.continue', 'Continue')
        )}
      </PressableButton>
    ) : phase === 'bank' ? (
      <PressableButton variant="success" size="cta" onClick={() => setPhase('details')} disabled={!fieldsValid || busy}>
        {t('wallet.fiat.ramp.continue', 'Continue')}
      </PressableButton>
    ) : phase === 'details' ? (
      <PressableButton variant="success" size="cta" onClick={handleRun} disabled={!fieldsValid || busy || !token}>
        {t('wallet.fiat.ramp.cta', 'Withdraw')}
      </PressableButton>
    ) : (
      <p className="w-full text-center text-xs text-gray-500">
        {busy
          ? t('wallet.fiat.ramp.waitingHint', 'We are waiting for the provider to confirm…')
          : t('wallet.fiat.ramp.doneHint', 'You can close this window.')}
        {txStatus ? ` (${txStatus})` : ''}
      </p>
    );

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      // Regla de todos los flujos de plata: no se cierran tocando afuera en
      // NINGÚN paso. Acá pesa doble — con el retiro en curso la plata ya salió
      // del vault y está en camino a la rampa, y un toque al borde en medio de
      // eso deja al usuario sin la única pantalla que le dice dónde quedó.
      //
      // La X sigue ahí a propósito: la espera del proveedor puede no terminar
      // nunca, y el polling se aborta solo al cerrar. Es un cierre deliberado,
      // no un accidente.
      isDismissable={false}
      title={t('wallet.fiat.ramp.title', 'Withdraw to {{country}} ({{currency}})', {
        country: countryName,
        currency: currency || country,
      })}
      size="md"
      onBack={
        phase === 'details'
          ? () => setPhase('bank')
          : phase === 'bank'
            ? () => setPhase('amount')
            : onBack
      }
      // Con el teclado en el cuerpo, el aire de las otras fases hace scrollear
      // el sheet en pantallas chicas y lo primero que se corta es el monto.
      bodyClassName={`flex flex-col pb-2 ${phase === 'amount' ? 'gap-2.5' : 'gap-4'}`}
      footer={footer}
    >
      {corridorOff && (
        <p className="rounded-md border border-black border-b-2 bg-[#FFF4DD] px-3 py-2 text-xs font-semibold text-black">
          {corridorOff}
        </p>
      )}

      {/* --- Monto en MONEDA LOCAL: es la unidad con la que cotizan los endpoints
          de ramps. Cuánto USDC cuesta se resuelve con la cotización y se muestra
          en la confirmación. --- */}
      {phase === 'amount' && (
        <AmountStep
          value={amountFiat}
          onValueChange={setAmountFiat}
          decimals={FIAT_DECIMALS}
          symbol={symbol || currency}
          symbolPosition="suffix"
          error={error}
          onErrorClear={() => setError(null)}
          hint={amountHint}
          // Sin chip de saldo: el saldo está en USDC y acá se teclea moneda
          // local, así que no hay un "máximo" que tipear sin la cotización.
          // Por lo mismo va sin `max`: el tope de la ruta llega recién con la
          // cotización y aparecería a mitad de tipear, con las teclas dejando
          // de responder sin decir por qué. `ensureQuote` lo explica.
          disabled={busy}
          compact
        >
          {/* El destino, acá y no en la confirmación: los datos del banco son lo
              único que hay que tipear en todo el retiro, y pedirlos recién en la
              pantalla de confirmar obliga a leer una cotización antes de saber
              adónde va la plata. Tocar cotiza primero —el formulario del
              proveedor no existe sin ruta— y por eso pide el monto antes. */}
          <PressableButton
            variant="white"
            size="row"
            onClick={() => void openBank()}
            disabled={busy || !corridor || !!corridorOff}
          >
            <BsBank2 className="w-6 h-6 text-black shrink-0" />
            <span className="flex-1 min-w-0 text-left">
              {destinationLabel ? (
                <>
                  <span className="block text-sm font-bold text-black truncate">{destinationLabel}</span>
                  {destinationHint ? (
                    <span className="block font-mono text-[11px] text-gray-500">{destinationHint}</span>
                  ) : null}
                </>
              ) : (
                <span className="block text-sm font-bold text-black">
                  {t('wallet.fiat.ramp.destination.select', 'Select bank account')}
                </span>
              )}
            </span>
            <HiOutlineSelector className="w-5 h-5 text-black shrink-0" />
          </PressableButton>
        </AmountStep>
      )}

      {/* --- Destino: cuentas guardadas + el formulario del proveedor. --- */}
      {phase === 'bank' && (
        <>
          <p className="text-sm font-bold text-black">
            {t('wallet.fiat.ramp.destination.pickTitle', 'Where do you want to receive the money?')}
          </p>

          <SavedBankList
            accounts={bankAccounts}
            fields={fields}
            selectedId={selectedBankId}
            loading={banksLoading}
            disabled={busy}
            deletingId={pendingDeleteBankId}
            onSelect={applyBankAccount}
            onDelete={handleDeleteBank}
          />

          {/* El formulario queda visible aunque se haya elegido una cuenta
              guardada: lo que el proveedor pide pudo cambiar desde que se
              guardó, y el usuario tiene que poder ver qué va a mandar. */}
          <RampFieldList
            fields={fields}
            values={values}
            onChange={(key, value) => {
              setValues((prev) => ({ ...prev, [key]: value }));
              // Editar un campo despega el formulario de la cuenta guardada:
              // lo que se va a mandar ya no es lo que dice esa fila.
              setSelectedBankId(null);
            }}
            disabled={busy}
          />

          {/* Guardar la cuenta: sólo cuando ya está completa, porque guardar a
              medias devuelve un formulario que hay que terminar igual. Es opt-in
              —el retiro funciona sin tocarlo— y nombrar la cuenta es parte de
              guardarla: sin nombre, dos cuentas del mismo banco no se
              distinguen en la lista. */}
          {fieldsValid && !saveBankOpen && !selectedBank && (
            <button
              type="button"
              onClick={() => setSaveBankOpen(true)}
              disabled={busy}
              className="self-start flex items-center gap-2 rounded-full border border-black border-b-2 bg-white h-9 px-3.5 text-sm font-bold text-black hover:bg-black/5 active:border-b active:translate-y-[1px] transition disabled:opacity-50"
            >
              <FiPlus className="w-4 h-4" />
              {t('wallet.fiat.ramp.savedBanks.add', 'Save this account')}
            </button>
          )}

          {fieldsValid && saveBankOpen && (
            <div className="flex flex-col gap-2 rounded-lg border border-black border-b-2 bg-white p-3">
              <label className="text-xs font-semibold text-gray-500" htmlFor="ramp-save-bank-label">
                {t('wallet.fiat.ramp.savedBanks.labelField', 'Name this account')}
              </label>
              <input
                id="ramp-save-bank-label"
                type="text"
                value={saveBankLabel}
                onChange={(e) => {
                  setSaveBankLabel(e.target.value);
                  if (saveBankError) setSaveBankError(null);
                }}
                maxLength={60}
                disabled={busy || createBank.isPending}
                placeholder={t('wallet.fiat.ramp.savedBanks.labelPlaceholder', 'e.g. My bank account')}
                className={RAMP_FIELD_CLASS}
              />
              {saveBankError ? <p className="text-xs font-semibold text-red-600">{saveBankError}</p> : null}
              <div className="flex items-center gap-2">
                <PressableButton
                  variant="white"
                  size="cta"
                  className="py-2!"
                  onClick={() => {
                    setSaveBankOpen(false);
                    setSaveBankError(null);
                  }}
                  disabled={createBank.isPending}
                >
                  {t('common.cancel', 'Cancel')}
                </PressableButton>
                <PressableButton
                  variant="success"
                  size="cta"
                  className="py-2!"
                  onClick={handleSaveBank}
                  disabled={!saveBankLabel.trim() || createBank.isPending}
                >
                  {createBank.isPending ? <Spinner size="sm" color="current" /> : null}
                  {t('wallet.fiat.ramp.savedBanks.save', 'Save')}
                </PressableButton>
              </div>
            </div>
          )}
        </>
      )}

      {/* --- Ruta elegida + datos que pide el proveedor (los define la cotización). --- */}
      {phase === 'details' && quote && (
        <>
          <div className="flex flex-col gap-1 rounded-lg border border-black border-b-2 bg-white p-3 text-sm">
            {/* El nombre del proveedor no se muestra: el usuario cobra por un
                rail (QR, transferencia), y quién lo liquida es un detalle
                nuestro. El rail va con el nombre que la gente conoce, no con la
                sigla que manda el proveedor. */}
            <div className="flex items-center justify-between">
              <span className="font-bold text-black">{t('wallet.fiat.ramp.routeLabel', 'Payout method')}</span>
              <span className="text-xs font-semibold text-gray-500">{railLabel(quote.rail, t)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{t('wallet.fiat.ramp.youReceive', 'You receive')}</span>
              <span className="font-semibold text-black">
                {symbol} {receiveFiat} {currency}
              </span>
            </div>
            {usdcCost != null && (
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{t('wallet.fiat.ramp.youSend', 'Leaves your savings')}</span>
                <span className="font-semibold text-black">
                  {t('wallet.fiat.ramp.costUsdc', '{{amount}} USDC', { amount: usdcCost })}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{t('wallet.fiat.ramp.etaLabel', 'Estimated time')}</span>
              <span className="font-semibold text-black">{quote.estimatedTime}</span>
            </div>
          </div>

          {/* El destino ya está elegido: acá sólo se comprueba, y "Cambiar"
              vuelve al paso donde se elige. Es la última pantalla antes de que
              la plata salga del vault, así que tiene que decir a qué cuenta va
              sin obligar a recordarlo del paso anterior. */}
          <div className="flex items-center gap-3 rounded-lg border border-black border-b-2 bg-white px-3 py-2.5">
            <BsBank2 className="w-6 h-6 text-black shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-[11px] font-semibold text-gray-500">
                {t('wallet.fiat.ramp.destination.title', 'Destination')}
              </span>
              <span className="block text-sm font-bold text-black truncate">
                {destinationLabel ?? t('wallet.fiat.ramp.destination.select', 'Select bank account')}
              </span>
              {destinationHint ? (
                <span className="block font-mono text-[11px] text-gray-500">{destinationHint}</span>
              ) : null}
            </span>
            <button
              type="button"
              onClick={() => setPhase('bank')}
              disabled={busy}
              className="shrink-0 text-xs font-bold text-black underline underline-offset-2 disabled:opacity-50"
            >
              {t('wallet.fiat.ramp.destination.change', 'Change')}
            </button>
          </div>
        </>
      )}

      {/* --- Stepper del retiro. --- */}
      {phase === 'run' && (
        <>
          <FiatStepList
            steps={STEP_ORDER.map((key) => ({
              key,
              label: groupLabels[key],
              status: steps[key],
              implemented: true,
            }))}
          />

          {/* El pago on-chain puede tardar en confirmar y el proveedor en
              liquidar. Sin este aviso el último paso parece trabado. */}
          {waiting && steps.payout === 'running' && !settling && (
            <p className="text-xs text-gray-500">
              {t('wallet.fiat.ramp.waitingReady', 'Waiting for the payment to settle…', {
                eta: quote?.estimatedTime ?? '',
              })}
            </p>
          )}

          {/* Dejamos de esperar pero el retiro sigue su curso: se dice explícito
              para que "no terminó de cargar" no se lea como "falló". */}
          {settling && (
            <p className="rounded-md border border-black border-b-2 bg-[#DDF4FF] px-3 py-2 text-xs font-semibold text-black">
              {t(
                'wallet.fiat.ramp.settling',
                'Your USDC was received and the {{rail}} payout is on its way. It can take a while — you can close this window.',
                { rail },
              )}
            </p>
          )}

          {usdcSpent != null && (
            <p className="text-sm font-semibold text-black">
              {t('wallet.fiat.ramp.usdcSpent', '{{amount}} USDC left your savings', { amount: usdcSpent })}
            </p>
          )}

          {/* Detalle on-chain: sólo con "Sé de cripto". Al resto no le dice nada
              y el paso de arriba ya cuenta en qué anda el retiro. */}
          {cryptoMode && paymentHash && (
            <a
              href={stellarExpertTxUrl(paymentHash, network?.type)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-500 underline decoration-dotted underline-offset-2 hover:text-black"
            >
              {t('wallet.fiat.ramp.paymentSent', 'On-chain payment sent: {{hash}}', {
                hash: truncateMiddle(paymentHash, 6, 6),
              })}
            </a>
          )}

          {steps.payout === 'done' && (
            <p className="text-success text-sm font-semibold">
              {t('wallet.fiat.ramp.settled', 'Withdrawal paid out via {{rail}}.', { rail })}
            </p>
          )}

          {(kycUrl || tosUrl) && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-gray-500">
                {t('wallet.fiat.ramp.kycHint', 'The provider needs to verify your identity before paying out.')}
              </p>
              {[
                { url: kycUrl, label: t('wallet.fiat.ramp.openKyc', 'Open verification') },
                { url: tosUrl, label: t('wallet.fiat.ramp.openTos', 'Open terms') },
              ]
                .filter((l): l is { url: string; label: string } => !!l.url)
                .map((link) => (
                  <a
                    key={link.label}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 rounded-md border border-black border-b-2 bg-[#DDF4FF] px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[#c4ecff]"
                  >
                    <FiExternalLink className="h-4 w-4" />
                    {link.label}
                  </a>
                ))}
            </div>
          )}

          {/* Abroad no publica link de KYC: mientras espera, el usuario no tiene
              nada que abrir y sin este aviso el paso parece colgado. */}
          {waiting && !kycUrl && !tosUrl && steps.create === 'running' && (
            <p className="text-xs text-gray-500">
              {t('wallet.fiat.ramp.kycNoLink', 'The provider is reviewing your identity. This can take a while.')}
            </p>
          )}
        </>
      )}

      {/* En la fase del monto el error ya se lee bajo el número; repetirlo acá
          empujaría el teclado fuera de la pantalla. */}
      {error && phase !== 'amount' && <p className="text-sm font-medium text-red-600">{error}</p>}
    </AppModal>
  );
}

import { blendConfigForToken } from '@/networks/stellar/blendDirect';
import { humanizeTxError } from '@/core-ui/helpers/txError';
import { passiveDeposit } from '@/networks/stellar/vaultDirect';
import { usePollarReadyStore } from '@/networks/stellar/wallet/pollarReady';
import { toast } from '@heroui/react';
import { usePollar } from '@pollar/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfigStore, useRampActiveStore, useAwaitingFundsStore } from '../stores';

// Umbral mínimo (USDC, unidades humanas): no promptear ni gastar gas por polvo.
const MIN_IDLE = 1;

// Cada cuánto re-consultamos el balance custodial mientras el usuario está en el
// home. La plata puede entrar on-chain por fuera de la app (le mandan USDC a su
// dirección de "Recibir"), y sin poll no nos enteraríamos hasta un reload.
const IDLE_POLL_MS = 12_000;

/**
 * Detecta USDC ocioso en la wallet CUSTODIAL (social login) y expone la acción
 * para invertirlo en la posición pasiva (el vault de DeFindex con el flag on, si
 * no el supply directo a Blend). Ya NO firma en silencio: la firma custodial de Pollar
 * necesita salir de un gesto del usuario (si no, tira `SDK_AUTH_DPOP_USE_NONCE`),
 * y además mover plata ajena debe confirmarse. Por eso el disparo real es el botón
 * de la pantalla de "plata ociosa" (`IdleFundsModal`), y este hook solo decide
 * cuándo mostrarla y hace el supply cuando el usuario aprueba.
 *
 * Guardas: solo custodial, opt-out por wallet (ON por default), umbral mínimo,
 * lock in-flight, y gate en `usePollarReadyStore` (sesión/DPoP restaurada).
 */
export const useIdleFunds = () => {
  const { t } = useTranslation();
  const { wallet, walletBalance, refreshWalletBalance } = usePollar();
  const { walletAddress, token } = useConfigStore();
  const queryClient = useQueryClient();
  const ready = usePollarReadyStore((s) => s.ready);
  const awaitingFunds = useAwaitingFundsStore((s) => s.isAwaitingFunds);
  const rampActive = useRampActiveStore((s) => s.isRampActive);

  const [isInvesting, setIsInvesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  // Solo custodial (social login). `external` = Freighter/xBull: no se toca.
  const isCustodial = !!wallet && wallet.custody !== 'external';
  const balances = walletBalance.step === 'loaded' ? walletBalance.data.balances : [];
  // Idle = ONLY the USDC Blend accepts (same issuer). Testnet has several
  // "USDC" assets from different issuers; without this filter the wrong one is
  // detected and the supply fails with "trustline missing". The Blend config
  // comes from the active token (project config); null until it loads or when
  // the token has no Blend pool — then nothing counts as idle.
  const blendUsdcIssuer = blendConfigForToken(token)?.usdcIssuer;
  const usdc = blendUsdcIssuer
    ? balances.find((b) => b.code?.toUpperCase() === 'USDC' && b.issuer === blendUsdcIssuer)
    : undefined;
  const idle = usdc ? Number(usdc.available) : 0;

  // (1) Fetch ÚNICO al montar/recargar el home: el home no pide el balance solo,
  // así que lo traemos una vez para detectar plata ociosa apenas entra el usuario
  // (nudge de `IdleFundsModal`). Espera a que la wallet custodial esté lista.
  useEffect(() => {
    if (!ready || !isCustodial || !walletAddress) return;
    void refreshWalletBalance();
  }, [ready, isCustodial, walletAddress, refreshWalletBalance]);

  // (2) Poll REPETIDO: solo mientras el usuario está esperando que le entre la
  // plata —mirando su dirección en "Receive USDC", o el QR de una compra con
  // moneda local—, porque ahí llega por fuera de la app y nadie nos avisa. El
  // resto del tiempo no le pegamos al RPC en loop. Guardas:
  // custodial + sesión Pollar restaurada; pausa con la pestaña oculta y mientras
  // hay un supply in-flight. Al volver a la pestaña refrescamos enseguida.
  useEffect(() => {
    if (!awaitingFunds || !ready || !isCustodial || !walletAddress) return;

    const tick = () => {
      if (inFlight.current || document.visibilityState === 'hidden') return;
      void refreshWalletBalance();
    };
    const id = setInterval(tick, IDLE_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [awaitingFunds, ready, isCustodial, walletAddress, refreshWalletBalance]);

  const invest = useCallback(async () => {
    if (inFlight.current || !walletAddress || !token) return;
    const amount = idle;
    if (amount < MIN_IDLE) return;
    inFlight.current = true;
    setIsInvesting(true);
    setError(null);
    try {
      const { hash } = await passiveDeposit({
        address: walletAddress,
        amount: String(amount),
        decimals: token.decimals,
      });
      console.info('[idle-funds] invested', { hash, amount });
      // Destino-agnóstico a propósito: el router elige vault o Blend según el
      // flag, y el usuario no tiene por qué conocer el protocolo de abajo.
      toast.success(
        t('idleFunds.toast', 'We put ${{amount}} to work', {
          amount: amount.toFixed(2),
        }),
      );
      await refreshWalletBalance();
      void queryClient.invalidateQueries({ queryKey: ['blend-position'] });
      void queryClient.invalidateQueries({ queryKey: ['defindex-vault-position'] });
    } catch (e) {
      // La firma custodial puede fallar por sesión (nonce) o falta de gas (XLM).
      // Mostramos el error en la pantalla y dejamos reintentar; no barremos solos.
      console.warn('[idle-funds] invest failed', e);
      setError(humanizeTxError(e, t).title);
      throw e;
    } finally {
      inFlight.current = false;
      setIsInvesting(false);
    }
  }, [walletAddress, token, idle, refreshWalletBalance, queryClient, t]);

  // ¿Mostrar la pantalla de plata ociosa? Custodial + sesión lista + hay USDC
  // ocioso sobre el umbral. Es un nudge cerrable, así que no hace falta opt-out.
  //
  // Con una rampa en curso NO se promptea. En el off-ramp ese USDC acaba de
  // salir del vault para pagarle a la rampa: devolverlo deja al proveedor sin
  // nada que cobrar y el retiro colgado. En el on-ramp la compra puede
  // acreditarse con la pantalla de pago todavía abierta, y taparla con el prompt
  // interrumpe algo que el usuario está haciendo. Al cerrarse la pantalla la
  // marca se apaga y el prompt se ofrece como después de cualquier depósito.
  const shouldPrompt = ready && isCustodial && idle >= MIN_IDLE && !rampActive;

  return { idle, shouldPrompt, invest, isInvesting, error, clearError: () => setError(null) };
};

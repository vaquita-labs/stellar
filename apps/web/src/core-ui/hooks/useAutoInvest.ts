import { blendConfigForToken, directBlendSupply } from '@/networks/stellar/blendDirect';
import { usePollarReadyStore } from '@/networks/stellar/wallet/pollarReady';
import { toast } from '@heroui/react';
import { usePollar } from '@pollar/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfigStore } from '../stores';

// Umbral mínimo (USDC, unidades humanas): no promptear ni gastar gas por polvo.
const MIN_IDLE = 1;

/**
 * Detecta USDC ocioso en la wallet CUSTODIAL (social login) y expone la acción
 * para invertirlo en Blend. Ya NO firma en silencio: la firma custodial de Pollar
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

  // Traemos el balance al montar (el home no lo pide solo) para detectar lo
  // ocioso apenas entra el usuario. Espera a que Pollar esté listo.
  useEffect(() => {
    if (ready && isCustodial && walletAddress) void refreshWalletBalance();
  }, [ready, isCustodial, walletAddress, refreshWalletBalance]);

  const invest = useCallback(async () => {
    if (inFlight.current || !walletAddress || !token) return;
    const amount = idle;
    if (amount < MIN_IDLE) return;
    inFlight.current = true;
    setIsInvesting(true);
    setError(null);
    try {
      const { hash } = await directBlendSupply({
        address: walletAddress,
        amount: String(amount),
        decimals: token.decimals,
      });
      console.info('[idle-funds] invested to Blend', { hash, amount });
      toast.success(
        t('idleFunds.toast', 'We put ${{amount}} to work in Blend', {
          amount: amount.toFixed(2),
        })
      );
      await refreshWalletBalance();
      void queryClient.invalidateQueries({ queryKey: ['blend-position'] });
    } catch (e) {
      // La firma custodial puede fallar por sesión (nonce) o falta de gas (XLM).
      // Mostramos el error en la pantalla y dejamos reintentar; no barremos solos.
      console.warn('[idle-funds] invest failed', e);
      setError((e as Error)?.message ?? t('withdraw.error.generic', 'Something went wrong'));
      throw e;
    } finally {
      inFlight.current = false;
      setIsInvesting(false);
    }
  }, [walletAddress, token, idle, refreshWalletBalance, queryClient, t]);

  // ¿Mostrar la pantalla de plata ociosa? Custodial + sesión lista + hay USDC
  // ocioso sobre el umbral. Es un nudge cerrable, así que no hace falta opt-out.
  const shouldPrompt = ready && isCustodial && idle >= MIN_IDLE;

  return { idle, shouldPrompt, invest, isInvesting, error, clearError: () => setError(null) };
};

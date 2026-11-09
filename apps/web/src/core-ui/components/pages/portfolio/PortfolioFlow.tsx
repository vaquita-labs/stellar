'use client';

import { useConfigStore } from '@/core-ui/stores';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppModal, useModalPresence } from '../../molecules/AppModal';
import { PortfolioPanel } from '../../organisms';
import { PortfolioPage } from './PortfolioPage';

/**
 * /portafolio es una página normal (ya no un overlay interceptado sobre /home):
 *
 *   /portafolio            → <PortfolioPanel variant="page">  (balance + distribución)
 *   /portafolio?period=X   → <PortfolioPage> en una hoja lateral sobre la página
 *   /portafolio?period=all → <PortfolioPage> (todas las posiciones)
 *
 * Pasar de una a otra solo cambia `?period`, así que la página no se desmonta y
 * la hoja de posiciones entra/sale con la animación lateral del AppModal.
 */
export function PortfolioFlow() {
  const router = useRouter();
  const { token } = useConfigStore();
  const hasPeriod = useSearchParams().get('period') !== null;

  // Estado local sembrado de `?period` y sincronizado con él (push de goToTerm,
  // back/forward del navegador). Arranca cerrado y lo abre el efecto: un commit
  // después de la página, para que la hoja anime su entrada.
  const [positionsOpen, setPositionsOpen] = useState(false);
  const positionsMounted = useModalPresence(positionsOpen);
  // Si la hoja se abrió con un push dentro de esta página, cerrarla es un pop
  // (back). Si se llegó con `?period` en la URL (refresh / link directo), no hay
  // entrada propia que popear: se reemplaza la URL por /portafolio.
  const pushedRef = useRef(false);
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current && hasPeriod) pushedRef.current = true;
    seededRef.current = true;
    setPositionsOpen(hasPeriod);
  }, [hasPeriod]);

  const closePositions = useCallback(() => {
    if (!positionsOpen) return;
    setPositionsOpen(false);
    if (pushedRef.current) {
      pushedRef.current = false;
      router.back();
    } else {
      router.replace('/portafolio');
    }
  }, [router, positionsOpen]);

  // Back del header: vuelve a donde se vino; sin historial propio (link directo)
  // va al home.
  const goBack = useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.push('/home');
  }, [router]);

  return (
    <>
      <PortfolioPanel variant="page" open onOpenChange={goBack} tokenSymbol={token?.symbol} />

      {positionsMounted ? (
        <AppModal
          open={positionsOpen}
          onOpenChange={closePositions}
          // PortfolioPage trae su propio encabezado (PageLayout: back + filtro),
          // así que el AppModal solo aporta el contenedor a pantalla completa que
          // se desliza desde la derecha, sin barra ni padding propios.
          title=""
          hideHeader
          fullScreen
          slideFrom="right"
          size="lg"
          dialogClassName="sm:max-w-2xl! sm:min-h-[80vh]"
          bodyClassName="p-0!"
        >
          <PortfolioPage onBack={closePositions} />
        </AppModal>
      ) : null}
    </>
  );
}

'use client';

import { useConfigStore } from '@/core-ui/stores';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AppModal, MODAL_EXIT_MS, useModalPresence } from '../../molecules/AppModal';
import { PortfolioPanel } from '../../organisms';
import { PortfolioPage } from './PortfolioPage';

interface PortfolioFlowProps {
  /**
   * `overlay` = abierto por interceptación sobre /home (navegación suave): el
   * mundo 3D del home queda montado detrás, así que cerrar vuelve atrás en el
   * historial para no recargarlo. `page` = carga directa/refresh de /portafolio:
   * no hay home detrás, así que cerrar navega a /home.
   */
  mode: 'overlay' | 'page';
}

/**
 * Orquesta la pila de portafolio como hojas sobre el /home persistente, sin
 * recargar el mundo 3D:
 *
 *   /portafolio            → <PortfolioPanel>  (panel: balance + allocation)
 *   /portafolio?period=X   → <PortfolioPage>   (posiciones del plazo, apiladas)
 *
 * Ambas hojas viven en la MISMA ruta interceptada (`@modal/(.)portafolio`), así
 * que pasar de una a otra solo cambia el query `?period` y el componente NO se
 * desmonta: el panel queda montado detrás y la hoja de posiciones entra/sale
 * con la animación lateral del AppModal. Ver [[portfolio-overlay-flow]].
 */
export function PortfolioFlow({ mode }: PortfolioFlowProps) {
  const router = useRouter();
  const { token } = useConfigStore();
  const hasPeriod = useSearchParams().get('period') !== null;

  // Qué está abierto es ESTADO LOCAL, sembrado desde la URL. En overlay la URL
  // sigue mandando (goToTerm pushea `?period`, el back lo popea) y sincronizamos
  // con el efecto de abajo → URLs limpias y compartibles. En page (refresh /
  // deep-link) NO navegamos para cerrar: un push a /portafolio sería una nav
  // suave que la ruta interceptora `(.)portafolio` atraparía, metiéndonos en un
  // overlay con historial roto (no se podía volver al home). Por eso ahí cerramos
  // con estado local + limpieza de URL nativa, sin disparar navegación de Next.
  const [panelOpen, setPanelOpen] = useState(true);
  const [positionsOpen, setPositionsOpen] = useState(hasPeriod);
  const positionsMounted = useModalPresence(positionsOpen);

  // Mantiene las posiciones en sync con `?period`: cubre el push de goToTerm y el
  // back/forward del navegador en overlay. En page el valor inicial ya quedó
  // sembrado y esto no vuelve a dispararse (cerramos sin tocar el param de Next).
  useEffect(() => {
    setPositionsOpen(hasPeriod);
  }, [hasPeriod]);

  // Cerrar el flujo entero (X del panel) → volver al home. El open se apaga para
  // que corra la animación de salida y recién después se abandona la ruta (si no,
  // el desmontaje la cortaría). En overlay hay un /home detrás en el historial
  // (back = pop limpio, sin recargar el 3D); en page se navega a /home.
  const closeFlow = useCallback(() => {
    setPanelOpen(false);
    setTimeout(() => {
      if (mode === 'overlay') router.back();
      else router.push('/home');
    }, MODAL_EXIT_MS + 50);
  }, [mode, router]);

  // Cerrar solo las posiciones → dejar el panel visible detrás.
  const closePositions = useCallback(() => {
    setPositionsOpen(false);
    if (mode === 'overlay') {
      // Se llegó acá con un push (goToTerm), así que se cierra con back(): POP,
      // no otro push (si no, el back del panel caería de vuelta en `?period`).
      router.back();
    } else {
      // page: solo limpiamos la URL en el acto, sin navegar, para no re-disparar
      // la ruta interceptora. El estado local ya dejó el panel visible.
      window.history.replaceState(null, '', '/portafolio');
    }
  }, [mode, router]);

  return (
    <>
      <PortfolioPanel open={panelOpen} onOpenChange={closeFlow} tokenSymbol={token?.symbol} />

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
          bodyClassName="p-0!"
        >
          <PortfolioPage onBack={closePositions} />
        </AppModal>
      ) : null}
    </>
  );
}

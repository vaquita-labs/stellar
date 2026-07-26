'use client';

import { useConfigStore } from '@/core-ui/stores';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { AppModal, MODAL_EXIT_MS, useModalPresence } from '../../molecules/AppModal';
import { PortfolioPanel } from '../../organisms';
import { PortfolioPage } from './PortfolioPage';

interface PortfolioFlowProps {
  /**
   * `overlay` = abierto por interceptación sobre /home (navegación suave): el
   * mundo 3D del home queda montado detrás, así que cerrar vuelve atrás en el
   * historial para no recargarlo. `page` = carga directa/refresh de /portafolio:
   * no hay home detrás, cerrar navega a /home.
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
  const period = useSearchParams().get('period');
  const positionsOpen = period !== null;
  const positionsMounted = useModalPresence(positionsOpen);

  // El panel arranca abierto (se montó al navegar a /portafolio) y anima su
  // entrada. Cerrarlo apaga el `open` para que corra la animación de salida y,
  // recién cuando termina, abandona la ruta: navegar de una desmontaría el
  // componente y cortaría la animación. Por eso el open es estado local y no
  // se deriva de la URL.
  const [panelOpen, setPanelOpen] = useState(true);
  const closeFlow = useCallback(() => {
    setPanelOpen(false);
    setTimeout(() => {
      if (mode === 'overlay') router.back();
      else router.push('/home');
    }, MODAL_EXIT_MS + 50);
  }, [mode, router]);

  // Cerrar las posiciones = deshacer el `?period`. En overlay se llegó acá con un
  // push (goToTerm), así que se cierra con back(): POP, no otro push. Si se
  // pusheara /portafolio, la pila crecería y el back() del panel caería de nuevo
  // en `?period` (el bug de "quedarse entre los dos modales"). En page (deep
  // link / refresh) no hay entry previo para popear, así que se navega al panel.
  const closePositions = useCallback(() => {
    if (mode === 'overlay') router.back();
    else router.push('/portafolio');
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

'use client';

import { useConfigStore } from '@/core-ui/stores';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
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
 *   /portafolio?period=all → <PortfolioPage>   (todas las posiciones)
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
  // Las posiciones arrancan cerradas incluso con `?period` en la URL: las abre el
  // efecto de abajo, o sea un commit después del panel. Dos modales montados en
  // el MISMO commit corren su `ariaHideOutside` uno detrás del otro y se marcan
  // `inert` mutuamente (react-aria solo desconecta el observer del anterior
  // cuando el segundo abre más tarde): con los dos inert ningún tap llega al
  // contenido, cae en el <body> y react-aria lo lee como click afuera, cerrando
  // la hoja de arriba. Abrirlas escalonadas mantiene el stack sano.
  const [positionsOpen, setPositionsOpen] = useState(false);
  const positionsMounted = useModalPresence(positionsOpen);

  // Mantiene las posiciones en sync con `?period`: las abre en el primer commit
  // tras montar (carga directa / refresh con el param) y cubre el push de
  // goToTerm y el back/forward del navegador en overlay. En page el cierre no
  // toca el param de Next, así que no vuelve a dispararse.
  useEffect(() => {
    setPositionsOpen(hasPeriod);
  }, [hasPeriod]);

  // Cerrar navega tras la animación de salida, así que el cierre DEBE ser
  // idempotente y cancelable. Sin esto, tocar la X / el backdrop varias veces
  // ("cerrar muchas veces") agenda VARIOS router.back() que se disparan sueltos:
  // sobre-popean el historial y lo desincronizan de lo que se ve, dejando la URL
  // parada en /portafolio con el overlay ya cerrado → el push('/portafolio') del
  // saldo se deduplica a no-op y el botón queda "muerto". El timer va en un ref
  // para cancelarlo al desmontar; closingRef corta reentradas.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingRef = useRef(false);
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  // Cerrar el flujo entero (X del panel) → volver al home. El open se apaga para
  // que corra la animación de salida y recién después se abandona la ruta (si no,
  // el desmontaje la cortaría). En overlay hay un /home detrás en el historial
  // (back = pop limpio, sin recargar el 3D); en page se navega a /home.
  const closeFlow = useCallback(() => {
    if (closingRef.current) return; // ya cerrando: no re-agendar navegación
    closingRef.current = true;
    setPanelOpen(false);
    closeTimer.current = setTimeout(() => {
      if (mode === 'overlay') router.back();
      else router.push('/home');
    }, MODAL_EXIT_MS + 50);
  }, [mode, router]);

  // Cerrar solo las posiciones → dejar el panel visible detrás. Guardado con el
  // estado actual: un segundo dismiss (backdrop durante la animación de salida)
  // con las posiciones ya cerradas dispararía otro back() que popearía de más y
  // cerraría también el panel.
  const closePositions = useCallback(() => {
    if (!positionsOpen) return;
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
  }, [mode, router, positionsOpen]);

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
          // Solo desktop (sm:): un poco más ancho y con alto mínimo, para que la
          // tarjeta flotante no quede angosta ni chata con pocas posiciones. En
          // mobile sigue a pantalla completa (fullScreen), sin cambios.
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

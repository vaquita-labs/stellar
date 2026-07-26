'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheckCircle, FiPlusSquare, FiRefreshCw, FiShare } from 'react-icons/fi';
import { dismissInstallPrompt, useInstallApp } from '../../../hooks';
import { Button } from '../../atoms';

// Distancia (px) a arrastrar para gatillar el refresh, y el tope del elástico.
const PULL_THRESHOLD = 70;
const PULL_MAX = 110;

/** Loader de 3 puntitos que rebotan (typing-indicator). */
function ThreeDots({ animate }: { animate: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`h-2.5 w-2.5 rounded-full bg-black ${animate ? 'animate-bounce' : ''}`}
          style={animate ? { animationDelay: `${i * 0.15}s` } : undefined}
        />
      ))}
    </span>
  );
}

/**
 * Pull-to-refresh casero para la pantalla de instalación. El gate lee
 * `isStandalone` al montar y NO es reactivo (sólo se vuelve true cuando abrís la
 * app YA instalada desde el inicio), así que la forma honesta de re-evaluarlo es
 * un reload real. Esto le da al usuario el gesto de "tirar para abajo" para que,
 * una vez instalada/abierta como app, esta pantalla desaparezca y caiga al home.
 *
 * Escuchamos los eventos táctiles de forma nativa porque `touchmove` necesita
 * `preventDefault` (no-pasivo) para ganarle al overscroll del navegador.
 */
function usePullToRefresh(onRefresh: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const setP = (v: number) => {
      pullRef.current = v;
      setPull(v);
    };

    const onStart = (e: TouchEvent) => {
      // Sólo cuando estamos arriba de todo, si no dejamos scrollear normal.
      if (el.scrollTop <= 0 && !refreshingRef.current) {
        startY.current = e.touches[0].clientY;
        setDragging(true);
      } else {
        startY.current = null;
      }
    };

    const onMove = (e: TouchEvent) => {
      if (startY.current == null || refreshingRef.current) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0) {
        e.preventDefault(); // frena el pull-to-refresh nativo del navegador
        // Resistencia elástica: cuesta cada vez más estirar.
        setP(Math.min(delta * 0.5, PULL_MAX));
      } else {
        setP(0);
      }
    };

    const onEnd = () => {
      setDragging(false);
      if (startY.current == null) return;
      startY.current = null;
      if (pullRef.current >= PULL_THRESHOLD) {
        refreshingRef.current = true;
        setRefreshing(true);
        setP(PULL_THRESHOLD);
        onRefresh();
      } else {
        setP(0);
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [onRefresh]);

  return { ref, pull, dragging, refreshing };
}

/**
 * Pantalla bloqueante que exige instalar la PWA antes de usar la wallet.
 * La monta <InstallGate> sólo en móvil y cuando NO corremos como app instalada.
 *
 * - Android/Chromium: hay API nativa (`beforeinstallprompt`), así que mostramos
 *   un botón que dispara el prompt. Aceptar instala la app pero ESTA pestaña
 *   sigue en el navegador (no standalone), por eso al aceptar pasamos a un
 *   estado "abrila desde tu inicio" en vez de dejar entrar.
 * - iOS (y móviles sin API): no hay forma programática, mostramos las
 *   instrucciones manuales Compartir → "Agregar a inicio".
 *
 * Tirá hacia abajo (pull-to-refresh) para recargar: si ya estás corriendo como
 * app instalada, el gate se re-evalúa y esta pantalla desaparece → home.
 */
export function InstallPrompt() {
  const { t } = useTranslation();
  const { canInstall, promptInstall } = useInstallApp();
  const [installing, setInstalling] = useState(false);
  const [accepted, setAccepted] = useState(false);

  // Empujón de una sola vez: apenas se muestra, este dispositivo queda marcado
  // para que el próximo reload ya no bloquee (sigue apareciendo esta vez).
  useEffect(() => {
    dismissInstallPrompt();
  }, []);

  const handleRefresh = useCallback(() => {
    if (typeof window !== 'undefined') window.location.reload();
  }, []);

  const { ref, pull, dragging, refreshing } = usePullToRefresh(handleRefresh);
  const progress = Math.min(pull / PULL_THRESHOLD, 1);

  // Al soltar el pull disparamos el reload: ocultamos el mensaje y mostramos
  // sólo el loader sobre el mismo fondo, hasta que el navegador recargue.
  if (refreshing) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/25">
        <ThreeDots animate />
      </div>
    );
  }

  const handleInstall = async () => {
    if (installing) return;
    setInstalling(true);
    try {
      const outcome = await promptInstall();
      // Instalada: la pestaña actual sigue en el navegador, así que no la
      // dejamos pasar — tiene que abrir la app instalada (standalone).
      if (outcome === 'accepted') setAccepted(true);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div
      ref={ref}
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-primary/25"
    >
      {/* Indicador de pull-to-refresh: aparece en el hueco (mismo peach) que deja
          el contenido al desplazarse hacia abajo. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-center"
        style={{ height: pull, opacity: progress }}
      >
        <ThreeDots animate={false} />
      </div>

      <div
        className="flex min-h-full flex-col"
        style={{
          transform: `translateY(${pull}px)`,
          transition: dragging ? 'none' : 'transform 0.25s ease',
        }}
      >
        {/* Hero: hereda el peach del contenedor (así el hueco del pull combina). */}
        <div className="relative flex flex-1 items-center justify-center overflow-hidden px-6">
          <span className="pointer-events-none absolute left-8 top-14 text-3xl select-none">✨</span>
          <span className="pointer-events-none absolute right-10 top-20 text-2xl select-none">✨</span>
          <span className="pointer-events-none absolute bottom-16 left-12 text-2xl select-none">✨</span>
          <span className="pointer-events-none absolute bottom-24 right-8 text-3xl select-none">✨</span>
          <div className="relative h-40 w-40 sm:h-52 sm:w-52">
            <Image
              src="/vaquita/vaquita_isotipo.svg"
              alt="Vaquita"
              fill
              sizes="208px"
              className="object-contain drop-shadow-sm"
              priority
            />
          </div>
        </div>

        {/* Panel inferior con la copy y la acción */}
        <div className="rounded-t-3xl border-t border-black bg-white px-6 pb-10 pt-7 sm:px-8">
          <div className="mx-auto w-full max-w-md flex flex-col gap-4">
            <h1 className="text-3xl font-bold text-black">
              {t('onboarding.install.title', 'Get the full experience')}
            </h1>

            {accepted ? (
              <>
                <div className="flex items-start gap-3 rounded-xl border border-success/40 bg-success/10 p-3">
                  <FiCheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                  <p className="text-[15px] leading-relaxed text-black">
                    {t(
                      'onboarding.install.installedBody',
                      'Vaquita is installed! Open it from your home screen to unlock your wallet.'
                    )}
                  </p>
                </div>
                <p className="text-sm text-black/60">
                  {t(
                    'onboarding.install.installedHint',
                    'You can close this tab — from now on open Vaquita from the app icon.'
                  )}
                </p>
              </>
            ) : (
              <>
                <p className="text-[15px] font-semibold text-black/80">
                  {t('onboarding.install.finalStep', 'This is the final step!')}
                </p>
                <p className="text-[15px] leading-relaxed text-black/70">
                  {t(
                    'onboarding.install.body',
                    'Add Vaquita to your home screen to unlock your wallet and start using it.'
                  )}
                </p>

                {canInstall ? (
                  // Android/Chromium: un toque instala.
                  <Button
                    type="primary"
                    wFull
                    onPress={handleInstall}
                    isLoading={installing}
                    startContent={<FiPlusSquare className="h-5 w-5" />}
                    className="mt-2"
                  >
                    {t('onboarding.install.installButton', 'Add to home screen')}
                  </Button>
                ) : (
                  // iOS y móviles sin API: instrucciones manuales.
                  <ol className="mt-1 flex flex-col gap-3">
                    <li className="flex items-center gap-3 text-[15px] text-black">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-black bg-primary/30 text-black">
                        <FiShare className="h-[18px] w-[18px]" />
                      </span>
                      <span>
                        {t('onboarding.install.iosStep1Prefix', 'Tap the')}{' '}
                        <b>{t('onboarding.install.iosShare', 'Share icon')}</b>{' '}
                        {t('onboarding.install.iosStep1Suffix', 'in your browser')}
                      </span>
                    </li>
                    <li className="flex items-center gap-3 text-[15px] text-black">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-black bg-primary/30 text-black">
                        <FiPlusSquare className="h-[18px] w-[18px]" />
                      </span>
                      <span>
                        {t('onboarding.install.iosStep2Prefix', 'Then tap')}{' '}
                        <b>{t('onboarding.install.iosStep2Action', '“Add to Home Screen”')}</b>
                      </span>
                    </li>
                  </ol>
                )}

                {/* Pista del gesto: tirá para abajo para recargar y entrar si ya
                    la instalaste / la abriste como app. */}
                <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-black/40">
                  <FiRefreshCw className="h-3.5 w-3.5" />
                  {t('onboarding.install.pullHint', 'Already installed? Pull down to refresh')}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

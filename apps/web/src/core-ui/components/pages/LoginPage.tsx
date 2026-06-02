'use client';

import StellarAuthButtons from '@/components/profile/StellarAuthButtons';
import { OnboardingIntro } from '@/core-ui/components';
import { useIsAuthenticated } from '@/core-ui/hooks';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

// Simulación de "mostrar onboarding" vía env var (sin persistencia local).
// Mientras no haya señal del backend, esto controla si se ve el intro.
// Por defecto se muestra; al reiniciar reaparece. Poner 'false' para ocultarlo.
const SHOW_ONBOARDING_INTRO = process.env.NEXT_PUBLIC_SHOW_ONBOARDING_INTRO !== 'false';

export default function LoginPage() {
  const isAuthenticated = useIsAuthenticated();
  const router = useRouter();

  // Solo estado de sesión: si recargas, vuelve a aparecer (no se persiste).
  const [introDismissed, setIntroDismissed] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/home');
    }
  }, [isAuthenticated, router]);

  // No mostrar nada mientras se verifica la autenticación o si ya está autenticado
  if (isAuthenticated) {
    return null;
  }

  if (SHOW_ONBOARDING_INTRO && !introDismissed) {
    return <OnboardingIntro onFinish={() => setIntroDismissed(true)} />;
  }

  return (
    <div className="h-full w-full flex relative">
      {/* Panel izquierdo - Logo */}
      <div className="hidden md:flex w-1/2 items-center justify-center bg-primary border-r-2 border-primary">
        <div className="flex flex-col items-center gap-4">
          <Image
            src="/vaquita/vaquita_isotipo.svg"
            alt="Vaquita Logo"
            width={500}
            height={500}
            className="object-contain"
            priority
          />
        </div>
      </div>

      {/* Panel derecho - Login */}
      <div className="w-full md:w-1/2 flex items-center justify-center bg-background p-8 relative">
        <div className="w-full max-w-md border-2 border-primary rounded-lg p-8 bg-white/80 backdrop-blur-sm shadow-lg">
          <div className="flex flex-col items-center gap-4">
            {/* Logo móvil */}
            <div className="md:hidden mb-2">
              <Image
                src="/vaquita/vaquita_logo.png"
                alt="Vaquita Logo"
                width={180}
                height={180}
                className="object-contain"
                priority
              />
            </div>

            <h1 className="text-3xl font-bold text-black">Welcome</h1>
            <p className="text-gray-600 text-center mb-2">Connect your wallet to start saving securely</p>

            {/* Botones de autenticación dentro de la card */}
            <div className="w-full flex flex-col gap-2">
              <StellarAuthButtons />
            </div>

            {/* Botón para volver a ver el intro (testeo / replay) */}
            <button
              onClick={() => setIntroDismissed(false)}
              className="mt-1 text-sm font-semibold text-black/50 hover:text-black underline underline-offset-2 transition"
            >
              View intro again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

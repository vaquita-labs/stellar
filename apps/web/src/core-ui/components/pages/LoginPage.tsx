'use client';

import StellarAuthButtons from '@/components/profile/StellarAuthButtons';
import { OnboardingIntro } from '@/core-ui/components';
import { useIntroSeen, useIsAuthenticated } from '@/core-ui/hooks';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export default function LoginPage() {
  const { t } = useTranslation();
  const isAuthenticated = useIsAuthenticated();
  const router = useRouter();
  const searchParams = useSearchParams();

  // El intro vive por dispositivo en localStorage: se muestra una sola vez y
  // no reaparece al recargar. Sin env var (el env es global al build y no sabe
  // si este dispositivo ya lo vio).
  const { hydrated, seen, markSeen, replay } = useIntroSeen();

  useEffect(() => {
    if (isAuthenticated) {
      // Volver a la ruta de origen (?redirect=) si la hay; solo rutas internas
      // para evitar open-redirect. Si no, al /home por defecto.
      const redirect = searchParams.get('redirect');
      router.replace(redirect && redirect.startsWith('/') ? redirect : '/home');
    }
  }, [isAuthenticated, router, searchParams]);

  // No mostrar nada mientras se verifica la autenticación, si ya está
  // autenticado, o hasta leer localStorage (evita parpadeo del intro).
  if (isAuthenticated || !hydrated) {
    return null;
  }

  if (!seen) {
    return <OnboardingIntro onFinish={markSeen} />;
  }

  return (
    <div className="h-full w-full flex relative">
      {/* Panel izquierdo - Logo */}
      <div className="hidden md:flex w-1/2 items-center justify-center bg-primary border-r-2 border-primary">
        <div className="flex flex-col items-center gap-4">
          <Image
            src="/vaquita/vaquita_isotipo.svg"
            alt={t('auth.login.logoAlt')}
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
                alt={t('auth.login.logoAlt')}
                width={180}
                height={180}
                className="object-contain"
                priority
              />
            </div>

            <h1 className="text-3xl font-bold text-black">{t('auth.login.welcomeTitle')}</h1>
            <p className="text-gray-600 text-center mb-2">{t('auth.login.welcomeSubtitle')}</p>

            {/* Botones de autenticación dentro de la card */}
            <div className="w-full flex flex-col gap-2">
              <StellarAuthButtons />
            </div>

            {/* Botón para volver a ver el intro (testeo / replay) */}
            <button
              onClick={replay}
              className="mt-1 text-sm font-semibold text-black/50 hover:text-black underline underline-offset-2 transition"
            >
              {t('auth.login.viewIntroAgain')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

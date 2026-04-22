'use client';

import StellarAuthButtons from '@/components/profile/StellarAuthButtons';
import { DummyAuthButtons, NetworkSelector } from '@/core-ui/components';
import { useIsAuthenticated, useNetworks } from '@/core-ui/hooks';
import { useNetworkConfigStore } from '@/core-ui/stores';
import { isDummyNetwork } from '@/networks/dummy';
import { isStellarNetwork } from '@/networks/stellar';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function LoginPage() {
  const isAuthenticated = useIsAuthenticated();
  const router = useRouter();
  const { network } = useNetworkConfigStore();
  const {
    data: { types },
  } = useNetworks();

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/home');
    }
  }, [isAuthenticated, router]);

  // No mostrar nada mientras se verifica la autenticación o si ya está autenticado
  if (isAuthenticated) {
    return null;
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
        {/* Botones de autenticación en la parte superior */}
        {types.length > 0 && (
          <div className="absolute top-4 right-4 z-10">
            <div className="flex justify-end gap-0">
              <NetworkSelector />
              {network && isStellarNetwork(network.name) && <StellarAuthButtons />}
              {isDummyNetwork() && <DummyAuthButtons />}
            </div>
          </div>
        )}

        <div className="w-full max-w-md border-2 border-primary rounded-lg p-8 bg-white/80 backdrop-blur-sm shadow-lg">
          <div className="flex flex-col items-center gap-4 mt-2">
            {/* Logo móvil */}
            <div className="md:hidden mb-4">
              <Image
                src="/vaquita/vaquita_logo.png"
                alt="Vaquita Logo"
                width={180}
                height={180}
                className="object-contain"
                priority
              />
            </div>

            <h1 className="text-3xl font-bold text-black mb-2">Welcome</h1>
            <p className="text-gray-600 text-center mb-6">Connect your wallet to start saving securely</p>
          </div>
        </div>
      </div>
    </div>
  );
}

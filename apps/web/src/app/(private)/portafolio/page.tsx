import { PortfolioFlow } from '@/core-ui/components';
import { Suspense } from 'react';

// Fallback real de /portafolio: solo se usa en refresh o link directo (la
// navegación suave la intercepta `@modal/(.)portafolio`). Sin home 3D detrás,
// renderiza el mismo flujo en modo página. `?period` exige el Suspense.
export default function Page() {
  return (
    <Suspense>
      <PortfolioFlow mode="page" />
    </Suspense>
  );
}

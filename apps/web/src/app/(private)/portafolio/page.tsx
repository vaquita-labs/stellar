import { PortfolioFlow } from '@/core-ui/components';
import { Suspense } from 'react';

// /portafolio es una página normal. `?period` (useSearchParams dentro de
// PortfolioFlow) exige el límite de Suspense.
export default function Page() {
  return (
    <Suspense>
      <PortfolioFlow />
    </Suspense>
  );
}

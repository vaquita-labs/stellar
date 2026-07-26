import { PortfolioPage } from '@/core-ui/components';
import { Suspense } from 'react';

// useSearchParams (el `?period=` que preselecciona el filtro) obliga a un límite
// de Suspense, igual que /transactions.
export default function Page() {
  return (
    <Suspense>
      <PortfolioPage />
    </Suspense>
  );
}

import { TransactionsPage } from '@/core-ui/components';
import { Suspense } from 'react';

// useSearchParams (el `?tx=` que abre el detalle) obliga a un límite de Suspense.
export default function Page() {
  return (
    <Suspense>
      <TransactionsPage />
    </Suspense>
  );
}

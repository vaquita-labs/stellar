'use client';

import { HomePage } from '@/core-ui/components';
import { Suspense } from 'react';

// HeaderStats abre el panel de portafolio por `?portfolio=1` (useSearchParams),
// que exige un límite de Suspense.
export default function Page() {
  return (
    <Suspense>
      <HomePage />
    </Suspense>
  );
}

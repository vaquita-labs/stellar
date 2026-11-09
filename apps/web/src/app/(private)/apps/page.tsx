'use client';

import { HomePage } from '@/core-ui/components';
import { Suspense } from 'react';

// The Apps tab is the 3D world: map, the vaquita, streak/coins/stars and the
// shop — what /home was before it became the money dashboard. Same Suspense
// boundary as /home, for the same reason (see that page).
export default function Page() {
  return (
    <Suspense>
      <HomePage variant="world" />
    </Suspense>
  );
}

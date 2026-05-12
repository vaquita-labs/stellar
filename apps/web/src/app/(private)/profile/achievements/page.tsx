import { AllAchievementsPage } from '@/core-ui/components';
import { Suspense } from 'react';

export default function Page() {
  // `useSearchParams` needs a Suspense boundary in app router.
  return (
    <Suspense fallback={null}>
      <AllAchievementsPage />
    </Suspense>
  );
}

import { PortfolioFlow } from '@/core-ui/components';
import { Suspense } from 'react';

// Ruta interceptora: al navegar en cliente a /portafolio (desde el saldo del
// header o al tocar un plazo), Next pinta esto en el slot `@modal` y RETIENE
// /home en `children` detrás → el mundo 3D no se desmonta ni recarga. Un refresh
// o link directo NO interceptan y caen en `(private)/portafolio/page.tsx`.
// `?period` (useSearchParams dentro de PortfolioFlow) exige el límite de Suspense.
export default function Page() {
  return (
    <Suspense>
      <PortfolioFlow mode="overlay" />
    </Suspense>
  );
}

import { TransactionsPage } from '@/core-ui/components';
import { redirect } from 'next/navigation';

// El detalle solía abrirse con `?tx=` sobre esta misma ruta. Ahora es su propia
// página, así que un link o un historial viejo se manda a donde vive hoy.
export default async function Page({ searchParams }: { searchParams: Promise<{ tx?: string | string[] }> }) {
  const { tx } = await searchParams;
  const transactionId = Array.isArray(tx) ? tx[0] : tx;
  if (transactionId) redirect(`/transactions/${encodeURIComponent(transactionId)}`);

  return <TransactionsPage />;
}

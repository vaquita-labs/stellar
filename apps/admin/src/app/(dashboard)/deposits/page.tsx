'use client';

import { GenericTable } from '@/core-ui/components';
import { useAdminDeposits } from '@/core-ui/hooks';
import { useMemo } from 'react';

export default function Page() {
  const { data, refetch } = useAdminDeposits();
  const rows = useMemo(() => data?.deposits ?? [], [data]);
  return <GenericTable rows={rows as unknown as Record<string, unknown>[]} refetch={refetch} />;
}

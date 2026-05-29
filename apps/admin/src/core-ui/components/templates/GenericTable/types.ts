import { ReactNode } from 'react';

export interface GenericTableProps {
  rows: Record<string, unknown>[];
  refetch: () => void;
  children?: (data: Record<string, unknown>) => ReactNode;
}

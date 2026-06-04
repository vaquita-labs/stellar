import { ReactNode } from 'react';

export interface GenericTableProps {
  rows: Record<string, unknown>[];
  refetch: () => void;
  children?: (data: Record<string, unknown>) => ReactNode;
  /**
   * Field names kept in the row data (so `children` can read them) but NOT
   * rendered as their own columns. Useful for long raw values surfaced through
   * an action column instead (e.g. tx hash, full JSON payload).
   */
  hiddenKeys?: string[];
}

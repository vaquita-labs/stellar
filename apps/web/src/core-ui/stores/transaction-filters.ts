import { create } from 'zustand';
import type { TransactionFilters } from '../helpers/transactions';

/**
 * The transaction list's filters, kept while one of its movements is open.
 *
 * The detail is a page of its own (/transactions/[id]), so opening it unmounts
 * the list and its filters with it: coming back used to mean rebuilding the
 * filter for every movement looked at. The list parks them here on the way out
 * and takes them back on the way in.
 *
 * Only that round trip is covered, on purpose — the list lets go of them as soon
 * as it has mounted, so walking into it from anywhere else starts with
 * everything showing. In memory only: a reload is a fresh start too.
 */
type TransactionFiltersState = {
  held: TransactionFilters | null;
  hold: (filters: TransactionFilters) => void;
  release: () => void;
};

export const useTransactionFiltersStore = create<TransactionFiltersState>((set) => ({
  held: null,
  hold: (filters) => set({ held: filters }),
  release: () => set({ held: null }),
}));

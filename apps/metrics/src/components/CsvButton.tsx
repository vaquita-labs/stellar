'use client';

import { toCsv, type CsvRow } from '@/lib/csv';

// "Download CSV" for one chart/table. The rows are already in the page (the
// same data the chart draws), so the export is a pure client-side blob.
export function CsvButton({ rows, filename, columns }: { rows: CsvRow[]; filename: string; columns?: string[] }) {
  const onClick = () => {
    const csv = toCsv(rows, columns);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={rows.length === 0}
      className="shrink-0 whitespace-nowrap rounded-md border border-black/15 bg-white px-2 py-1 text-xs font-medium text-black/70 transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40"
    >
      ↓ CSV
    </button>
  );
}

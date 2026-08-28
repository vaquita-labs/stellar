'use client';

import { CsvButton } from '@/components/CsvButton';
import type { CsvRow } from '@/lib/csv';
import type { ReactNode } from 'react';

// Frame shared by every chart: title, one-line definition, CSV export of the
// exact rows the chart draws, and the plot area.
export function ChartCard({
  title,
  hint,
  rows,
  filename,
  children,
}: {
  title: string;
  hint?: string;
  rows: CsvRow[];
  filename: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-black border-b-2 bg-white p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="text-sm font-semibold text-black">{title}</h2>
          {hint && <p className="text-xs text-black/50">{hint}</p>}
        </div>
        <CsvButton rows={rows} filename={filename} />
      </header>
      {rows.length === 0 ? <p className="py-10 text-center text-sm text-black/40">No data in this range.</p> : children}
    </section>
  );
}

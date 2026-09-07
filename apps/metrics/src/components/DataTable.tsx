import { CsvButton } from '@/components/CsvButton';
import type { CsvRow } from '@/lib/csv';
import type { ReactNode } from 'react';

// Plain table with its own CSV export — used for leaderboards and breakdowns
// where the numbers matter more than the shape.
export function DataTable({
  title,
  hint,
  rows,
  columns,
  filename,
  footer,
}: {
  title: string;
  hint?: string;
  rows: CsvRow[];
  columns: { key: string; label: string; align?: 'left' | 'right' }[];
  filename: string;
  /** Rendered below the table — a pager, when the rows are one page of many. */
  footer?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-black border-b-2 bg-white p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="text-sm font-semibold text-black">{title}</h2>
          {hint && <p className="text-xs text-black/50">{hint}</p>}
        </div>
        <CsvButton rows={rows} filename={filename} columns={columns.map((c) => c.key)} />
      </header>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-black/40">No data.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 text-xs uppercase tracking-wide text-black/50">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={`py-1.5 pr-3 font-medium ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-black/5 last:border-0">
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`py-1.5 pr-3 tabular-nums ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                    >
                      {r[c.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {footer}
    </section>
  );
}

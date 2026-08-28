import { CsvButton } from '@/components/CsvButton';
import type { CohortCell } from '@/lib/queries/retention';
import { nowMs } from '@/lib/range';

// Weekly cohort grid. Cell colour is a single-hue sequential ramp of the
// retention share, and the number is always printed, so colour is never the
// only encoding.
export function CohortGrid({ cells, maxWeeks = 8 }: { cells: CohortCell[]; maxWeeks?: number }) {
  const cohorts = new Map<string, { size: number; byOffset: Map<number, number> }>();
  for (const c of cells) {
    const entry = cohorts.get(c.cohort) ?? { size: c.size, byOffset: new Map() };
    entry.byOffset.set(c.offset_weeks, c.active);
    cohorts.set(c.cohort, entry);
  }
  const rows = [...cohorts.entries()].sort(([a], [b]) => a.localeCompare(b));
  const offsets = Array.from({ length: maxWeeks }, (_, i) => i);
  const now = nowMs();

  const csv = rows.map(([cohort, r]) => ({
    cohort,
    size: r.size,
    ...Object.fromEntries(offsets.map((o) => [`week_${o}`, r.byOffset.get(o) ?? 0])),
  }));

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-black border-b-2 bg-white p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="text-sm font-semibold text-black">Repeat-deposit cohorts (weekly)</h2>
          <p className="text-xs text-black/50">
            Cohort = week of a wallet&apos;s first confirmed deposit. Cells: % of that cohort that made another
            confirmed deposit N weeks after the first one (W0 = same week). Greyed cells are still in the future.
          </p>
        </div>
        <CsvButton rows={csv} filename="deposit-cohorts" />
      </header>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-black/40">No cohorts in this range.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr className="text-black/50">
                <th className="py-1 pr-3 text-left font-medium">Cohort</th>
                <th className="py-1 pr-3 text-right font-medium">Wallets</th>
                {offsets.map((o) => (
                  <th key={o} className="w-14 py-1 text-center font-medium">
                    W{o}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([cohort, r]) => {
                const cohortStart = new Date(`${cohort}T00:00:00Z`).getTime();
                return (
                  <tr key={cohort}>
                    <td className="py-0.5 pr-3 font-medium text-black tabular-nums">{cohort}</td>
                    <td className="py-0.5 pr-3 text-right tabular-nums">{r.size}</td>
                    {offsets.map((o) => {
                      const future = cohortStart + o * 7 * 86_400_000 > now;
                      const active = r.byOffset.get(o) ?? 0;
                      const share = r.size ? active / r.size : 0;
                      return (
                        <td key={o} className="p-0.5">
                          <div
                            className="flex h-7 items-center justify-center rounded tabular-nums"
                            style={
                              future
                                ? { background: '#26262608', color: '#26262640' }
                                : {
                                    background: `rgba(217, 113, 43, ${0.08 + share * 0.72})`,
                                    color: share > 0.55 ? '#fff' : '#262626',
                                  }
                            }
                            title={future ? 'not yet' : `${active} of ${r.size}`}
                          >
                            {future ? '·' : `${Math.round(share * 100)}%`}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

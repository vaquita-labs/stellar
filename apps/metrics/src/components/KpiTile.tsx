import { fmtDelta } from '@/lib/format';

// Headline number. `previous` (same metric one period earlier) renders a
// delta chip; `hint` is the one-line definition so nobody has to guess.
export function KpiTile({
  label,
  value,
  previous,
  current,
  hint,
}: {
  label: string;
  value: string;
  current?: number;
  previous?: number;
  hint?: string;
}) {
  const delta = current != null && previous != null ? fmtDelta(current, previous) : null;
  const up = delta?.startsWith('+') || delta === 'new';
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-black border-b-2 bg-white p-4">
      <span className="text-xs font-medium uppercase tracking-wide text-black/55">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-black tabular-nums">{value}</span>
        {delta && (
          <span
            className={`rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums ${
              delta === '—'
                ? 'bg-black/5 text-black/50'
                : up
                  ? 'bg-success/15 text-green-800'
                  : 'bg-error/15 text-red-800'
            }`}
            title="vs previous period of the same length"
          >
            {delta}
          </span>
        )}
      </div>
      {hint && <span className="text-xs text-black/50">{hint}</span>}
    </div>
  );
}

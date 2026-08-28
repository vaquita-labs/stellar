import { CopyButton } from '@/components/CopyButton';
import { weeklyReport } from '@/lib/report';
import { nowMs } from '@/lib/range';
import { getServerEnv } from '@/lib/serverEnv';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const day = (d: Date) => d.toISOString().slice(0, 10);

export default async function ReportPage({ searchParams }: Props) {
  const params = await searchParams;
  const toParam = typeof params.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.to) ? params.to : null;
  const to = toParam ? new Date(`${toParam}T00:00:00Z`) : new Date();
  const report = await weeklyReport(to, getServerEnv().METRICS_ENV_LABEL);
  const prevTo = day(report.from);
  const nextTo = day(new Date(report.to.getTime() + 7 * 86_400_000));
  const canGoNext = toParam != null && report.to.getTime() + 7 * 86_400_000 <= nowMs();

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-black">Weekly report</h1>
          <p className="text-sm text-black/60">
            {day(report.from)} → {day(new Date(report.to.getTime() - 1))}, compared with the 7 days before. Paste the
            markdown into Slack, Notion or a tranche report.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/report?to=${prevTo}`}
            className="rounded-md border border-black/15 bg-white px-3 py-1 text-xs font-medium text-black/70 hover:bg-black/5"
          >
            ← Previous week
          </a>
          {canGoNext ? (
            <a
              href={`/report?to=${nextTo}`}
              className="rounded-md border border-black/15 bg-white px-3 py-1 text-xs font-medium text-black/70 hover:bg-black/5"
            >
              Next week →
            </a>
          ) : null}
          {toParam ? (
            <a
              href="/report"
              className="rounded-md border border-black/15 bg-white px-3 py-1 text-xs font-medium text-black/70 hover:bg-black/5"
            >
              Trailing 7 days
            </a>
          ) : null}
          <a
            href={`/api/report${toParam ? `?to=${toParam}` : ''}`}
            className="rounded-md border border-black/15 bg-white px-3 py-1 text-xs font-medium text-black/70 hover:bg-black/5"
          >
            ↓ .md
          </a>
          <CopyButton text={report.markdown} />
        </div>
      </div>

      <div className="rounded-xl border border-black border-b-2 bg-white p-4">
        <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-black">
          {report.markdown}
        </pre>
      </div>
    </>
  );
}

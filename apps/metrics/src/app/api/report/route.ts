import { NextResponse, type NextRequest } from 'next/server';
import { weeklyReport } from '@/lib/report';
import { getServerEnv } from '@/lib/serverEnv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/report?to=YYYY-MM-DD — the weekly report as a downloadable .md
// (the 7 days ending at `to`, exclusive; default: the trailing week).
export async function GET(req: NextRequest) {
  const toParam = req.nextUrl.searchParams.get('to');
  const to = toParam && /^\d{4}-\d{2}-\d{2}$/.test(toParam) ? new Date(`${toParam}T00:00:00Z`) : new Date();
  if (Number.isNaN(to.getTime()))
    return NextResponse.json({ status: 'error', message: 'Invalid `to` date' }, { status: 400 });

  const report = await weeklyReport(to, getServerEnv().METRICS_ENV_LABEL);
  const name = `vaquita-weekly-${report.from.toISOString().slice(0, 10)}.md`;
  return new NextResponse(report.markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
    },
  });
}

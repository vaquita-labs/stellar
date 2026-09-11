import { ChartCard } from '@/components/ChartCard';
import { DataTable } from '@/components/DataTable';
import { KpiTile } from '@/components/KpiTile';
import { Pager } from '@/components/Pager';
import { RangePicker } from '@/components/RangePicker';
import { SERIES, CategoryBars, TimeSeriesBars } from '@/components/charts';
import { fmtInt, fmtUsd } from '@/lib/format';
import { sqlWindow } from '@/lib/queries/common';
import { onrampCorridors } from '@/lib/queries/ramps';
import {
  edgeFlowSeries,
  volumeByKind,
  volumeByUser,
  volumeKpis,
  volumeSeries,
  volumeTables,
} from '@/lib/queries/volume';
import { parsePage } from '@/lib/range';
import { resolveRange } from '@/lib/rangePrefs';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const shortWallet = (wallet: string) => `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;

// A boundary keeps one color across all three charts on this page. Index-based
// coloring cannot promise that — the charts list their series in different
// orders — which is the whole reason `SeriesDef.color` exists.
const EDGE_COLOR = SERIES[1];
const SAVINGS_COLOR = SERIES[2];
const P2P_COLOR = SERIES[3];
// Arriving versus leaving, on the one chart that contrasts them.
const OUT_COLOR = SERIES[0];

const KIND_LABELS: Record<string, string> = {
  locked_deposit: 'Locked deposit',
  locked_withdrawal: 'Locked withdrawal',
  vault_in: 'Vault in',
  vault_out: 'Vault out',
  offramp: 'Off-ramp',
  bridge_in: 'Bridge in',
  bridge_out: 'Bridge out',
  external_send: 'Sent outside',
  p2p_send: 'Sent to a user',
};

export default async function VolumePage({ searchParams }: Props) {
  const params = await searchParams;
  const range = await resolveRange(params);
  const page = parsePage(params);

  // Four of the six source tables are hand-applied per environment, and a
  // missing relation fails the statement at parse time. Probe once, then pass
  // the flags down, so an environment that is behind loses a contribution
  // rather than the page.
  const tables = await volumeTables();

  const w = await sqlWindow(range);
  const [kpis, series, flow, kinds, users, onramp] = await Promise.all([
    volumeKpis(w, tables),
    volumeSeries(w, tables),
    edgeFlowSeries(w, tables),
    volumeByKind(w, tables),
    volumeByUser(tables, { limit: page.limit, offset: page.offset }),
    tables.onramp ? onrampCorridors(w) : Promise.resolve([]),
  ]);
  const prev = w.hasPrev;

  const netSavings = kpis.savings_in - kpis.savings_out;
  const netSavingsPrev = kpis.savings_in_prev - kpis.savings_out_prev;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-black">Volume</h1>
          <p className="text-sm text-black/60">
            How much money moved through the app, and across which boundary.
          </p>
        </div>
        <RangePicker range={range.key} bucket={range.bucket} />
      </div>

      {/* Three boundaries, no event in two of them, so they add up. Stated
          before the numbers because a reader who takes gross volume for a
          balance is wrong by a multiple. */}
      <div className="rounded-xl border border-black/10 bg-white p-4 text-sm text-black/70">
        <p>
          <strong className="font-semibold text-black">Gross volume counts crossings, not balances.</strong> A dollar
          that arrives, goes into the vault, comes back and leaves is four crossings of three different boundaries:{' '}
          <strong className="font-semibold text-black">edge</strong> (money entering or leaving Vaquita),{' '}
          <strong className="font-semibold text-black">savings</strong> (wallet ↔ vault or lock period) and{' '}
          <strong className="font-semibold text-black">peer to peer</strong> (one user to another). No movement is
          filed under two boundaries, so the three sum cleanly — but the total is processed value, not money held.
        </p>
        <p className="mt-2">What is missing, and cannot be backfilled:</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-black/60">
          <li>Argentine pesos are absent entirely — neither ramp leg has a table.</li>
          <li>
            Bolivian on-ramp value is local currency with no stored rate, so it appears below as a count plus fiat and
            is excluded from every USD figure here.
          </li>
          <li>Flexible-vault movements start 2026-09-10; Soroban keeps about a week of events.</li>
          <li>Withdrawn value is the parent deposit&apos;s principal — yield leaving is never recorded.</li>
          <li>
            {tables.walletTransfers
              ? 'Outbound and peer-to-peer sends start with the deploy that added them.'
              : 'Sends are not recorded in this environment yet: apply 20260910_wallet_transfers.sql.'}
          </li>
          <li>Money paid straight into a wallet from outside counts only once it reaches savings.</li>
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KpiTile
          label="Gross volume"
          value={fmtUsd(kpis.gross)}
          current={kpis.gross}
          previous={prev ? kpis.gross_prev : undefined}
          hint={`${fmtUsd(kpis.gross_all)} all time`}
        />
        <KpiTile
          label="Into the app"
          value={fmtUsd(kpis.edge_in)}
          current={kpis.edge_in}
          previous={prev ? kpis.edge_in_prev : undefined}
          hint="bridged in, settled only"
        />
        <KpiTile
          label="Out of the app"
          value={fmtUsd(kpis.edge_out)}
          current={kpis.edge_out}
          previous={prev ? kpis.edge_out_prev : undefined}
          hint="off-ramp, bridge out, sends to outsiders"
        />
        <KpiTile
          label="Net into savings"
          value={fmtUsd(netSavings)}
          current={netSavings}
          previous={prev ? netSavingsPrev : undefined}
          hint={`${fmtUsd(kpis.savings_in)} in, ${fmtUsd(kpis.savings_out)} out`}
        />
        <KpiTile
          label="Peer to peer"
          value={fmtUsd(kpis.p2p)}
          current={kpis.p2p}
          previous={prev ? kpis.p2p_prev : undefined}
          hint="user to user, stays inside the app"
        />
        <KpiTile
          label="Active wallets"
          value={fmtInt(kpis.wallets)}
          current={kpis.wallets}
          previous={prev ? kpis.wallets_prev : undefined}
          hint="moved money at least once in range"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Volume by boundary"
          hint={`Value crossing each boundary per ${range.bucket}. The three stack because no movement is in two of them.`}
          rows={series}
          filename={`volume-${range.key}-${range.bucket}`}
        >
          <TimeSeriesBars
            rows={series}
            stacked
            series={[
              { key: 'savings', label: 'Savings', kind: 'usd', color: SAVINGS_COLOR },
              { key: 'edge', label: 'Edge', kind: 'usd', color: EDGE_COLOR },
              { key: 'p2p', label: 'Peer to peer', kind: 'usd', color: P2P_COLOR },
            ]}
          />
        </ChartCard>
        {/* Edge only. Summing money entering the app with money entering the
            vault would add two different meanings of "in". */}
        <ChartCard
          title="Into and out of the app"
          hint="Edge crossings only, so a period where more money left than arrived is visible."
          rows={flow}
          filename={`volume-edge-flow-${range.key}-${range.bucket}`}
        >
          <TimeSeriesBars
            rows={flow}
            series={[
              { key: 'inbound', label: 'Arrived', kind: 'usd', color: EDGE_COLOR },
              { key: 'outbound', label: 'Left', kind: 'usd', color: OUT_COLOR },
            ]}
          />
        </ChartCard>
      </div>

      <ChartCard
        title="By movement type"
        hint="Every recorded way money moves, in range. An unexpectedly large block here is usually one test transfer."
        rows={kinds.map((r) => ({ ...r, kind: KIND_LABELS[r.kind] ?? r.kind }))}
        filename={`volume-by-kind-${range.key}`}
      >
        <CategoryBars
          rows={kinds.map((r) => ({ kind: KIND_LABELS[r.kind] ?? r.kind, amount: r.amount }))}
          category="kind"
          series={{ key: 'amount', label: 'Value', kind: 'usd', color: EDGE_COLOR }}
        />
      </ChartCard>

      {tables.onramp && (
        <DataTable
          title="On-ramp by corridor"
          hint="Local currency, and not convertible: no USDC column and no stored rate. Excluded from every USD figure above."
          rows={onramp.map((r) => ({
            corridor: r.corridor,
            started: r.started,
            settled: r.settled,
            fiat: `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(r.fiat)} ${r.currency}`,
          }))}
          columns={[
            { key: 'corridor', label: 'Corridor' },
            { key: 'started', label: 'Started', align: 'right' },
            { key: 'settled', label: 'Settled', align: 'right' },
            { key: 'fiat', label: 'Settled value', align: 'right' },
          ]}
          filename={`volume-onramp-corridors-${range.key}`}
        />
      )}

      <DataTable
        title="Volume by user"
        hint="Lifetime, not the range above — 'moved so far' is the question. Sorted by gross volume."
        rows={users.rows.map((r) => ({
          nickname: r.nickname ?? '—',
          wallet: shortWallet(r.wallet),
          gross: fmtUsd(r.gross),
          edge_in: fmtUsd(r.edge_in),
          edge_out: fmtUsd(r.edge_out),
          savings_in: fmtUsd(r.savings_in),
          savings_out: fmtUsd(r.savings_out),
          p2p: fmtUsd(r.p2p),
          movements: r.movements,
          last_move: r.last_move.toISOString().slice(0, 10),
        }))}
        columns={[
          { key: 'nickname', label: 'Nickname' },
          { key: 'wallet', label: 'Wallet' },
          { key: 'gross', label: 'Gross', align: 'right' },
          { key: 'edge_in', label: 'In', align: 'right' },
          { key: 'edge_out', label: 'Out', align: 'right' },
          { key: 'savings_in', label: 'Saved', align: 'right' },
          { key: 'savings_out', label: 'Unsaved', align: 'right' },
          { key: 'p2p', label: 'P2P', align: 'right' },
          { key: 'movements', label: 'Moves', align: 'right' },
          { key: 'last_move', label: 'Last', align: 'right' },
        ]}
        filename={`volume-by-user-p${page.page}`}
        footer={
          <Pager
            page={page.page}
            limit={page.limit}
            total={users.total}
            params={{ range: range.key, bucket: range.bucket, limit: String(page.limit) }}
          />
        }
      />
    </>
  );
}

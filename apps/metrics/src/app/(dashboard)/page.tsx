import { ChartCard } from '@/components/ChartCard';
import { KpiTile } from '@/components/KpiTile';
import { RangePicker } from '@/components/RangePicker';
import { TimeSeriesBars, TimeSeriesLine } from '@/components/charts';
import { fmtInt, fmtPct, fmtUsd } from '@/lib/format';
import { sqlWindow } from '@/lib/queries/common';
import { depositKpis, depositSeries } from '@/lib/queries/deposits';
import { signupSeries, userKpis } from '@/lib/queries/users';
import { sampleAge, vaultTvl } from '@/lib/queries/vault';
import { resolveRange } from '@/lib/rangePrefs';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function OverviewPage({ searchParams }: Props) {
  const range = await resolveRange(await searchParams);
  const w = await sqlWindow(range);
  const [users, deposits, signups, series, vault] = await Promise.all([
    userKpis(w),
    depositKpis(w),
    signupSeries(w),
    depositSeries(w),
    vaultTvl(w),
  ]);
  const prev = w.hasPrev;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-black">Overview</h1>
          <p className="text-sm text-black/60">
            Growth at a glance. Deltas compare with the previous period of the same length.{' '}
            <Link href="/report" className="underline">
              Weekly report →
            </Link>
          </p>
        </div>
        <RangePicker range={range.key} bucket={range.bucket} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KpiTile label="Total users" value={fmtInt(users.total_users)} hint="profiles, all time" />
        <KpiTile
          label="New users"
          value={fmtInt(users.new_users)}
          current={users.new_users}
          previous={prev ? users.new_users_prev : undefined}
          hint="profiles created in range"
        />
        <KpiTile
          label="Depositors"
          value={fmtInt(deposits.depositors)}
          current={deposits.depositors}
          previous={prev ? deposits.depositors_prev : undefined}
          hint="wallets with a confirmed deposit in range"
        />
        <KpiTile
          label="Deposit volume"
          value={fmtUsd(deposits.volume)}
          current={deposits.volume}
          previous={prev ? deposits.volume_prev : undefined}
          hint="confirmed USDC in range"
        />
        {/* The vault is the real TVL: principal plus accrued yield plus flexible
            balances. Falls back to the ledger figure on environments that have
            not sampled the vault yet. */}
        {vault ? (
          <KpiTile
            label="Vault TVL"
            value={fmtUsd(vault.current)}
            hint={`DeFindex vault · read ${sampleAge(vault.fetchedAt)}`}
          />
        ) : (
          <KpiTile
            label="Locked principal"
            value={fmtUsd(deposits.tvl)}
            hint={`${fmtInt(deposits.active_positions)} open positions now`}
          />
        )}
        <KpiTile
          label="Activation"
          value={users.activation_cohort ? fmtPct(users.activated_ever / users.activation_cohort) : '—'}
          hint="new users in range with ≥1 confirmed deposit"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="New users"
          hint={`Profiles created per ${range.bucket}`}
          rows={signups}
          filename={`new-users-${range.key}-${range.bucket}`}
        >
          <TimeSeriesBars rows={signups} series={[{ key: 'signups', label: 'New users' }]} />
        </ChartCard>
        <ChartCard
          title="Total users"
          hint="Running total of profiles"
          rows={signups}
          filename={`total-users-${range.key}-${range.bucket}`}
        >
          <TimeSeriesLine rows={signups} series={[{ key: 'total', label: 'Users' }]} />
        </ChartCard>
        <ChartCard
          title="Deposit volume"
          hint={`Confirmed USDC per ${range.bucket}`}
          rows={series}
          filename={`deposit-volume-${range.key}-${range.bucket}`}
        >
          <TimeSeriesBars rows={series} series={[{ key: 'volume', label: 'Deposited', kind: 'usd' }]} />
        </ChartCard>
        {vault ? (
          <ChartCard
            title="Vault TVL"
            hint="DeFindex vault total managed funds, last reading of each bucket"
            rows={vault.series}
            filename={`vault-tvl-${range.key}-${range.bucket}`}
          >
            <TimeSeriesLine rows={vault.series} series={[{ key: 'vault_tvl', label: 'Vault TVL', kind: 'usd' }]} />
          </ChartCard>
        ) : (
          <ChartCard
            title="Locked principal (TVL)"
            hint="Confirmed principal minus withdrawn principal, at the end of each bucket"
            rows={series}
            filename={`tvl-${range.key}-${range.bucket}`}
          >
            <TimeSeriesLine rows={series} series={[{ key: 'tvl', label: 'Locked principal', kind: 'usd' }]} />
          </ChartCard>
        )}
      </div>
    </>
  );
}

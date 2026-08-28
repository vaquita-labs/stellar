import { prisma } from '@vaquita/db';
import { fmtInt, fmtPct, fmtUsd } from '@/lib/format';

// The weekly report: one markdown document a teammate can paste into Slack,
// Notion or an investor/SCF update. Everything is "last 7 days vs the 7 days
// before" plus the all-time totals, computed in one SQL round-trip per period.

export type PeriodStats = {
  new_users: number;
  activated: number;
  deposits: number;
  volume: number;
  depositors: number;
  new_depositors: number;
  withdrawals: number;
  early: number;
  principal_withdrawn: number;
  badges: number;
  follows: number;
  checkin_users: number;
  onramp_settled: number;
  tvl_end: number;
};

export type Totals = {
  users: number;
  depositors: number;
  deposits: number;
  volume: number;
  tvl: number;
  active_positions: number;
  badges: number;
};

export type WeeklyReport = {
  from: Date;
  to: Date;
  current: PeriodStats;
  previous: PeriodStats;
  totals: Totals;
  markdown: string;
};

async function periodStats(from: Date, to: Date): Promise<PeriodStats> {
  const [row] = await prisma.$queryRaw<PeriodStats[]>`
    with c as (
      select wallet_address, amount, coalesce(confirmed_at, created_at) as ts, id
      from deposits where deleted_at is null and status = 'confirmed'
    ),
    firsts as (select wallet_address, min(ts) as first_ts from c group by 1),
    wd as (
      select w.*, d.amount as principal,
             (coalesce(w.confirmed_at, w.created_at) < coalesce(d.confirmed_at, d.created_at) + (coalesce(d.lock_period, 0)::float8 / 1000) * interval '1 second') as early,
             coalesce(w.confirmed_at, w.created_at) as ts
      from withdrawals w join deposits d on d.id = w.deposit_id
      where w.deleted_at is null and w.status = 'confirmed'
    )
    select
      (select count(*) from profiles where deleted_at is null and created_at >= ${from} and created_at < ${to})::int as new_users,
      (select count(*) from profiles p where p.deleted_at is null and p.created_at >= ${from} and p.created_at < ${to}
         and exists (select 1 from c where c.wallet_address = p.wallet_address))::int as activated,
      (select count(*) from c where ts >= ${from} and ts < ${to})::int as deposits,
      (select coalesce(sum(amount), 0) from c where ts >= ${from} and ts < ${to})::float8 as volume,
      (select count(distinct wallet_address) from c where ts >= ${from} and ts < ${to})::int as depositors,
      (select count(*) from firsts where first_ts >= ${from} and first_ts < ${to})::int as new_depositors,
      (select count(*) from wd where ts >= ${from} and ts < ${to})::int as withdrawals,
      (select count(*) from wd where ts >= ${from} and ts < ${to} and early)::int as early,
      (select coalesce(sum(principal), 0) from wd where ts >= ${from} and ts < ${to})::float8 as principal_withdrawn,
      (select count(*) from badge_claims where deleted_at is null and confirmed_at >= ${from} and confirmed_at < ${to})::int as badges,
      (select count(*) from follows where created_at >= ${from} and created_at < ${to})::int as follows,
      (select count(distinct profile_id) from profiles_rewards where reason = 'daily-checkin' and created_at >= ${from} and created_at < ${to})::int as checkin_users,
      (select count(*) from onramp_purchases where deleted_at is null and status = 'settled' and updated_at >= ${from} and updated_at < ${to})::int as onramp_settled,
      ((select coalesce(sum(amount), 0) from c where ts < ${to}) - (select coalesce(sum(principal), 0) from wd where ts < ${to}))::float8 as tvl_end
  `;
  return row!;
}

async function totals(): Promise<Totals> {
  const [row] = await prisma.$queryRaw<Totals[]>`
    with c as (select * from deposits where deleted_at is null and status = 'confirmed'),
    withdrawn as (select d.id from withdrawals w join deposits d on d.id = w.deposit_id where w.deleted_at is null and w.status = 'confirmed')
    select
      (select count(*) from profiles where deleted_at is null)::int as users,
      (select count(distinct wallet_address) from c)::int as depositors,
      (select count(*) from c)::int as deposits,
      (select coalesce(sum(amount), 0) from c)::float8 as volume,
      (select coalesce(sum(amount), 0) from c where id not in (select id from withdrawn))::float8 as tvl,
      (select count(*) from c where id not in (select id from withdrawn))::int as active_positions,
      (select count(*) from badge_claims where deleted_at is null and confirmed_at is not null)::int as badges
  `;
  return row!;
}

/** Report for the 7 days ending at `to` (exclusive; default = now, i.e. the trailing week). */
export async function weeklyReport(to: Date = new Date(), envLabel = ''): Promise<WeeklyReport> {
  const week = 7 * 86_400_000;
  const from = new Date(to.getTime() - week);
  const prevFrom = new Date(from.getTime() - week);

  // onramp_purchases may not exist on older environments: fall back to a
  // version of the same query without it rather than lose the whole report.
  const safePeriod = async (a: Date, b: Date): Promise<PeriodStats> => {
    try {
      return await periodStats(a, b);
    } catch (err) {
      if (!/onramp_purchases/.test(String(err))) throw err;
      await prisma.$executeRaw`create temporary table if not exists onramp_purchases (deleted_at timestamptz, status text, updated_at timestamptz)`;
      return periodStats(a, b);
    }
  };

  const [current, previous, all] = await Promise.all([safePeriod(from, to), safePeriod(prevFrom, from), totals()]);
  const markdown = renderMarkdown({ from, to, current, previous, totals: all, envLabel });
  return { from, to, current, previous, totals: all, markdown };
}

const day = (d: Date) => d.toISOString().slice(0, 10);

const delta = (cur: number, prev: number) => {
  if (!prev) return cur ? '(new)' : '';
  const d = ((cur - prev) / prev) * 100;
  return `(${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(0)}% vs prev)`;
};

function renderMarkdown(r: {
  from: Date;
  to: Date;
  current: PeriodStats;
  previous: PeriodStats;
  totals: Totals;
  envLabel: string;
}): string {
  const { current: c, previous: p, totals: t } = r;
  const line = (label: string, cur: string, curN: number, prevN: number, prevStr: string) =>
    `| ${label} | ${cur} | ${prevStr} | ${delta(curN, prevN)} |`;
  const activation = c.new_users ? fmtPct(c.activated / c.new_users) : '—';
  const earlyShare = c.withdrawals ? fmtPct(c.early / c.withdrawals) : '—';

  return [
    `# Vaquita weekly growth report${r.envLabel ? ` — ${r.envLabel}` : ''}`,
    ``,
    `**Week:** ${day(r.from)} → ${day(new Date(r.to.getTime() - 1))} · generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    ``,
    `## Headline`,
    ``,
    `- **${fmtInt(c.new_users)} new users**${p.new_users ? ` ${delta(c.new_users, p.new_users)}` : ''}, ${fmtInt(c.activated)} of them already made a confirmed deposit (${activation}).`,
    `- **${fmtUsd(c.volume)} deposited** across ${fmtInt(c.deposits)} deposits by ${fmtInt(c.depositors)} wallets${c.volume && p.volume ? ` ${delta(c.volume, p.volume)}` : ''}; ${fmtInt(c.new_depositors)} were first-time depositors.`,
    `- **Locked principal (TVL): ${fmtUsd(c.tvl_end)}** ${delta(c.tvl_end, p.tvl_end)}.`,
    `- ${fmtInt(c.withdrawals)} withdrawals (${fmtInt(c.early)} early, ${earlyShare}) returned ${fmtUsd(c.principal_withdrawn)} of principal.`,
    ``,
    `## This week vs previous week`,
    ``,
    `| Metric | This week | Previous week | Change |`,
    `|---|---:|---:|---|`,
    line('New users', fmtInt(c.new_users), c.new_users, p.new_users, fmtInt(p.new_users)),
    line(
      'Activated new users (≥1 confirmed deposit)',
      fmtInt(c.activated),
      c.activated,
      p.activated,
      fmtInt(p.activated)
    ),
    line('Deposits (confirmed)', fmtInt(c.deposits), c.deposits, p.deposits, fmtInt(p.deposits)),
    line('Deposit volume', fmtUsd(c.volume), c.volume, p.volume, fmtUsd(p.volume)),
    line('Unique depositors', fmtInt(c.depositors), c.depositors, p.depositors, fmtInt(p.depositors)),
    line(
      'First-time depositors',
      fmtInt(c.new_depositors),
      c.new_depositors,
      p.new_depositors,
      fmtInt(p.new_depositors)
    ),
    line('Withdrawals', fmtInt(c.withdrawals), c.withdrawals, p.withdrawals, fmtInt(p.withdrawals)),
    line('Early withdrawals', fmtInt(c.early), c.early, p.early, fmtInt(p.early)),
    line(
      'Principal withdrawn',
      fmtUsd(c.principal_withdrawn),
      c.principal_withdrawn,
      p.principal_withdrawn,
      fmtUsd(p.principal_withdrawn)
    ),
    line('Locked principal at week end', fmtUsd(c.tvl_end), c.tvl_end, p.tvl_end, fmtUsd(p.tvl_end)),
    line('Badges minted', fmtInt(c.badges), c.badges, p.badges, fmtInt(p.badges)),
    line('New follows', fmtInt(c.follows), c.follows, p.follows, fmtInt(p.follows)),
    line(
      'Users with a daily check-in',
      fmtInt(c.checkin_users),
      c.checkin_users,
      p.checkin_users,
      fmtInt(p.checkin_users)
    ),
    line(
      'Fiat on-ramp purchases settled',
      fmtInt(c.onramp_settled),
      c.onramp_settled,
      p.onramp_settled,
      fmtInt(p.onramp_settled)
    ),
    ``,
    `## All time`,
    ``,
    `| Metric | Value |`,
    `|---|---:|`,
    `| Users | ${fmtInt(t.users)} |`,
    `| Wallets that ever deposited | ${fmtInt(t.depositors)} (${t.users ? fmtPct(t.depositors / t.users) : '—'} of users) |`,
    `| Confirmed deposits | ${fmtInt(t.deposits)} |`,
    `| Total deposited | ${fmtUsd(t.volume)} |`,
    `| Locked principal (TVL) | ${fmtUsd(t.tvl)} across ${fmtInt(t.active_positions)} open positions |`,
    `| Badges minted | ${fmtInt(t.badges)} |`,
    ``,
    `_Definitions: "activated" = a profile with at least one confirmed deposit; "early" = withdrawn before the lock period ended; TVL = confirmed principal minus withdrawn principal (yield excluded). Source: Vaquita Postgres (deposits, withdrawals, profiles, badge_claims, follows, profiles_rewards, onramp_purchases)._`,
    ``,
  ].join('\n');
}

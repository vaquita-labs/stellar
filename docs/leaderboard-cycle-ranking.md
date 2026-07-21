# Leaderboard Cycle Ranking

Vaquita has one configured cycle model for both the visible leaderboard and
leaderboard medal badges.

## Cycle Source

The singleton `config.cycle_duration_ms` value controls cycle boundaries:

- `NULL`: production UTC calendar-month cycles. Cycle IDs use `YYYYMM`.
- Positive value: fixed-duration test cycles. Cycle IDs use the cycle start as
  Unix epoch seconds.

Shared helpers in `packages/shared/src/services/leaderboard` resolve current
and last-closed cycle IDs so API, badge, and web code do not recompute
boundaries separately.

## Visible Leaderboard

`GET /api/v1/leaderboard` is the authoritative ranked list for the web
leaderboard.

Supported query modes:

- Omitted `cycle`, or `cycle=current`: current open configured cycle.
- `cycle=last_closed`: the most recent fully closed configured cycle.
- `cycle=<id>`: explicit cycle ID for debugging or historical inspection.

Rows include:

```ts
{
  position: number;
  walletAddress: string;
  nickname: string;
  avatarUrl: string;
  badges: number;
  streak: number;
  experience: number;
  score: number;
  activeAmount: number;
  cycleId: number;
  cycleStart: number;
  cycleEnd: number;
  cycleStatus: 'current' | 'last_closed' | 'historical';
}
```

The web leaderboard uses `position` directly from this response. It no longer
sorts `/profile/by-average-deposits` rows by `totalSums / count`.

`/profile/by-average-deposits` is deprecated as a leaderboard source. It can
remain temporarily for compatibility with older profile-average views, but it
must not drive leaderboard rank.

## Medal Eligibility

Leaderboard medal badges use the last closed configured cycle, not the currently
visible open cycle:

- `first-place`: rank `1`.
- `second-place`: rank `2`.
- `third-place`: ranks `3` through `10`.

Eligibility is computed live from deposits and withdrawals in this issue. Cycle
winners are not snapshotted yet, so future hardening may add immutable cycle
result snapshots.

# A profile with no nickname must not surface as a person

Several public GETs resolve a wallet through `getProfile()`, which is an upsert
(`packages/shared/src/services/profile/index.ts:298`): looking a wallet up
creates its row. The newest caller is the withdraw screen, which resolves every
saved destination to decide which list it belongs in — so a Binance address or a
hardware wallet gets a `profiles` row with `nickname` NULL.

**Decided: the row is fine.** A wallet the app had to look up is a wallet that
interacted with the app, and the row is where its future name, badges and
deposits would hang anyway. What must not happen is that a row with no nickname
is presented as a person: no leaderboard, no explore, no follow suggestions.

## 1. Where a nameless profile can surface today

| Surface | Shows it? | Why |
|---|---|---|
| Explore feed | No | `buildExplorePool` keeps only profiles with a nickname (`isDiscoverableProfile`), and `getProfiles()` already drops soft-deleted rows |
| Friends search | No | the SQL requires an `ILIKE` match on `nickname` or `full_name`, and NULL never matches (`packages/shared/src/services/follows/index.ts:80`) |
| Public profile page | No | the route is keyed by nickname (`/explore/[username]`); with no name there is no URL |
| Leaderboard | No | rows are built from deposits, not from profiles (`packages/shared/src/services/leaderboard/index.ts:358`), so `enrichLeaderboardRows` drops the ones whose wallet has no profile with a nickname — see step 1 |

A row created by a destination lookup has no deposits, so today it reaches
nothing. The leaderboard gap is real for a different population: someone who
deposited and never finished onboarding shows up as `@vaquero` + the last four
characters of their address (`LeaderboardCard.tsx:392`).

## 2. Plan

### Step 1 — Leaderboard — done

- [x] **The board ranks users of the app.** A wallet with confirmed deposits
      that never signed up is not a competitor with a place to protect: it is
      not in the game. `enrichLeaderboardRows` drops any row whose wallet has no
      profile with a nickname.
- [x] Dropped BEFORE the position is assigned, so the surviving rows are
      numbered 1…N with no holes. This is what makes hiding safe — the earlier
      objection (removing #3 promotes everyone under it over money that is
      really deposited) only holds while the board claims to rank deposits
      rather than players.
- [x] The weekly league needs no change of its own: `useWeeklyLeague` derives
      its cohort from `GET /api/v1/leaderboard`, so it inherits the filter.
- [x] `hasPublicProfile()` (`LeaderboardCard.tsx`, `LeagueBoard.tsx`) stays as a
      last-resort guard on the client — same role as the one in friend
      suggestions. It is no longer the mechanism: a nameless row should never
      reach the client now, and if one does, it renders without a link or a
      follow button instead of pointing at a page with nobody on it.

### Step 2 — The `full_name` gap in explore — done

- [x] `buildExplorePool` used to accept a profile whose `full_name` was set and
      whose `nickname` was NULL. `ExploreProfileRow` does not carry the full
      name, so that card rendered with the `@vaqueroXXXX` fallback — the exact
      thing the filter exists to prevent. The rule is now the nickname alone,
      in `isDiscoverableProfile`.
- [x] Friend suggestions keep the wider rule (`hasDisplayName`, in `follows`),
      and that is not an inconsistency to unify away: their DTO carries a
      display name, so a profile with only a full name renders there as a
      person. The two rules differ because the two cards render different
      fields.

### Step 3 — Keep it that way — done

- [x] `services/profile/naming.ts` holds the fact every surface is really
      asking about: `hasNickname`. `hasDisplayName` (nickname or full name)
      sits next to it, because a surface whose card draws a real name is
      answering a different, wider question — the rules differ because the
      cards do, and that is now written down where both live.
- [x] The server surfaces are built on it: `isDiscoverableProfile` (explore) is
      `hasNickname` plus an address, and `follows` imports `hasDisplayName`
      instead of redefining it. `ProfileNaming` takes `fullName` and
      `full_name` alike, so rows coming straight from Prisma and rows through
      `toProfileShape` both ask without translating.
- [x] Tests: `naming.test.ts` (6), `explore/index.test.ts` (4) and
      `LeaderboardCard.test.ts` (3) on the client. What the intent used to be —
      a comment inside a filter — now fails a run when it breaks.

**The client keeps its own copy on purpose.** `apps/web` imports nothing from
`@vaquita/shared` (zero occurrences), and that package pulls in Prisma at module
load, so importing the predicate would drag a server dependency into the browser
bundle to save one line. `hasPublicProfile` in `LeaderboardCard.tsx` is that
line.

**The one surface with no test is friends search.** Its rule lives inside raw
SQL (`nickname ILIKE … OR full_name ILIKE …`), which cannot be exercised without
a database — it is correct by construction (NULL never matches a LIKE) rather
than by assertion. If that query ever grows a fallback for nameless rows, this
is where it would slip through unnoticed.

## 3. What this does not change

- The upsert stays. Removing it is a different conversation, and 32 call sites
  in the API routes reach `getProfile()`.
- The rows created by a bot are a separate problem: those DO have nicknames,
  which is what makes them squat the namespace. See `signup-bot-hardening.md`.
  So `hasNickname` answers "can this be shown as a person", never "is this
  account legitimate" — a bot row passes it. Deciding that someone is real needs
  a signal that costs the claimer something (a confirmed deposit, account age, a
  verified session), and no predicate does that today. The caveat is written
  into the docstring so nobody borrows this one for it.
- The withdraw screen keeps classifying a destination by whether its address has
  a nickname; that is what `withdraw-nickname-lookup.md` covers.

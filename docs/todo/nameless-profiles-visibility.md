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
| Explore feed | No | `buildExplorePool` keeps only profiles with a nickname or a `full_name` (`packages/shared/src/services/explore/index.ts:121`) |
| Friends search | No | the SQL requires an `ILIKE` match on `nickname` or `full_name`, and NULL never matches (`packages/shared/src/services/follows/index.ts:80`) |
| Public profile page | No | the route is keyed by nickname (`/explore/[username]`); with no name there is no URL |
| Leaderboard | As a row, yes; as a person, no | rows are built from deposits, not from profiles (`packages/shared/src/services/leaderboard/index.ts:358`), so a nameless depositor keeps its position — see step 1 |

A row created by a destination lookup has no deposits, so today it reaches
nothing. The leaderboard gap is real for a different population: someone who
deposited and never finished onboarding shows up as `@vaquero` + the last four
characters of their address (`LeaderboardCard.tsx:392`).

## 2. Plan

### Step 1 — Leaderboard — done

- [x] The rule: a depositor with no nickname **keeps its position and its
      stats** and stops being a person. No link to a profile, no follow button,
      no hover lift. The place was earned by depositing, not by picking a name.
- [x] Hiding the row was rejected. Positions are consecutive, so dropping #3
      promotes everyone under it and takes a real depositor off the board to
      punish a missing name.
- [x] `hasPublicProfile()` (`LeaderboardCard.tsx`) is the predicate, used by the
      card and by the weekly-league row (`LeagueBoard.tsx`). Being presentation
      and not a filter, it can live in the component: no row leaves the page, so
      page sizes and offsets are untouched — the reason a *filter* would have
      had to go in the query instead.

### Step 2 — Close the `full_name` gap in explore

- [ ] `buildExplorePool` accepts a profile whose `full_name` is set but whose
      `nickname` is NULL. That card renders with an empty nickname and the
      fallback handle — the exact thing the filter exists to prevent. The
      condition should be the nickname alone.

### Step 3 — Keep it that way

- [ ] One place that answers "is this profile presentable?" (a nickname that is
      set and not soft-deleted), used by explore, search, suggestions and the
      leaderboard, instead of each surface re-deriving it.
- [ ] A test per surface asserting that a nickname-less profile does not come
      back. The explore filter already has the intent written in a comment;
      nothing enforces it.

## 3. What this does not change

- The upsert stays. Removing it is a different conversation, and 32 call sites
  in the API routes reach `getProfile()`.
- The rows created by a bot are a separate problem: those DO have nicknames,
  which is what makes them squat the namespace. See `signup-bot-hardening.md`.
- The withdraw screen keeps classifying a destination by whether its address has
  a nickname; that is what `withdraw-nickname-lookup.md` covers.

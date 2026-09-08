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
- The withdraw screen keeps classifying a destination by whether its address has
  a nickname; that is what `withdraw-nickname-lookup.md` covers.

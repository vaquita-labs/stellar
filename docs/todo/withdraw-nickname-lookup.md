# The withdraw screen resolves nicknames one address at a time — and each lookup writes

Splitting the withdraw destinations by whether the ADDRESS has a profile is the
right rule (`d9974e5`): the stored label is a snapshot the user typed once, and
the same address saved as "My wallet" used to be invisible in the users list.
What the rule costs today is one HTTP request per saved destination, against an
endpoint that CREATES a row when it does not find one.

## 1. Where it happens

`apps/web/src/core-ui/hooks/profile/useNicknamesByAddress.ts:29` opens one
`useQueries` entry per unique address:

```ts
const results = useQueries({
  queries: unique.map((address) => ({
    queryKey: ['nickname-by-address', address],
    queryFn: async () => fetch(`${SERVICES_URL}/api/v1/profile/wallet/${address}`),
    staleTime: 60_000,
    refetchOnMount: 'always',
    retry: 1,
  })),
});
```

The caller passes every saved wallet (`WithdrawModal.tsx:143`), and
`refetchOnMount: 'always'` means the 60-second `staleTime` never spares a mount:
**opening the withdraw modal fires N requests**, N being how many destinations
the user has saved. There is no rate limiting anywhere in the API
(`apps/api/src/app-api.ts:25`, see `signup-bot-hardening.md`).

## 2. The lookup writes

`GET /api/v1/profile/wallet/:walletAddress` (`apps/api/src/routes/profile/route.ts:52`)
resolves through `getProfile()`, which is an **upsert**
(`packages/shared/src/services/profile/index.ts:298`):

```ts
const profile = await prisma.profile.upsert({
  where: { walletAddress },
  update: {},
  create: { walletAddress },
});
```

So opening the withdraw screen **inserts a `profiles` row for every saved
destination that is not a user** — the Binance address, the hardware wallet, a
friend's exchange deposit address. Rows with `nickname` NULL and
`onboarding_completed = false`.

Those rows are accepted: a wallet the app had to look up is a wallet that
interacted with the app. What is gated instead is their visibility — a profile
with no nickname must not surface as a person, which is
`nameless-profiles-visibility.md`.

Two consequences worth knowing before touching this code:

- The classification still lands correctly, but **not through the 404 branch**.
  After the upsert the endpoint answers 200 with `nickname: null`, so the hook
  reads "not a user" from the null nickname. The `if (response.status === 404)`
  line is effectively unreachable for a well-formed address.
- The endpoint also does work nobody here needs: `getNetworkName()` plus
  `getAcceptedPolicyVersion()` plus the whole profile DTO, to read one string.

## 3. Plan

### Step 1 — One request instead of N

- [ ] Batch endpoint taking a list of addresses and answering
      `{ [address]: nickname | null }`, read-only, capped at a sane list length.
- [ ] `useNicknamesByAddress` collapses to a single query keyed by the sorted
      address list. The map it returns and the absent-means-unknown contract
      stay as they are — `WithdrawModal` does not change.

### Step 2 — Until the batch exists

- [ ] Drop `refetchOnMount: 'always'` and let `staleTime: 60_000` do its job.
      Partial relief only: it saves the repeat opens, not the first one, and a
      rename can then take up to a minute to show. Worth it only if the batch
      is far off.

## 4. What must not regress

A failed lookup settles as `null` and the destination stays visible with its
stored label (`useNicknamesByAddress.ts:56`, `58caabb`). An address that ends up
in NEITHER list disappears from the screen: the user is told they have no saved
destinations, and re-adding one hits the unique on (profile, address, network)
with a 409. Any rewrite of this hook keeps that property.

Current Leaderboard Score Formula [DEPRECATED]

> **What is the formula to be used on the leaderboard to calculate the scores?**

This document describes how the leaderboard score is currently calculated in the code base, end-to-end (background job → backend endpoint → frontend display).

## **TL;DR**

The score is a **time-weighted average of active USDC deposits over the last 30 days**.

```
score (average) = totalSums / count

where:
  totalSums = Σ (last 43,200 samples of total active deposits)
  count     = (ONE_DAY / HISTORICAL_DELAY) * 30 = 43,200
```

A sample is taken **every minute** by a background job and represents the sum of all deposits with state `DEPOSIT_SUCCESS` for that profile at that instant. The leaderboard is sorted by this average **in descending order**.

Because `count` is constant for every profile, sorting by `average` or by `totalSums` produces the same order — only the displayed magnitude changes.

## **Layer 1 — Background job: building the time series**

**File:** `src/app-job-deposits-history.ts`

Every `HISTORICAL_DELAY` (= `ONE_MINUTE` = 60,000 ms, defined in `src/config/constants.ts:6`), the job iterates over every profile and:

1. Sums all of the profile's deposits whose state is `DEPOSIT_SUCCESS`:

   ```
   for (const deposit of deposits) {
     if (deposit.state === DepositWithdrawalState.DEPOSIT_SUCCESS) {
       sum += deposit.amount || 0;
     }
   }
   ```

   (`src/app-job-deposits-history.ts:28-32`)

2. Pushes that `sum` onto the profile's `total_active_deposits` array:

   ```
   totalActiveDeposits.push(sum);
   await profileIncrement(profile.id, totalActiveDeposits, 1, timestamp);
   ```

   (`src/app-job-deposits-history.ts:42-44`)

**Result:** each profile has a time series with **one sample per minute** of the total active deposit amount at that instant.

## **Layer 2 — Backend endpoint: aggregating the score**

**File:** `src/routes/profile/route.ts`

### **Endpoint**

```
GET /network/:networkName/by-average-deposits
```

(`src/routes/profile/route.ts:286`)

### **Score calculation (**`toProfileHistoricResponseDTO`**, lines 258–283)**

```
let count = (ONE_DAY / HISTORICAL_DELAY) * 30;  // (86_400_000 / 60_000) * 30 = 43_200

const { data } = await getCachedProfilesDepositsByProfileId(profile.id);
const sums = (data?.total_active_deposits || []);

totalSums = sums.slice(-count).reduce((total, sum) => total + +sum, 0);
lastSum   = sums.slice(-1)?.[0] ?? 0;
```

| **Variable** | **Meaning**                                                   |
| ------------ | ------------------------------------------------------------- |
| `count`      | Number of 1-minute samples in 30 days = **43,200**            |
| `totalSums`  | Sum of the **last 43,200 samples** of `total_active_deposits` |
| `lastSum`    | Most recent sample (the current active-deposits total)        |
| `timestamp`  | Time of the last sample                                       |
| `delay`      | `HISTORICAL_DELAY` = 60,000 ms (sample interval)              |

### **Response shape**

```
{
  email, fullName, nickname, walletAddress,
  totalSums,   // Σ of the last 43,200 minute-samples
  lastSum,     // current active deposits
  count,       // 43,200
  timestamp,   // ms
  delay,       // 60,000
}
```

**The endpoint does not sort** — it simply returns the array. Sorting is the frontend's responsibility.

## **Layer 3 — Frontend: sorting and live display**

**File:** `apps/web/src/core-ui/components/pages/LeaderboardPage.tsx` (in `vaquita-labs-stellar`)

### **Sorting (lines 111–120)**

```
const walletsWithXP = useMemo(() => {
  return profiles
    .map((wallet) => ({
      ...wallet,
      average: wallet.count !== 0 ? wallet.totalSums / wallet.count : 0,
    }))
    .sort((a, b) => b.average - a.average);   // descending
}, [profiles]);
```

So the **canonical sort key** is:

```
average = totalSums / count
```

ordered descending.

### **Live display (**`Timer`**&#x20;component, lines 39–79)**

The displayed number is not the static `average` — it ticks every 100 ms (`DELAY = 100`) to extrapolate the average forward in real time using the latest sample:

```
const average = totalSums / count;

// each tick:
extraSum += lastSum * DELAY;
counter  += DELAY;

const total = (average * delay * count) / counter + extraSum / counter;
```

Breaking the expression down:

* `delay * count` = the 30-day window in ms

* `average * delay * count` = `totalSums * delay` → total "area" (USDC · ms) accumulated in the window

* `(average * delay * count) / counter` → time-weighted average, with the window expanding as time passes since the last sample

* `extraSum / counter` → extrapolated contribution of the **current** `lastSum` over the ms elapsed since the last sample

**Effect:** a smoothly ticking number (with 8 decimals — first 2 large, next 3 small, mimicking an XP counter) that approximates the live average between backend samples.

## **Full formula summary**

| **Layer**          | **Computation**                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------- |
| Job (every 1 min)  | `sample = Σ deposit.amount where state = DEPOSIT_SUCCESS` → push to `total_active_deposits[]` |
| Endpoint           | `totalSums = Σ last 43,200 samples`                                                           |
| Frontend (sort)    | `average = totalSums / count`, sorted descending                                              |
| Frontend (display) | `Timer` extrapolates `average` in real time using `lastSum` between samples                   |

### **Properties**

* **Equal-amount, equal-time deposits → equal score.**

  * 1,000 USDC active for 30 full days → score contribution `1,000 × 43,200 = 43,200,000`

  * 10,000 USDC active for 3 days → score contribution `10,000 × 4,320 = 43,200,000`

* **Withdrawing early reduces the score** (those minutes contribute 0).

* **Keeping deposits active over time increases it** (more non-zero samples in the window).

The score therefore rewards **amount × time-active**, not just amount or just count.

## **Source references**

* `src/config/constants.ts:1-6` — `ONE_DAY`, `HISTORICAL_DELAY`

* `src/app-job-deposits-history.ts:13-46` — sampling job

* `src/routes/profile/service.ts:112` — `getCachedProfilesDepositsByProfileId`

* `src/routes/profile/route.ts:258-283` — `toProfileHistoricResponseDTO` (score aggregation)

* `src/routes/profile/route.ts:286-302` — `GET /network/:networkName/by-average-deposits`

* `apps/web/src/core-ui/components/pages/LeaderboardPage.tsx:39-79` — `Timer` (live display)

* `apps/web/src/core-ui/components/pages/LeaderboardPage.tsx:111-120` — sort by `average` desc


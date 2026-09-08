# Auditing the locales: keys nothing reads, and strings nobody translated

`apps/web/src/core-ui/i18n/locales/{en,es,pt}.json` are edited by hand and nothing
checks them. Two things rot silently: keys left behind when a screen is rewritten,
and English that reaches Spanish and Portuguese untouched.

Both were swept once — `20c3d88` removed 206 dead keys, `285c1f6` translated 23 —
but a sweep is not a guarantee. This doc is the procedure to repeat it and the
list of calls that are still open.

## 1. Where it stands

As of `861cce5`: **1688 keys, identical set in all three locales, zero orphans.**
Nothing is missing from `es` or `pt` either — every key exists in all three.

What remains is the grey area: **46 keys in `es` and 39 in `pt` whose value is
byte-identical to English**. Most are correct that way. The ones that are not are
in section 4.

## 2. Finding dead keys

Flatten `en.json` to dot-paths and look for each one in the source. A key is dead
when no file mentions it, with two exceptions that are NOT dead:

- **Dynamic prefixes.** ``t(`shop.items.${id}`)`` means every key under
  `shop.items.` is reachable. Collect the prefixes by matching ``[`'"]prefix.${``
  and ``'prefix.' +`` and exempt anything under them. There are ~40 such prefixes
  today; missing one deletes a whole feature's strings.
- **i18next plurals.** `common.time.day_one` and `day_other` are reached through
  the base key `common.time.day` with a count. Strip
  `_(zero|one|two|few|many|other)$` and check the base too.

Scan the **whole monorepo**, not just `apps/web` — a string can be built in
`apps/api`. Include `e2e/`, which asserts on user-facing copy.

Spot-check anything that looks like a live feature before deleting. In the last
sweep `wallet.fiat.send.step*` looked alive because `SendFiatModal` has a
`StepKey` union with those exact names — the keys were dead anyway, replaced by
`groupConvert`/`groupConnect`/`groupSend`.

Then verify the other direction: every literal `t('a.b.c')` in the source must
resolve to a key that exists, base-key included. That catches an over-eager
delete before it ships.

## 3. Finding untranslated strings

Compare each locale value against English. Identical is a *candidate*, not a
finding — proper nouns, acronyms and pure placeholders are supposed to match.
Legitimately identical today:

- Product and brand names: `Blend`, `Vaquita`, `Beta Tester`, `StarMaker LATAM`,
  `Summit Sao Paulo 2026`, `Vault · Flexible`.
- Acronyms and units: `XP`, `USDC`, `TVL`, `apy`, `8 pm`.
- Country names that do not decline: `Bolivia`, `Colombia`, `Argentina (ARS)`.
- Pure interpolations: `{{title}}`, `{{body}}`, `<b>{{handle}}</b>`,
  `{{amount}} USDC`, `1 USDC ≈ {{amount}} {{currency}}`, `Base → Stellar`.
- Words Spanish and Portuguese share with English: `Total`, `Error`, `Normal`,
  `Metal`, `Color`, `Item`, `Afro`, `Chullo`, `logo`, `info`, `Email`, `Ideas`.

## 4. Calls still open

- [ ] **`Memo`** — `wallet.send.memo`, `withdraw.memoLabel`,
      `withdraw.addWallet.memo`, `withdraw.addWallet.memoField`, in both locales.
      Left as-is: it is the name of the Stellar field, and every wallet shows it
      that way. Translating it to "Nota" would desync the app from what the user
      sees elsewhere. Revisit only if the whole product decides to localise
      protocol terms.
- [ ] **`Status` in Portuguese** — `transactions.filters.status`,
      `transactions.details.status`, `portfolio.filters.status`. "Status" is
      current in Brazilian Portuguese; "Situação" is more formal. A register
      decision, not a correction. Unanswered.
- [ ] **`Hrs` in Portuguese** — `rewards.countdown.hrs`. Spanish took "Hs";
      Portuguese kept "Hrs", which reads fine but was never actually decided.
- [ ] **Alt text** — `shell.loader.alt` ("logo"), `deposit.savingsStats.infoAlt`
      ("info"), `onboarding.intro.slides.welcome.imageAlt` ("Vaquita"). Screen
      readers announce these. Low stakes, but they are the only strings on this
      list a user cannot see to complain about.

## 5. Worth automating

- [ ] A test that fails when the three locales stop sharing a key set. That alone
      prevents the most common breakage — a key added to `en` and forgotten in the
      other two, which ships as a raw dot-path on screen.
- [ ] A CI check for keys the source never reads, with the dynamic-prefix and
      plural exemptions above. Report, do not delete: the exemptions are
      heuristics and a false positive removes user-facing copy.

## 6. What must not regress

- **The three locales keep the same key set.** i18next falls back to the key
  itself, so a missing translation renders `wallet.fiat.ramp.title` on screen.
- **Defaults in code are not the source of truth.** `t('a.b', 'Some text')`
  carries a default, so a deleted key still renders in English and the loss is
  invisible in review. The JSON is what has to be right.

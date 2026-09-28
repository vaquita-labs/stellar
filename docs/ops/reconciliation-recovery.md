# Reconciliation — cursor hazard and manual recovery

The design of both repair paths is in `CLAUDE.md` → **Reconciliation**. This file holds the
incident and the recovery procedure.

**The cursor hazard.** The scheduled job advances its cursor to the end of the *requested* window,
not to the last ledger it actually read. A paging bug therefore skips events permanently: rerunning
the job cannot recover them, because the cursor is already past. This happened on production on
2026-09-12 — a run over ledgers 64270203-64391162 read only the first page and still advanced,
orphaning deposit 74. Recovery is a bounded manual dispatch, which never touches the live cursor:

```bash
gh workflow run reconcile-vaquita-pool.yml --ref main \
  -f target_environment=prod -f dry_run=true -f advance_cursor=false \
  -f from_ledger=<n> -f to_ledger=<n>
```

Run it with `dry_run=true` first and read `plannedWithdrawalRepairs` in the step summary; the
repairs are listed individually, so check what each one targets before rerunning with
`dry_run=false`. Keep `advance_cursor=false` both times.

`applyWithdrawalRepair` writes status, transaction hash, raw event, `confirmed_at` and `reward`
only — it deliberately never sets `transfer_amount` or `interest`, so those stay null on a
reconciled row. That is by design, not a failed repair.

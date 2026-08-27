# Vaquita — SCF Tranche 3 (Mainnet): Deliverable Evidence

Single entry point for the review of Tranche 3. Each deliverable below has its own
report, and every report maps the SCF completion criteria — quoted verbatim — to the
artifact that proves it: a contract address on Stellar Expert, a public dashboard, a CI
run, a document in this repository, or a recording.

**Project:** Vaquita — Gamified Savings (SCF #42)
**Tranche:** 3 — Mainnet
**Repository:** [`vaquita-labs/stellar`](https://github.com/vaquita-labs/stellar)
**Network under review:** Stellar mainnet (public network)
**Last updated:** 2026-08-27

---

## 1. Status at a glance

| # | Deliverable | Report | Status |
|---|---|---|---|
| 3.1 | Anclap On/Off Ramp Integration | [`3.1-anclap-on-off-ramp.md`](./3.1-anclap-on-off-ramp.md) | **Met** — flow demonstrated end to end; KYC served in Spanish by the anchor |
| 3.2 | Mainnet Contract Deployment and Live Yields | [`3.2-mainnet-deployment-and-live-yields.md`](./3.2-mainnet-deployment-and-live-yields.md) | **Met** — six addresses live, TVL listed on DeFiLlama, both dashboards public |
| 3.3 | Full UX Readiness | [`3.3-full-ux-readiness.md`](./3.3-full-ux-readiness.md) | **Partially met** — FAQ published; onboarding recording and mobile verification outstanding |
| | *Work plan behind 3.3* | [`3.3-ux-readiness-work-plan.md`](./3.3-ux-readiness-work-plan.md) | Owners, breakdown and schedule |
| 3.4 | End to End Testing | [`3.4-end-to-end-testing.md`](./3.4-end-to-end-testing.md) | **In progress** — automated suites implemented; manual wallet regression being filled, CI pass-rate report follows |
| 3.5 | Internal Security Review and Technical Documentation | [`3.5-security-review-and-documentation.md`](./3.5-security-review-and-documentation.md) | **Met** — security report and architecture published, zero unresolved HIGH findings |

Status vocabulary used across all five reports:

- **Met** — every completion criterion has a verifiable artifact.
- **Partially met** — at least one criterion is proven and at least one is not.
- **In progress** — the artifacts exist and pass; the evidence a reviewer needs is still being assembled.

A criterion is only marked as proven when the artifact is reachable by a third party
without credentials. Internal-only links do not count as evidence.

---

## 2. Mainnet addresses

Every address below is live on the Stellar public network and independently verifiable
on Stellar Expert. The application reads them from `GET /api/v1/config`; they are never
hardcoded in the frontend.

| Role | Address | Explorer |
|---|---|---|
| Vaquita pool (`vaquita-pool`) | `CDTTAZ3NK4MMDHK2C3I6LRDT4YADJZ2QXINKLKQNZUVX7OTUKQNCQGC4` | [Stellar Expert](https://stellar.expert/explorer/public/contract/CDTTAZ3NK4MMDHK2C3I6LRDT4YADJZ2QXINKLKQNZUVX7OTUKQNCQGC4) |
| Badges (`vaquita-badges`) | `CBT5JMDOUAU3BJF7YZR42LVODLMZSQE4LIJUJNUBKEC2VZOXIF4JFBRU` | [Stellar Expert](https://stellar.expert/explorer/public/contract/CBT5JMDOUAU3BJF7YZR42LVODLMZSQE4LIJUJNUBKEC2VZOXIF4JFBRU) |
| DeFindex vault | `CB2U6PWS225PXWOAYGFIAWXYJBQHBWBQHEPC6NU2M257DKBRLBGMUPUZ` | [Stellar Expert](https://stellar.expert/explorer/public/contract/CB2U6PWS225PXWOAYGFIAWXYJBQHBWBQHEPC6NU2M257DKBRLBGMUPUZ) |
| Blend pool | `CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD` | [Stellar Expert](https://stellar.expert/explorer/public/contract/CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD) |
| USDC (deposit token contract) | `CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75` | [Stellar Expert](https://stellar.expert/explorer/public/contract/CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75) |
| USDC issuer (Circle) | `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN` | [Stellar Expert](https://stellar.expert/explorer/public/account/GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN) |

Lock periods offered on mainnet: **30 / 90 / 180 days**.

---

## 3. Public dashboards and live surfaces

| Surface | URL |
|---|---|
| TVL (DeFiLlama) | https://defillama.com/protocol/vaquita-protocol |
| Grafana — Vaquita Pool | https://petiteattic1642.grafana.net/public-dashboards/a43b229811e444e58aff0431913bdc3c |
| Grafana — Infrastructure Overview | https://petiteattic1642.grafana.net/public-dashboards/5bc270d26ace4f53b43fb3f3d5956136 |
| Public FAQ | https://www.vaquita.fi/#faq |

---

## 4. Supporting documentation in this repository

The deliverable reports link into the technical documentation rather than restating it.
The documents a reviewer is most likely to want directly:

| Document | What it covers |
|---|---|
| [`../architecture.md`](../architecture.md) | System architecture: contracts, services, data flow, trust boundaries |
| [`../security-review.md`](../security-review.md) | Internal security review — all findings, severity, resolution status |
| [`../scout-soroban-report.md`](../scout-soroban-report.md) | CoinFabrik Scout run, raw output and triage |
| [`../soroban-analyzer-report.md`](../soroban-analyzer-report.md) | xycloo soroban-analyzer run and triage |
| [`../contracts-security-findings-checklist.md`](../contracts-security-findings-checklist.md) | Remediation checklist per finding |
| [`../testing.md`](../testing.md) | Test strategy: which layer covers what, how to run it, what CI reports |
| [`../qa/e2e-coverage-map.md`](../qa/e2e-coverage-map.md) | Requirement → test artifact map for deliverable 3.4 |
| [`../qa/wallet-regression-matrix.md`](../qa/wallet-regression-matrix.md) | Manual wallet regression protocol and results |
| [`../mainnet-readiness-runbook.md`](../mainnet-readiness-runbook.md) | Mainnet deployment procedure and approval boundaries |

---

## 5. Outstanding items

Consolidated from the five reports, so a reviewer can see in one place what is not yet
proven. Each item is expanded in the report it belongs to. Every item below is worded
directly from a completion criterion; nothing here is optional.

| # | Outstanding item | Deliverable |
|---|---|---|
| 1 | Spanish onboarding screen recording, empty wallet → first active deposit | 3.3 |
| 2 | iOS Safari and Android Chrome verification on physical devices | 3.3 |
| 3 | Manual wallet regression completed across Freighter, Albedo and ≥3 further wallets | 3.4 |
| 4 | CI run URLs and the computed pass rate on critical flows | 3.4 |

Named in a deliverable description but **not** in any completion criterion, and therefore
not blocking sign-off:

| Item | Deliverable | Where it comes from |
|---|---|---|
| UX/UI engineering assets library | 3.5 | The description names an assets library alongside the UX documentation; the completion criteria ask only for published technical docs covering system architecture and UX Engineering, which are in place |

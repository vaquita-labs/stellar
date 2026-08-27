# Vaquita — SCF Tranche 3 (Mainnet): Deliverable Evidence

Single entry point for the review of Tranche 3. Each deliverable has its own report, and
every report maps the SCF completion criteria — quoted verbatim — to the artifact that
proves it.

**Project:** Vaquita — Gamified Savings (SCF #42)
**Tranche:** 3 — Mainnet
**Repository:** [`vaquita-labs/stellar`](https://github.com/vaquita-labs/stellar)
**Network under review:** Stellar mainnet (public network)

---

## 1. Deliverables

| # | Deliverable | Report | Status |
|---|---|---|---|
| 3.1 | Anclap On/Off Ramp Integration | [`3.1-anclap-on-off-ramp.md`](./3.1-anclap-on-off-ramp.md) | **Met** |
| 3.2 | Mainnet Contract Deployment and Live Yields | [`3.2-mainnet-deployment-and-live-yields.md`](./3.2-mainnet-deployment-and-live-yields.md) | **Met** |
| 3.3 | Full UX Readiness | [`3.3-full-ux-readiness.md`](./3.3-full-ux-readiness.md) | In progress |
| 3.4 | End to End Testing | [`3.4-end-to-end-testing.md`](./3.4-end-to-end-testing.md) | Partially met |
| 3.5 | Internal Security Review and Technical Documentation | [`3.5-security-review-and-documentation.md`](./3.5-security-review-and-documentation.md) | **Met** |

## 2. Mainnet addresses

Six addresses, each live on the Stellar public network and verifiable on Stellar Expert.
Two are Vaquita's own Soroban contracts, built in this repository under `contracts/`; the
other four are the third-party and asset contracts the deployment binds to. The
application reads them from `GET /api/v1/config`; they are never hardcoded.

| Role | Address | Explorer |
|---|---|---|
| Vaquita pool (`vaquita-pool`) | `CDTTAZ3NK4MMDHK2C3I6LRDT4YADJZ2QXINKLKQNZUVX7OTUKQNCQGC4` | [Stellar Expert](https://stellar.expert/explorer/public/contract/CDTTAZ3NK4MMDHK2C3I6LRDT4YADJZ2QXINKLKQNZUVX7OTUKQNCQGC4) |
| Badges (`vaquita-badges`) | `CBT5JMDOUAU3BJF7YZR42LVODLMZSQE4LIJUJNUBKEC2VZOXIF4JFBRU` | [Stellar Expert](https://stellar.expert/explorer/public/contract/CBT5JMDOUAU3BJF7YZR42LVODLMZSQE4LIJUJNUBKEC2VZOXIF4JFBRU) |
| DeFindex vault | `CB2U6PWS225PXWOAYGFIAWXYJBQHBWBQHEPC6NU2M257DKBRLBGMUPUZ` | [Stellar Expert](https://stellar.expert/explorer/public/contract/CB2U6PWS225PXWOAYGFIAWXYJBQHBWBQHEPC6NU2M257DKBRLBGMUPUZ) |
| Blend pool | `CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD` | [Stellar Expert](https://stellar.expert/explorer/public/contract/CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD) |
| USDC (deposit token contract) | `CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75` | [Stellar Expert](https://stellar.expert/explorer/public/contract/CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75) |
| USDC issuer (Circle) | `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN` | [Stellar Expert](https://stellar.expert/explorer/public/account/GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN) |

Lock periods offered on mainnet: **30 / 90 / 180 days**.

## 3. Public dashboards and live surfaces

| Surface | URL |
|---|---|
| TVL (DeFiLlama) | https://defillama.com/protocol/vaquita-protocol |
| Grafana — Vaquita Pool | https://petiteattic1642.grafana.net/public-dashboards/a43b229811e444e58aff0431913bdc3c |
| Grafana — Infrastructure Overview | https://petiteattic1642.grafana.net/public-dashboards/5bc270d26ace4f53b43fb3f3d5956136 |
| Public FAQ | https://www.vaquita.fi/#faq |

## 4. Technical documentation

| Document | Covers |
|---|---|
| [`../architecture.md`](../architecture.md) | System architecture: contracts, services, data flow, trust boundaries |
| [`../security-review.md`](../security-review.md) | Internal security review — all findings, severity, resolution status |
| [`../scout-soroban-report.md`](../scout-soroban-report.md) | CoinFabrik Scout run and triage |
| [`../soroban-analyzer-report.md`](../soroban-analyzer-report.md) | xycloo soroban-analyzer run and triage |
| [`../contracts-security-findings-checklist.md`](../contracts-security-findings-checklist.md) | Remediation checklist per finding |
| [`../testing.md`](../testing.md) | Test strategy: which layer covers what, how to run it, what CI reports |
| [`../qa/e2e-coverage-map.md`](../qa/e2e-coverage-map.md) | Requirement → test artifact map for deliverable 3.4 |
| [`../qa/wallet-regression-matrix.md`](../qa/wallet-regression-matrix.md) | Manual wallet regression protocol |
| [`../mainnet-readiness-runbook.md`](../mainnet-readiness-runbook.md) | Mainnet deployment procedure and approval boundaries |
| [`3.3-ux-readiness-work-plan.md`](./3.3-ux-readiness-work-plan.md) | UX engineering: entry paths, i18n architecture, error handling, mobile matrix |

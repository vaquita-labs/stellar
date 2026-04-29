# Vaquita Protocol

## 1. Context and Current System

- What system, product, or infrastructure are you working on?
Web-based application hosted on Next.JS
Smart contract layer for asset tokenization
API services for blockchain data retrieval

- Briefly describe the current architecture:
  - Which components exist today?
    Interactive 3D visualization layer for representing tokenized assets (properties, land parcels)
    User wallet integration system (currently showing a wallet address)
    Financial metrics display (5.89% - potentially representing yield, interest rate, or APY)
    Navigation system for exploring different asset views
  - How does Stellar (or Soroban) already fit into this, if at all?
    Using soroban for the smart contracts we already have and defindex to give easily yield to users. Also Anclap to give a full account abstraction onboarding experience.
- Who are the current users or integrators?
  Web3 users mostly since you need to connect a wallet or send crypto directly.

If you have a diagram or link to existing docs, reference it here.
https://drive.google.com/file/d/1eP5yhM0CTXQzBoYqMWGXm8Z42Sk0qXuf/view?usp=drive_link

## 2. Technical Pain Points

What are the main **technical problems** or bottlenecks today?
We need more gamification to complete our vision. Better defi provider. 3D Modeling efficiency to create new items. 

- Performance issues (latency, throughput, reliability)
  Scale a 3d world easily without affect visual reliability
- Scalability limitations
  3d Visuals
- Poor developer experience or tooling gaps
  trustline to activate wallet
- UX or integration friction
  Anclap takes 3% of the onramped money, thats already 6 months of the rewards we give. There is no too many cheap options to onramp from ARS. And there is none for BOP. 
- Security or robustness concerns
  Audits for smart contracts

List 2–4 specific pain points.
Easy and cheap Onramp.
3D Gamification without loosing efficiency.


## 3. Technical Improvement Goal (Hackathon Scope)

Clearly define what you want to improve during Stellar Hack+:
Connect with defindex. Integrate with stellar soroban and Anclap to give full onboarding experience. Also, add daily check ins with in game coins rewards.

- **Primary goal:**
  (e.g., reduce checkout latency, improve indexer reliability, add Soroban-based module, simplify integration for third-party devs, etc.)
Add gamification features. Improve yield. Simplify DeFi languages (APY, APR, Yield, USDC, etc)

- **Scope for the hackathon:**
  What is realistic to achieve within the event?
Integrate defindex directly without any other logic than staking and add the UX on top of it to give a better a gamified onboarding to DeFi.

## 4. Baseline Metrics or Qualitative Baseline

Document your **starting point** before making changes.

If you have metrics, include them:

- Current average latency: ______
- Error rate: ______
- Throughput (TPS / RPS): ______
- Resource usage: ______
- Other relevant KPIs: ______

If you don’t have exact metrics yet, describe the qualitative baseline (what is currently happening, where failures or slowdowns appear, etc.) and how you plan to measure it.

## 5. Planned Changes / Approach

Describe your **plan of attack** for the hackathon:

- Which components will you touch?
    Yield provider
    Interactive 3D visualization layer for representing tokenized assets (properties, land parcels)
    In game coins generated based on deposit and time
    Marketplace and editing frame to buy items

- Which **Stellar / Soroban / SDK / protocol** pieces will you integrate or modify?
Yield agregators like DeFindex

- Are you adding new services, refactoring existing ones, or both?
Both

Optionally, outline your changes in phases:

1. Phase 1 – (e.g., add metrics & observability)
2. Phase 2 – (e.g., implement Soroban contract / new integration)
3. Phase 3 – (e.g., optimization, tuning, cleanup)


## 6. Validation Hypothesis

What do you expect to prove or disprove by the end of the hackathon?

- Hypothesis: “If we implement Gamification features, we will see a notable increment in active users.”
- How you will validate:
  - Which metrics or tests will you run?
  Active daily users.
  - What would count as a **successful improvement**?
  Fully deployed makertplaces with in game items. Yield coming from defindex.

## 7. Planned Measurement and Tooling

- What tools will you use to measure success? (e.g., logs, dashboards, benchmarks, profiling, test harnesses)
Vercel analytics and Posthog.
- How will you compare **before vs after**?
  Check active daily users today and at the end of the hackathon

## 8. Team

- Team name: Vaquita
- Members and roles:
-   Leandro Conti, CEO. linktr.ee/contilean
-   Alejandro Alvarez, CPO.
-   Fabio Laura, CTO.

## 9. Contract

[Vaquita Pool contract in Soroban testnet](https://lab.stellar.org/r/testnet/contract/CDKCKHTRKFJXVKLICHPIXAPLIVDRBDQEEGJYDKFOTUV35APVNOGTWZW7)

## 10. Integration

The current integration uses:

- [Blend USDC](https://github.com/blend-capital/blend-utils/blob/main/testnet.contracts.json)
- [DeFindex USDC_blend_strategy](https://github.com/paltalabs/defindex/blob/main/public/testnet.contracts.json)

Check for updates when testnet resets